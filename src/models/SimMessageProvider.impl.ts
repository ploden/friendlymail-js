import { ISimMessageProvider } from './SimMessageProvider.interface';
import { EmailAddress } from './EmailAddress.impl';
import { MessageDraft } from './MessageDraft.impl';
import { SimpleMessageWithMessageId } from './SimpleMessageWithMessageId';
import { encodeQuotedPrintable } from '../utils/quotedPrintable';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Built-in test users for [non-host-N], [non-host-name-N], [non-host-email-N] placeholders.
 */
const TEST_USERS: ReadonlyArray<{ name: string; email: string }> = [
    { name: 'Alice Johnson',  email: 'alice@test.com'  },
    { name: 'Bob Smith',      email: 'bob@test.com'    },
    { name: 'Carol Williams', email: 'carol@test.com'  },
    { name: 'Dave Brown',     email: 'dave@test.com'   },
    { name: 'Eve Davis',      email: 'eve@test.com'    },
    { name: 'Frank Miller',   email: 'frank@test.com'  },
    { name: 'Grace Wilson',   email: 'grace@test.com'  },
    { name: 'Henry Moore',    email: 'henry@test.com'  },
    { name: 'Iris Taylor',    email: 'iris@test.com'   },
    { name: 'Jack Anderson',  email: 'jack@test.com'   },
    { name: 'Kate Thomas',    email: 'kate@test.com'   },
    { name: 'Liam Jackson',   email: 'liam@test.com'   },
    { name: 'Mia White',      email: 'mia@test.com'    },
    { name: 'Noah Harris',    email: 'noah@test.com'   },
    { name: 'Olivia Martin',  email: 'olivia@test.com' },
    { name: 'Pete Garcia',    email: 'pete@test.com'   },
    { name: 'Quinn Martinez', email: 'quinn@test.com'  },
    { name: 'Rose Robinson',  email: 'rose@test.com'   },
    { name: 'Sam Clark',      email: 'sam@test.com'    },
    { name: 'Tina Lewis',     email: 'tina@test.com'   },
];

/**
 * Implementation of SimMessageProvider for use by the friendlymail simulator.
 *
 * Acts as both MessageSender and MessageReceiver for the Daemon.
 * Sent messages are written to sentDir; received (loaded) messages are written
 * to receivedDir. File indices are reset when clearDirs() is called.
 */
export class SimMessageProvider implements ISimMessageProvider {
    private _hostAddress: EmailAddress;
    private _hostName: string;
    private _sentDir: string;
    private _receivedDir: string;
    private _messages: SimpleMessageWithMessageId[] = [];
    private _sentMessages: SimpleMessageWithMessageId[] = [];
    private _sentIndex = 1;
    private _receivedIndex = 1;

    constructor(hostAddress: EmailAddress, hostName: string, sentDir: string, receivedDir: string) {
        this._hostAddress = hostAddress;
        this._hostName = hostName;
        this._sentDir = sentDir;
        this._receivedDir = receivedDir;
    }

    get hostAddress(): EmailAddress {
        return this._hostAddress;
    }

    get sentMessages(): ReadonlyArray<SimpleMessageWithMessageId> {
        return [...this._sentMessages];
    }

    /**
     * Send a draft message. Builds a SimpleMessageWithMessageId from the draft,
     * encodes metadata into the X-friendlymail header, writes the message to the
     * sent directory, and queues it to be returned on the next getMessages() call
     * so the Daemon can track its own sent messages.
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
        const message = new SimpleMessageWithMessageId(
            draft.from!,
            draft.to,
            draft.subject,
            draft.body,
            new Date(),
            xFriendlymail,
            draft.html
        );
        this._sentMessages.push(message);
        this._messages.push(message);
        this._writeMessage(this._sentDir, this._sentIndex++, message);
    }

    /**
     * Return all queued messages and clear the queue.
     */
    async getMessages(): Promise<SimpleMessageWithMessageId[]> {
        const messages = [...this._messages];
        this._messages = [];
        return messages;
    }

    /**
     * Load a message from a .txt file. Applies host and test-user placeholders,
     * writes the result to the received directory, and queues the message for
     * the next getMessages() call.
     */
    async loadFile(filePath: string): Promise<void> {
        const raw = await fs.promises.readFile(filePath, 'utf8');
        const content = this._applyPlaceholders(raw);
        const message = await this._parseMessage(content, filePath);
        this._messages.push(message);
        this._writeMessage(this._receivedDir, this._receivedIndex++, message);
    }

