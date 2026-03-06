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

const PROCESSED_KEYWORD = '$FriendlymailProcessed';

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
 * Deduplication strategy:
 * - INBOX: messages are tagged with $FriendlymailProcessed after fetching so they are
 *   never returned again, even after a daemon restart.
 * - Sent: after each sendDraft() the message is IMAP APPENDed to the Sent folder.
 *   getMessages() fetches all Sent messages not yet seen in this session (_loadedSentIds),
 *   giving MessageProcessor the full sent history on every run — including after restart.
 */
export class EmailMailProvider extends MailProvider implements IEmailMailProvider {
    private _smtpConfig: SmtpConfig;
    private _imapConfig: ImapConfig;
    private _loadedSentIds: Set<string> = new Set();

    constructor(smtpConfig: SmtpConfig, imapConfig: ImapConfig) {
        super();
        this._smtpConfig = smtpConfig;
        this._imapConfig = imapConfig;
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

        const info = await transporter.sendMail({
            from: draft.from!.toString(),
            to: draft.to.map(a => a.toString()).join(', '),
            subject: draft.subject,
            text: draft.body,
            ...(draft.html ? { html: draft.html } : {}),
            headers
        });

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
     * Fetch unprocessed INBOX messages and any new Sent messages.
     *
     * INBOX: only messages not yet tagged $FriendlymailProcessed are returned;
     * they are tagged immediately so they won't be returned on future polls.
     *
     * Sent: all messages not yet seen in this session are returned so
     * MessageProcessor has the full sent history. On restart _loadedSentIds
     * is empty, so the entire Sent folder is returned — giving MessageProcessor
     * enough context to avoid sending duplicate replies.
     */
    async getMessages(): Promise<SimpleMessageWithMessageId[]> {
        const client = this._makeImapClient();
        await client.connect();

        const messages: SimpleMessageWithMessageId[] = [];

        // — INBOX: new (unprocessed) messages —
        const inboxLock = await client.getMailboxLock('INBOX');
        try {
            const result = await client.search({ unKeyword: PROCESSED_KEYWORD }, { uid: true });
            const uids: number[] = result === false ? [] : result;

            if (uids.length > 0) {
                const uidSet = uids.join(',');
                for await (const msg of client.fetch(uidSet, { source: true, uid: true }, { uid: true })) {
                    if (!msg.source) continue;
                    const parsed = await parseImapMessage(msg.source, msg.uid);
                    if (parsed) messages.push(parsed);
                }
                await client.messageFlagsAdd(uidSet, [PROCESSED_KEYWORD], { uid: true });
            }
        } finally {
            inboxLock.release();
        }

        // — Sent: full history, new-to-this-session only —
        try {
            const sentLock = await client.getMailboxLock('Sent');
            try {
                const result = await client.search({ all: true }, { uid: true });
                const allUids: number[] = result === false ? [] : result;
                const newUids = allUids.filter(uid => !this._loadedSentIds.has(String(uid)));

                if (newUids.length > 0) {
                    const uidSet = newUids.join(',');
                    for await (const msg of client.fetch(uidSet, { source: true, uid: true }, { uid: true })) {
                        if (!msg.source) continue;
                        this._loadedSentIds.add(String(msg.uid));
                        const parsed = await parseImapMessage(msg.source, msg.uid);
                        if (parsed) messages.push(parsed);
                    }
                }
            } finally {
                sentLock.release();
            }
        } catch {
            // Sent folder doesn't exist yet (before any message has been sent).
        }

        await client.logout();

        return messages;
    }
}
