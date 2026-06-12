import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
import * as nodemailer from 'nodemailer';
import sharp from 'sharp';
import { MailProvider } from './MailProvider.impl';
import { IEmailMailProvider, SmtpConfig, ImapConfig } from './EmailMailProvider.interface';
import { EmailAddress } from './EmailAddress.impl';
import { EmailMessage } from './EmailMessage.impl';
import { MessageDraft } from './MessageDraft.impl';
import { SimpleMessageWithMessageId } from './SimpleMessageWithMessageId.impl';
import { encodeQuotedPrintable } from '../utils/quotedPrintable';
import { PhotoAttachment } from './PhotoAttachment';

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

/**
 * Logs the full source of a parsed FM message in verbose mode.
 * Prints all headers, text body, HTML body, and a summary of any MIME attachments.
 */
function logFmMessageSource(parsed: ParsedMail, mailbox: string, uid: number): void {
    const sep = '─'.repeat(72);
    console.log(`\n${sep}`);
    console.log(`=== FM MESSAGE SOURCE  [${mailbox}  uid=${uid}] ===`);
    console.log(sep);

    // Headers
    console.log('--- HEADERS ---');
    for (const [name, value] of parsed.headers) {
        const display = Array.isArray(value) ? value.join(', ') : String(value);
        console.log(`${name}: ${display}`);
    }

    // Text body
    if (parsed.text !== undefined && parsed.text !== null) {
        console.log('\n--- TEXT BODY ---');
        console.log(parsed.text);
    }

    // HTML body
    if (parsed.html) {
        console.log('\n--- HTML BODY ---');
        console.log(parsed.html);
    }

    // Non-text MIME parts / attachments
    if (parsed.attachments && parsed.attachments.length > 0) {
        console.log('\n--- ATTACHMENTS ---');
        for (const att of parsed.attachments) {
            const size = Buffer.isBuffer(att.content) ? att.content.length : 0;
            console.log(`  filename="${att.filename ?? '(unnamed)'}"  contentType=${att.contentType}  size=${size} bytes`);
        }
    }

    console.log(`${sep}\n`);
}

/**
 * Returns true if an email message qualifies as an FM message — either a
 * system-generated response (has X-friendlymail header) or an inbound FM
 * message identified by subject convention.
 */
function isFmMessage(msg: EmailMessage): boolean {
    if (msg.xFriendlymail !== undefined) return true;
    const s = msg.subject;
    return s === 'Fm' || s === 'fm' || s === '📻'
        || s.startsWith('Fm Like')
        || s.startsWith('Fm Comment');
}

/** Parses a raw IMAP message source into an EmailMessage, or null if unparseable. */
async function parseImapMessage(
    source: Buffer,
    fallbackUid: number,
    verboseDropLog?: (reason: string) => void,
): Promise<{ message: EmailMessage; parsed: ParsedMail } | null> {
    const parsed: ParsedMail = await (simpleParser(source) as unknown as Promise<ParsedMail>);

    const from = EmailAddress.fromDisplayString(parsed.from?.text ?? '');
    if (!from) {
        verboseDropLog?.(`unparseable From: "${parsed.from?.text ?? ''}"`);
        return null;
    }
    const senderName = parsed.from?.value?.[0]?.name || undefined;

    const toField = parsed.to;
    const toArray = Array.isArray(toField) ? toField : toField ? [toField] : [];
    const to: EmailAddress[] = toArray
        .flatMap(addrObj => addrObj.value)
        .map(addr => EmailAddress.fromString(addr.address ?? ''))
        .filter((a): a is EmailAddress => a !== null);

    if (to.length === 0) {
        verboseDropLog?.(`empty To (raw To field: "${parsed.to ?? ''}")`);
        return null;
    }

    // Extract and resize the first image attachment, if present.
    // Profile pic commands are resized to 128×128; all other photos to 1080×1080.
    let photoAttachment: PhotoAttachment | undefined;
    const imageAtt = parsed.attachments?.find(
        att => att.contentType.startsWith('image/') && Buffer.isBuffer(att.content)
    );
    if (imageAtt) {
        const isProfilePicCommand = (parsed.text ?? '').trim().startsWith('$ usermod --profile-pic');
        const [imgWidth, imgHeight] = isProfilePicCommand ? [128, 128] : [1080, 1080];
        const resized = await sharp(imageAtt.content as Buffer)
            .resize(imgWidth, imgHeight, { fit: 'cover' })
            .jpeg({ quality: 85 })
            .toBuffer();
        photoAttachment = {
            data: resized,
            contentType: 'image/jpeg',
            filename: imageAtt.filename ?? 'photo.jpg',
        };
    }

    const xSimStepRaw = parsed.headers.get('x-sim-step');
    const xSimStep = xSimStepRaw !== undefined ? String(xSimStepRaw).trim() : undefined;

    const message = new EmailMessage(
        from,
        to,
        parsed.subject ?? '',
        parsed.text ?? '',
        parsed.date ?? new Date(),
        parsed.headers.get('x-friendlymail') as string | undefined,
        parsed.messageId ?? String(fallbackUid),
        parsed.inReplyTo,
        photoAttachment,
        senderName,
        xSimStep
    );
    return { message, parsed };
}