    /**
     * Load a message from a mailto: URL, treating the host as the sender.
     * Writes the message to the received directory and queues it for the next
     * getMessages() call.
     * @throws Error if the URL is not a valid mailto: URL
     */
    async loadFromMailto(url: string): Promise<void> {
        const parsed = this._parseMailtoUrl(url);
        if (!parsed) throw new Error(`Invalid mailto: URL: ${url}`);
        const toAddress = EmailAddress.fromString(parsed.to);
        if (!toAddress) throw new Error(`Invalid email address in mailto URL: ${parsed.to}`);
        const message = new SimpleMessageWithMessageId(
            this._hostAddress,
            [toAddress],
            parsed.subject,
            parsed.body
        );
        this._messages.push(message);
        this._writeMessage(this._receivedDir, this._receivedIndex++, message);
    }

    /**
     * Clear all files in the sent and received directories and reset file-index counters.
     */
    clearDirs(): void {
        for (const dir of [this._sentDir, this._receivedDir]) {
            if (fs.existsSync(dir)) {
                for (const file of fs.readdirSync(dir)) {
                    fs.unlinkSync(path.join(dir, file));
                }
            } else {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
        this._sentIndex = 1;
        this._receivedIndex = 1;
    }

    private _writeMessage(dir: string, index: number, msg: SimpleMessageWithMessageId): void {
        const lines: string[] = [
            `From: ${msg.from.toString()}`,
            `To: ${msg.to.map(a => a.toString()).join(', ')}`,
            `Subject: ${msg.subject}`,
            `Date: ${msg.date.toUTCString()}`,
        ];
        if (msg.xFriendlymail !== undefined) lines.push(`X-friendlymail: ${msg.xFriendlymail}`);
        lines.push('', msg.body);
        fs.writeFileSync(path.join(dir, `${index}.txt`), lines.join('\n'));
        if (msg.html) {
            fs.writeFileSync(path.join(dir, `${index}.html`), msg.html);
        }
    }

    /**
     * Replace [host], [host-name], [host-email], [non-host-N], [non-host-name-N],
     * and [non-host-email-N] placeholders in a message file's content.
     */
    private _applyPlaceholders(content: string): string {
        const email = this._hostAddress.toString();
        const hostFull = this._hostName ? `${this._hostName} <${email}>` : email;
        const hostNameResolved = this._hostName || email;
        let result = content
            .replace(/\[host\]/g, hostFull)
            .replace(/\[host-name\]/g, hostNameResolved)
            .replace(/\[host-email\]/g, `<${email}>`);
        for (let i = 0; i < TEST_USERS.length; i++) {
            const n = i + 1;
            const { name, email: userEmail } = TEST_USERS[i];
            result = result
                .replace(new RegExp(`\\[non-host-name-${n}\\]`, 'g'), name)
                .replace(new RegExp(`\\[non-host-email-${n}\\]`, 'g'), `<${userEmail}>`)
                .replace(new RegExp(`\\[non-host-${n}\\]`, 'g'), `${name} <${userEmail}>`);
        }
        return result;
    }

    /**
     * Parse a mailto: URL into its to, subject, and body components.
     * Returns null if the URL is not a valid mailto: URL.
     */
    private _parseMailtoUrl(url: string): { to: string; subject: string; body: string } | null {
        if (!url.startsWith('mailto:')) return null;
        const rest = url.slice('mailto:'.length);
        const qIndex = rest.indexOf('?');
        const to = qIndex === -1 ? rest : rest.slice(0, qIndex);
        if (!to || !EmailAddress.isValid(to)) return null;
        const params = new URLSearchParams(qIndex === -1 ? '' : rest.slice(qIndex + 1));
        return { to, subject: params.get('subject') ?? '', body: params.get('body') ?? '' };
    }

    /**
     * Parse email content into a SimpleMessageWithMessageId.
     * Recognises From, To, Subject, X-friendlymail, and Message-ID headers.
     * If the Message-ID value is [message-id], a UUID is generated.
     * @throws Error if required fields (From, To, Subject) are missing
     */
    private async _parseMessage(content: string, source: string): Promise<SimpleMessageWithMessageId> {
        const lines = content.split('\n');
        let from: EmailAddress | null = null;
        let to: EmailAddress[] = [];
        let subject = '';
        let xFriendlymail: string | undefined;
        let messageId: string | undefined;
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
                case 'x-friendlymail':
                    xFriendlymail = value;
                    break;
                case 'message-id':
                    messageId = value === '[message-id]'
                        ? crypto.randomUUID()
                        : value.replace(/^<|>$/g, '');
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
            throw new Error(`Missing required email fields in ${source}`);
        }

        return new SimpleMessageWithMessageId(from, to, subject, body, new Date(), xFriendlymail, undefined, messageId);
    }
}
