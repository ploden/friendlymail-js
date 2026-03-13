import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import * as nodemailer from 'nodemailer';
import { MailProvider } from './MailProvider.impl';
import { IEmailMailProvider, SmtpConfig, ImapConfig } from './EmailMailProvider.interface';
import { EmailAddress } from './EmailAddress.impl';
import { EmailMessage } from './EmailMessage.impl';
import { MessageDraft } from './MessageDraft.impl';
import { SimpleMessageWithMessageId } from './SimpleMessageWithMessageId.impl';
import { encodeQuotedPrintable } from '../utils/quotedPrintable';

/** Builds a minimal RFC 2822 message buffer suitable for IMAP APPEND. */
function buildRawMessage(
    from: string,
    to: string,
    subject: string,
    body: string,
    xFriendlymail?: string,
    messageId?: string
): Buffer {
    const date = new Date().toUTCString();
    const msgId = messageId ?? `<${Date.now()}.${Math.random().toString(36).slice(2)}@friendlymail>`;
    const lines = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        `Date: ${date}`,
        `Message-ID: ${msgId}`,
        `Content-Type: text/plain; charset=utf-8`,
    ];
    if (xFriendlymail) lines.push(`X-friendlymail: ${xFriendlymail}`);
    lines.push('', body);
    return Buffer.from(lines.join('\r\n'));
}

/** Parses a raw IMAP message source into an EmailMessage, or null if unparseable. */
async function parseImapMessage(source: Buffer, fallbackUid: number): Promise<EmailMessage | null> {
    const parsed: ParsedMail = await (simpleParser(source) as unknown as Promise<ParsedMail>);

    const from = EmailAddress.fromDisplayString(parsed.from?.text ?? '');
    if (!from) return null;

    const toField = parsed.to;
    const toArray = Array.isArray(toField) ? toField : toField ? [toField] : [];
    const to: EmailAddress[] = toArray
        .flatMap(addrObj => addrObj.value)
        .map(addr => EmailAddress.fromString(addr.address ?? ''))
        .filter((a): a is EmailAddress => a !== null);

    if (to.length === 0) return null;

    return new EmailMessage(
        from,
        to,
        parsed.subject ?? '',
        parsed.text ?? '',
        parsed.date ?? new Date(),
        parsed.headers.get('x-friendlymail') as string | undefined,
        parsed.messageId ?? String(fallbackUid),
        parsed.inReplyTo
    );
}

/**
 * A MailProvider that sends messages via SMTP (nodemailer) and receives via IMAP (imapflow).
 *
 * getMessages() returns all INBOX messages and all Sent messages on every call.
 * MessageStore deduplicates by messageId so MessageProcessor sees each message once.
 * MessageProcessor is responsible for all logic to avoid sending duplicate replies.
 * sendDraft() appends a copy to the IMAP Sent folder so MessageProcessor has full
 * sent history on every run, including after a daemon restart.
 */
export class EmailMailProvider extends MailProvider implements IEmailMailProvider {
    private _smtpConfig: SmtpConfig;
    private _imapConfig: ImapConfig;
    private _verbose: boolean;

    /**
     * @param smtpConfig SMTP connection settings
     * @param imapConfig IMAP connection settings
     * @param verbose When true, logs each fetched and sent message to stdout
     */
    constructor(smtpConfig: SmtpConfig, imapConfig: ImapConfig, verbose: boolean = false) {
        super();
        this._smtpConfig = smtpConfig;
        this._imapConfig = imapConfig;
        this._verbose = verbose;
    }

    get smtpConfig(): SmtpConfig {
        return this._smtpConfig;
    }

    get imapConfig(): ImapConfig {
        return this._imapConfig;
    }

    private _makeImapClient(): ImapFlow {
        return new ImapFlow({
            host: this._imapConfig.host,
            port: this._imapConfig.port,
            secure: this._imapConfig.secure,
            auth: this._imapConfig.auth,
            logger: false,
            tls: { rejectUnauthorized: !this._imapConfig.allowSelfSigned }
        });
    }

