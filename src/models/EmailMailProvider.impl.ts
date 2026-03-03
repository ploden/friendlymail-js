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

/**
 * A MailProvider that sends messages via SMTP (nodemailer) and receives via IMAP (imapflow).
 * Fetches only UNSEEN messages from the INBOX on each call to getMessages(),
 * relying on the IMAP \Seen flag to avoid returning the same message twice.
 */
export class EmailMailProvider extends MailProvider implements IEmailMailProvider {
    private _smtpConfig: SmtpConfig;
    private _imapConfig: ImapConfig;

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
     * @param draft The draft message to send
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
            headers
        });
    }

    /**
     * Fetch UNSEEN messages from the IMAP INBOX.
     * Each fetched message is automatically marked \Seen by the IMAP server,
     * so subsequent calls return only newly arrived messages.
     * @returns Promise resolving to an array of EmailMessage objects
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
            const uids: number[] = [];

            for await (const msg of client.fetch({ seen: false }, { source: true, uid: true })) {
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

                const subject = parsed.subject ?? '';
                const body = parsed.text ?? '';
                const date = parsed.date ?? new Date();
                const xFriendlymail = parsed.headers.get('x-friendlymail') as string | undefined;
                const messageId = parsed.messageId;
                const inReplyTo = parsed.inReplyTo;

                messages.push(new EmailMessage(
                    from, to, subject, body, date,
                    xFriendlymail, messageId, inReplyTo
                ));
                uids.push(msg.uid);
            }

            // Mark all fetched messages as \Seen so they aren't returned again next poll
            if (uids.length > 0) {
                await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
            }
        } finally {
            lock.release();
        }

        await client.logout();
        return messages;
    }
}
