import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { EmailAddress } from './EmailAddress.impl';
import { SimpleMessageWithMessageId } from './SimpleMessageWithMessageId.impl';
import { MessageDraft } from './MessageDraft.impl';
import { ILocalSimMailProvider } from './LocalSimMailProvider.interface';
import { encodeQuotedPrintable } from '../utils/quotedPrintable';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Implements both IMessageSender and IMessageReceiver using directories on disk.
 * Messages are stored as <index>.txt (headers + body) and optionally <index>.html.
 * Delivery to another participant is accomplished by writing directly to their Inbox/.
 */
export class LocalSimMailProvider implements ILocalSimMailProvider {
    private _hostEmail: string;
    private _hostName: string;
    private _dataDir: string;
    private _sentDir: string;
    private _inboxDir: string;
    /** Sent messages pending return on the next getMessages() call. */
    private _pendingSent: SimpleMessageWithMessageId[] = [];
    /** Next file index for writing to Sent/. Initialized from existing files on construction. */
    private _sentIndex: number;
    /** Tracks inbox filenames already returned by getMessages() to avoid reprocessing. */
    private _seenInboxFiles: Set<string> = new Set();

    constructor(hostEmail: string, hostName: string, dataDir: string) {
        this._hostEmail = hostEmail;
        this._hostName = hostName;
        this._dataDir = dataDir;
        this._sentDir = path.join(dataDir, hostEmail, 'Sent');
        this._inboxDir = path.join(dataDir, hostEmail, 'Inbox');

        fs.mkdirSync(this._sentDir, { recursive: true });
        fs.mkdirSync(this._inboxDir, { recursive: true });

        this._sentIndex = this._nextIndex(this._sentDir);
    }

    /** Display name of the host user. */
    get hostDisplayName(): string | undefined {
        return this._hostName;
    }

    /** Send a draft by writing to Sent/ and delivering to each recipient's Inbox/. */
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

        const messageId = `<${crypto.randomUUID()}@local-sim>`;
        const date = new Date();

        const message = new SimpleMessageWithMessageId(
            draft.from!,
            draft.to,
            draft.subject,
            draft.body,
            date,
            xFriendlymail,
            draft.html,
            messageId
        );

        // Write to Sent/ so full history is available across daemon restarts.
        this._writeMessage(this._sentDir, this._sentIndex++, message);

        // Queue for return on the next getMessages() so the daemon sees its own sent messages.
        this._pendingSent.push(message);