/**
 * A MailProvider that sends messages via SMTP (nodemailer) and receives via IMAP (imapflow).
 *
 * getMessages() returns all INBOX messages and all Sent messages on every call.
 * MessageStore deduplicates by messageId so MessageProcessor sees each message once.
 * MessageProcessor is responsible for all logic to avoid sending duplicate replies.
 * sendDraft() appends a copy to the IMAP Sent folder so MessageProcessor has full
 * sent history on every run, including after a daemon restart. When archiveRule is
 * enabled, it also copies the sent message from archiveFolder to INBOX via UID COPY.
 */
export class EmailMailProvider extends MailProvider implements IEmailMailProvider {
    private _smtpConfig: SmtpConfig;
    private _imapConfig: ImapConfig;
    private _verbose: boolean;
    private _hostDisplayName?: string;

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

    /** Display name of the host user, discovered from Sent folder messages. */
    get hostDisplayName(): string | undefined {
        return this._hostDisplayName;
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
     * If archiveRule is enabled and archiveFolder is configured, also searches
     * archiveFolder for the sent message by X-friendlymail header and copies it
     * to INBOX via IMAP UID COPY (with retries for async Gmail indexing).
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

        const inlineAttachments: { filename: string; content: Buffer; contentType: string; cid: string }[] = [];
        if (draft.photoAttachment) {
            inlineAttachments.push({
                filename: draft.photoAttachment.filename,
                content: draft.photoAttachment.data,
                contentType: draft.photoAttachment.contentType,
                cid: 'post_photo',
            });
        }
        if (draft.profilePicAttachment) {
            inlineAttachments.push({
                filename: draft.profilePicAttachment.filename,
                content: draft.profilePicAttachment.data,
                contentType: draft.profilePicAttachment.contentType,
                cid: 'profile_pic',
            });
        }

        const fromAddr = draft.fromName
            ? `"${draft.fromName}" <${draft.from!.toString()}>`
            : draft.from!.toString();

        const info = await transporter.sendMail({
            from: fromAddr,
            to: draft.to.map(a => a.toString()).join(', '),
            subject: draft.subject,
            text: draft.body,
            ...(draft.html ? { html: draft.html } : {}),
            headers,
            attachments: inlineAttachments,
        });

        if (this._verbose) {
            console.log(`[EmailMailProvider] sendDraft complete  messageId=${info.messageId}`);
        }

        // Append a copy to IMAP Sent so getMessages() can return it for MessageProcessor context.
        const rawMessage = buildRawMessage(
            fromAddr,
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

        // If archive-rule is enabled, search archiveFolder for the sent message by its
        // X-friendlymail header and copy it server-side to INBOX via UID COPY.
        // Gmail rewrites Message-IDs after delivery so we match on X-friendlymail instead.
        // We retry up to 5 times (1 s apart) because Gmail's IMAP index is async.
        if (this._imapConfig.archiveRule && this._imapConfig.archiveFolder && xFriendlymail) {
            const hostAddr = EmailAddress.fromString(this._imapConfig.auth.user);
            const isToHost = hostAddr && draft.to.some(a => a.equals(hostAddr));
            if (isToHost) {
                const archiveFolder = this._imapConfig.archiveFolder;
                const MAX_RETRIES = 5;
                const RETRY_DELAY_MS = 1000;
                let copied = false;

                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    const archiveLock = await client.getMailboxLock(archiveFolder);
                    try {
                        const searchResult = await client.search(
                            { header: { 'X-friendlymail': xFriendlymail } },
                            { uid: true }
                        );
                        const uids: number[] = searchResult === false ? [] : searchResult;
                        if (uids.length > 0) {
                            const uid = uids[uids.length - 1];
                            await client.messageCopy(String(uid), 'INBOX', { uid: true });
                            if (this._verbose) {
                                console.log(`[EmailMailProvider] UID COPY uid=${uid} from ${archiveFolder} to INBOX (attempt ${attempt})`);
                            }
                            copied = true;
                        }
                    } finally {
                        archiveLock.release();
                    }

                    if (copied) break;

                    if (attempt < MAX_RETRIES) {
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    }
                }

                if (!copied && this._verbose) {
                    console.log(`[EmailMailProvider] archive-rule: message not found in ${archiveFolder} after ${MAX_RETRIES} attempts`);
                }
            }
        }

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
            const inboxSearchResult = await client.search(searchCriteria, { uid: true });
            const uids: number[] = inboxSearchResult === false ? [] : inboxSearchResult;

            if (uids.length > 0) {
                const uidSet = uids.join(',');
                for await (const msg of client.fetch(uidSet, { source: true, uid: true }, { uid: true })) {
                    if (!msg.source) continue;
                    const verboseDropLog = this._verbose
                        ? (reason: string) => console.log(`[EmailMailProvider] INBOX  uid=${msg.uid}  DROPPED (${reason})`)
                        : undefined;
                    const result = await parseImapMessage(msg.source, msg.uid, verboseDropLog);
                    if (result) {
                        messages.push(result.message);
                        if (this._verbose) {
                            console.log(`[EmailMailProvider] INBOX  uid=${msg.uid}  id=${result.message.messageId}  from=${result.message.from}  subject="${result.message.subject}"  xFriendlymail=${result.message.xFriendlymail ?? '(none)'}`);
                            // Check both the EmailMessage field and the raw parsed header so
                            // that an X-friendlymail header present on the wire is never missed.
                            const hasXFm = result.message.xFriendlymail !== undefined
                                || result.parsed.headers.get('x-friendlymail') !== undefined;
                            if (hasXFm || isFmMessage(result.message)) {
                                logFmMessageSource(result.parsed, 'INBOX', msg.uid);
                            }
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
                const sentSearchResult = await client.search(searchCriteria, { uid: true });
                const uids: number[] = sentSearchResult === false ? [] : sentSearchResult;

                if (uids.length > 0) {
                    const uidSet = uids.join(',');
                    for await (const msg of client.fetch(uidSet, { source: true, uid: true }, { uid: true })) {
                        if (!msg.source) continue;
                        const verboseDropLog = this._verbose
                            ? (reason: string) => console.log(`[EmailMailProvider] Sent  uid=${msg.uid}  DROPPED (${reason})`)
                            : undefined;
                        const result = await parseImapMessage(msg.source, msg.uid, verboseDropLog);
                        if (result) {
                            messages.push(result.message);
                            // Detect host display name from user-sent messages (no X-friendlymail header)
                            if (!this._hostDisplayName
                                && result.message.fromName
                                && !result.message.xFriendlymail
                                && result.message.from.toString() === this._imapConfig.auth.user) {
                                this._hostDisplayName = result.message.fromName;
                            }
                            if (this._verbose) {
                                console.log(`[EmailMailProvider] Sent  uid=${msg.uid}  id=${result.message.messageId}  from=${result.message.from}  subject="${result.message.subject}"  xFriendlymail=${result.message.xFriendlymail ?? '(none)'}`);
                                // The 'Sent' folder is written exclusively by sendDraft — every
                                // message here is an FM system message, so log source unconditionally.
                                logFmMessageSource(result.parsed, 'Sent', msg.uid);
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

        // — Archive folder: fetch if configured (e.g. '[Gmail]/All Mail') —
        if (this._imapConfig.archiveFolder) {
            const archiveCountBefore = messages.length;
            try {
                const archiveLock = await client.getMailboxLock(this._imapConfig.archiveFolder);
                try {
                    const searchCriteria = this._imapConfig.sinceDate ? { since: this._imapConfig.sinceDate } : { all: true as const };
                    const archiveSearchResult = await client.search(searchCriteria, { uid: true });
                    const uids: number[] = archiveSearchResult === false ? [] : archiveSearchResult;

                    if (uids.length > 0) {
                        const uidSet = uids.join(',');
                        for await (const msg of client.fetch(uidSet, { source: true, uid: true }, { uid: true })) {
                            if (!msg.source) continue;
                            const verboseDropLog = this._verbose
                                ? (reason: string) => console.log(`[EmailMailProvider] Archive  uid=${msg.uid}  DROPPED (${reason})`)
                                : undefined;
                            const result = await parseImapMessage(msg.source, msg.uid, verboseDropLog);
                            if (result) {
                                messages.push(result.message);
                                if (this._verbose) {
                                    console.log(`[EmailMailProvider] Archive  uid=${msg.uid}  id=${result.message.messageId}  from=${result.message.from}  subject="${result.message.subject}"  xFriendlymail=${result.message.xFriendlymail ?? '(none)'}`);
                                    // Check both the EmailMessage field and the raw parsed header so
                                    // that an X-friendlymail header present on the wire is never missed.
                                    const hasXFm = result.message.xFriendlymail !== undefined
                                        || result.parsed.headers.get('x-friendlymail') !== undefined;
                                    if (hasXFm || isFmMessage(result.message)) {
                                        logFmMessageSource(result.parsed, 'Archive', msg.uid);
                                    }
                                }
                            }
                        }
                    }
                } finally {
                    archiveLock.release();
                }
            } catch {
                // Archive folder doesn't exist or can't be opened — silently skip.
            }
            if (this._verbose) {
                console.log(`[EmailMailProvider] Archive fetch complete  count=${messages.length - archiveCountBefore}`);
            }
        }

        await client.logout();

        return messages;
    }
}
