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

/**
 * A MailProvider that sends messages via SMTP (nodemailer) and receives via IMAP (imapflow).
 * Fetches only messages not yet marked with the custom IMAP keyword $FriendlymailProcessed,
 * then marks them after fetching. This survives daemon restarts and doesn't conflict with
 * mail clients that only set \Seen.
 *
 * Sent messages are buffered in memory and merged into the next getMessages() result,
 * matching TestMessageProvider behaviour so that the MessageProcessor can track
 * the host's own sent messages (posts, notifications) via their X-friendlymail header.
 */
export class EmailMailProvider extends MailProvider implements IEmailMailProvider {
    private _smtpConfig: SmtpConfig;
    private _imapConfig: ImapConfig;
    private _sentBuffer: SimpleMessageWithMessageId[] = [];

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

    /**
     * Send a draft message via SMTP.
     * Encodes the draft's messageType into the X-friendlymail header.
     * Adds the sent message to the buffer so getMessages() returns it next poll,
     * allowing MessageProcessor to track the host's own sent messages.
     */
    async sendDraft(draft: MessageDraft): Promise<void> {
        if (!draft.isReadyToSend()) {
            throw new Error('Draft is not ready to send');
        }

        const xFriendlymail = draft.messageType !== null
            ? encodeQuotedPrintable(JSON.stringify({ messageType: draft.messageType }))
            : undefined;

        const transporter = nodemailer.createTransport({
            ...this._smtpConfig,
            tls: { rejectUnauthorized: !this._smtpConfig.allowSelfSigned }
        });

        const headers: Record<string, string> = {};
        if (xFriendlymail) {
            headers['X-friendlymail'] = xFriendlymail;
        }

        await transporter.sendMail({
            from: draft.from!.toString(),
            to: draft.to.map(a => a.toString()).join(', '),
            subject: draft.subject,
            text: draft.body,
            ...(draft.html ? { html: draft.html } : {}),
            headers
        });

        // Buffer the sent message so it's included in the next getMessages() call
        this._sentBuffer.push(new SimpleMessageWithMessageId(
            draft.from!,
            draft.to,
            draft.subject,
            draft.body,
            new Date(),
            xFriendlymail
        ));
    }

    /**
     * Fetch unprocessed messages from the IMAP INBOX and merge with buffered sent messages.
     * "Unprocessed" means not yet tagged with the $FriendlymailProcessed keyword.
     * Fetched messages are tagged immediately so they are skipped on the next poll,
     * even after a daemon restart.
     */
    async getMessages(): Promise<SimpleMessageWithMessageId[]> {
        const client = new ImapFlow({
            host: this._imapConfig.host,
            port: this._imapConfig.port,
            secure: this._imapConfig.secure,
            auth: this._imapConfig.auth,
            logger: false,
            tls: { rejectUnauthorized: !this._imapConfig.allowSelfSigned }
        });

        await client.connect();

        const messages: SimpleMessageWithMessageId[] = [];
        const lock = await client.getMailboxLock('INBOX');

        try {
            // Find all messages not yet tagged as processed.
            const searchResult = await client.search({ unKeyword: PROCESSED_KEYWORD }, { uid: true });
            const unprocessedUids: number[] = searchResult === false ? [] : searchResult;

            if (unprocessedUids.length > 0) {
                const uidSet = unprocessedUids.join(',');

                for await (const msg of client.fetch(uidSet, { source: true, uid: true }, { uid: true })) {
                    if (!msg.source) continue;
                    const parsed: ParsedMail = await (simpleParser(msg.source) as unknown as Promise<ParsedMail>);

                    const from = EmailAddress.fromDisplayString(parsed.from?.text ?? '');
                    if (!from) continue;

                    const toField = parsed.to;
                    const toArray = Array.isArray(toField) ? toField : toField ? [toField] : [];
                    const to: EmailAddress[] = toArray
                        .flatMap(addrObj => addrObj.value)
                        .map(addr => EmailAddress.fromString(addr.address ?? ''))
                        .filter((a): a is EmailAddress => a !== null);

                    if (to.length === 0) continue;

                    const messageId = parsed.messageId ?? String(msg.uid);
                    const subject = parsed.subject ?? '';
                    const body = parsed.text ?? '';
                    const date = parsed.date ?? new Date();
                    const xFriendlymail = parsed.headers.get('x-friendlymail') as string | undefined;
                    const inReplyTo = parsed.inReplyTo;

                    messages.push(new EmailMessage(
                        from, to, subject, body, date,
                        xFriendlymail, messageId, inReplyTo
                    ));
                }

                // Mark all fetched messages as processed so they are skipped on future polls.
                await client.messageFlagsAdd(uidSet, [PROCESSED_KEYWORD], { uid: true });
            }
        } finally {
            lock.release();
        }

        await client.logout();

        // Drain the sent buffer and prepend to results (sent messages come before new inbound)
        const sent = this._sentBuffer.splice(0);
        return [...sent, ...messages];
    }
}