        // Deliver to each recipient's Inbox/.
        for (const recipient of draft.to) {
            const recipientInbox = path.join(this._dataDir, recipient.toString(), 'Inbox');
            fs.mkdirSync(recipientInbox, { recursive: true });
            const idx = this._nextIndex(recipientInbox);
            this._writeMessage(recipientInbox, idx, message);
        }
    }

    /**
     * Return all messages from Inbox/ that have not yet been returned, plus any
     * pending sent messages. Already-seen files are tracked in memory; nothing
     * is moved or deleted from the Inbox directory.
     */
    async getMessages(): Promise<SimpleMessageWithMessageId[]> {
        const messages: SimpleMessageWithMessageId[] = [];

        const files = fs.readdirSync(this._inboxDir)
            .filter(f => f.endsWith('.txt'))
            .sort();

        for (const file of files) {
            if (this._seenInboxFiles.has(file)) continue;
            this._seenInboxFiles.add(file);

            const txtPath = path.join(this._inboxDir, file);
            const content = fs.readFileSync(txtPath, 'utf8');
            const parsed = this._parseMessageFile(content, txtPath);
            if (parsed) {
                messages.push(parsed);
            }
        }

        const pending = this._pendingSent;
        this._pendingSent = [];
        return [...messages, ...pending];
    }

    /**
     * Write a message file to a directory with 4-digit zero-padded index.
     * The .txt file contains RFC 822-style headers + plain text body.
     * The .html file is written only when html is present.
     */
    private _writeMessage(dir: string, index: number, msg: SimpleMessageWithMessageId): void {
        const base = String(index).padStart(4, '0');
        const lines: string[] = [
            `From: ${msg.from.toString()}`,
            `To: ${msg.to.map(a => a.toString()).join(', ')}`,
            `Subject: ${msg.subject}`,
            `Date: ${msg.date.toUTCString()}`,
            `Message-ID: ${msg.messageId}`,
        ];
        if (msg.xFriendlymail !== undefined) lines.push(`X-friendlymail: ${msg.xFriendlymail}`);
        if (msg.xSimStep !== undefined) lines.push(`X-Sim-Step: ${msg.xSimStep}`);
        lines.push('', msg.body);
        fs.writeFileSync(path.join(dir, `${base}.txt`), lines.join('\n'));
        if (msg.html) {
            fs.writeFileSync(path.join(dir, `${base}.html`), msg.html);
        }
    }

    /**
     * Parse the headers and body from a .txt message file.
     * Returns null if required fields are missing or From/To are unparseable.
     */
    private _parseMessageFile(content: string, source: string): SimpleMessageWithMessageId | null {
        const lines = content.split('\n');
        let from: EmailAddress | null = null;
        let to: EmailAddress[] = [];
        let subject = '';
        let dateStr = '';
        let messageId = '';
        let xFriendlymail: string | undefined;
        let xSimStep: string | undefined;
        let inBody = false;
        let body = '';
        let currentHeader = '';
        let currentValue = '';

        const applyHeader = (header: string, value: string): void => {
            switch (header.toLowerCase()) {
                case 'from':
                    from = EmailAddress.fromDisplayString(value);
                    break;
                case 'to':
                    to = value.split(',')
                        .map(e => EmailAddress.fromDisplayString(e.trim()))
                        .filter((a): a is EmailAddress => a !== null);
                    break;
                case 'subject':
                    subject = value;
                    break;
                case 'date':
                    dateStr = value;
                    break;
                case 'message-id':
                    messageId = value.replace(/^<|>$/g, '');
                    break;
                case 'x-friendlymail':
                    xFriendlymail = value;
                    break;
                case 'x-sim-step':
                    xSimStep = value;
                    break;
            }
        };

        for (const line of lines) {
            if (!inBody) {
                if (line.trim() === '') {
                    if (currentHeader) applyHeader(currentHeader, currentValue);
                    currentHeader = '';
                    currentValue = '';
                    inBody = true;
                    continue;
                }
                if ((line.startsWith(' ') || line.startsWith('\t')) && currentHeader) {
                    currentValue += ' ' + line.trim();
                    continue;
                }
                if (currentHeader) applyHeader(currentHeader, currentValue);
                const match = line.match(/^([^:]+):\s*(.*)$/);
                if (match) {
                    currentHeader = match[1].trim();
                    currentValue = match[2].trim();
                } else {
                    currentHeader = '';
                    currentValue = '';
                }
            } else {
                if (body === '' && line.trim() === '') continue;
                body += line + '\n';
            }
        }
        if (!inBody && currentHeader) applyHeader(currentHeader, currentValue);
        body = body.trim();

        if (!from || to.length === 0 || !subject) {
            console.error(`  warning: skipping unparseable message file: ${source}`);
            return null;
        }

        const date = dateStr ? new Date(dateStr) : new Date();
        if (!messageId) messageId = crypto.randomUUID();

        return new SimpleMessageWithMessageId(
            from, to, subject, body, date, xFriendlymail, undefined, messageId, undefined, undefined, xSimStep
        );
    }

    /**
     * Scan a directory for existing .txt files and return the next available index.
     * Looks only in the immediate directory, not in subdirectories.
     */
    private _nextIndex(dir: string): number {
        if (!fs.existsSync(dir)) return 1;
        const files = fs.readdirSync(dir).filter(f => /^\d+\.txt$/.test(f));
        if (files.length === 0) return 1;
        const max = Math.max(...files.map(f => parseInt(f, 10)));
        return max + 1;
    }

    /**
     * Write a message directly to this instance's own Inbox, simulating inbound
     * mail from outside the sim (used by the `load` and `send` commands).
     */
    writeToOwnInbox(msg: SimpleMessageWithMessageId): void {
        this._writeMessage(this._inboxDir, this._nextIndex(this._inboxDir), msg);
    }

    /**
     * Poll Inbox/ every 2 seconds for up to 5 minutes for a message with
     * X-Sim-Step matching stepFilter. Files are left in place.
     * Exits the process if the timeout expires.
     */
    async waitForInbound(stepFilter: number, peerPresenceFiles: string[] = []): Promise<void> {
        const POLL_MS = 2_000;
        const TIMEOUT_MS = 5 * 60_000;
        const deadline = Date.now() + TIMEOUT_MS;
        const desc = `step=${stepFilter}`;

        // Snapshot existing files so we only match messages that arrive after this point.
        const existingFiles = new Set(
            fs.readdirSync(this._inboxDir).filter(f => f.endsWith('.txt'))
        );

        console.log(`  waiting for inbound: ${desc}`);

        while (Date.now() < deadline) {
            await sleep(POLL_MS);

            // Fail fast if all peer instances have already exited.
            if (peerPresenceFiles.length > 0 && peerPresenceFiles.every(p => !fs.existsSync(p))) {
                console.error(`  wait-for-inbound: all peer instances have exited without delivering ${desc}`);
                process.exit(1);
            }

            const files = fs.readdirSync(this._inboxDir)
                .filter(f => f.endsWith('.txt'))
                .sort();

            for (const file of files) {
                if (existingFiles.has(file)) continue;
                const txtPath = path.join(this._inboxDir, file);
                const content = fs.readFileSync(txtPath, 'utf8');
                const parsed = this._parseMessageFile(content, txtPath);
                if (parsed && parsed.xSimStep === String(stepFilter)) {
                    console.log(`  wait-for-inbound: matched  step=${stepFilter}  from="${parsed.from}"  subject="${parsed.subject}"`);
                    // Leave the file in Inbox — the next daemon.run() will pick it up via getMessages().
                    return;
                }
            }
        }

        console.error(`  wait-for-inbound: timed out after ${TIMEOUT_MS / 1000}s waiting for ${desc}`);
        process.exit(1);
    }
}