    /**
     * Send a draft message via SMTP, then save a copy to the IMAP Sent folder.
     * The Sent copy allows getMessages() to return it so MessageProcessor always
     * has full sent history — including across daemon restarts.
     */
    async sendDraft(draft: MessageDraft): Promise<void> {
        if (!draft.isReadyToSend()) {
            throw new Error('Draft is not ready to send');
        }

        const meta: Record<string, unknown> = {};
        if (draft.messageType !== null) meta.messageType = draft.messageType;
        if (draft.inReplyTo) meta.inReplyTo = draft.inReplyTo;
        if (draft.postData) meta.postData = draft.postData;
        const xFriendlymail = Object.keys(meta).length > 0
            ? encodeQuotedPrintable(JSON.stringify(meta))
            : undefined;

        const headers: Record<string, string> = {};
        if (xFriendlymail) headers['X-friendlymail'] = xFriendlymail;

        const transporter = nodemailer.createTransport({
            ...this._smtpConfig,
            tls: { rejectUnauthorized: !this._smtpConfig.allowSelfSigned }
        });

        if (this._verbose) {
            console.log(`[EmailMailProvider] sendDraft  to=${draft.to.map(a => a.toString()).join(', ')}  subject="${draft.subject}"  xFriendlymail=${xFriendlymail ?? '(none)'}`);
        }

        const info = await transporter.sendMail({
            from: draft.from!.toString(),
            to: draft.to.map(a => a.toString()).join(', '),
            subject: draft.subject,
            text: draft.body,
            ...(draft.html ? { html: draft.html } : {}),
            headers
        });

        if (this._verbose) {
            console.log(`[EmailMailProvider] sendDraft complete  messageId=${info.messageId}`);
        }

        // Append a copy to IMAP Sent so getMessages() can return it for MessageProcessor context.
        const rawMessage = buildRawMessage(
            draft.from!.toString(),
            draft.to.map(a => a.toString()).join(', '),
            draft.subject,
            draft.body,
            xFriendlymail,
            info.messageId
        );

        const client = this._makeImapClient();
        await client.connect();
        try {
            await client.mailboxCreate('Sent');
        } catch {
            // Ignore — mailbox already exists on most runs.
        }
        await client.append('Sent', rawMessage, ['\\Seen']);
        await client.logout();
    }

    /**
     * Fetch all INBOX messages and all Sent messages.
     * MessageStore deduplicates by messageId so repeated calls do not cause
     * MessageProcessor to process the same message more than once.
     */
    async getMessages(): Promise<SimpleMessageWithMessageId[]> {
        const client = this._makeImapClient();
        await client.connect();

        const messages: SimpleMessageWithMessageId[] = [];

        // — INBOX: all messages (or since sinceDate if configured) —
        const inboxLock = await client.getMailboxLock('INBOX');
        try {
            const searchCriteria = this._imapConfig.sinceDate ? { since: this._imapConfig.sinceDate } : { all: true as const };
            const result = await client.search(searchCriteria, { uid: true });
            const uids: number[] = result === false ? [] : result;

            if (uids.length > 0) {
                const uidSet = uids.join(',');
                for await (const msg of client.fetch(uidSet, { source: true, uid: true }, { uid: true })) {
                    if (!msg.source) continue;
                    const parsed = await parseImapMessage(msg.source, msg.uid);
                    if (parsed) {
                        messages.push(parsed);
                        if (this._verbose) {
                            console.log(`[EmailMailProvider] INBOX  uid=${msg.uid}  id=${parsed.messageId}  from=${parsed.from}  subject="${parsed.subject}"  xFriendlymail=${parsed.xFriendlymail ?? '(none)'}`);
                        }
                    }
                }
            }
        } finally {
            inboxLock.release();
        }
        if (this._verbose) {
            console.log(`[EmailMailProvider] INBOX fetch complete  count=${messages.length}`);
        }

        // — Sent: all messages —
        const sentCountBefore = messages.length;
        try {
            const sentLock = await client.getMailboxLock('Sent');
            try {
                const searchCriteria = this._imapConfig.sinceDate ? { since: this._imapConfig.sinceDate } : { all: true as const };
                const result = await client.search(searchCriteria, { uid: true });
                const uids: number[] = result === false ? [] : result;

                if (uids.length > 0) {
                    const uidSet = uids.join(',');
                    for await (const msg of client.fetch(uidSet, { source: true, uid: true }, { uid: true })) {
                        if (!msg.source) continue;
                        const parsed = await parseImapMessage(msg.source, msg.uid);
                        if (parsed) {
                            messages.push(parsed);
                            if (this._verbose) {
                                console.log(`[EmailMailProvider] Sent  uid=${msg.uid}  id=${parsed.messageId}  from=${parsed.from}  subject="${parsed.subject}"  xFriendlymail=${parsed.xFriendlymail ?? '(none)'}`);
                            }
                        }
                    }
                }
            } finally {
                sentLock.release();
            }
        } catch {
            // Sent folder doesn't exist yet (before any message has been sent).
        }
        if (this._verbose) {
            console.log(`[EmailMailProvider] Sent fetch complete  count=${messages.length - sentCountBefore}`);
        }

        await client.logout();

        return messages;
    }
}
