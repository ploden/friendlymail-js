import { ITestMessageProvider } from './TestMessageProvider.interface';
import { EmailAddress } from './EmailAddress.impl';
import { MessageDraft } from './MessageDraft.impl';
import { SimpleMessageWithMessageId } from './SimpleMessageWithMessageId';
import { encodeQuotedPrintable } from '../utils/quotedPrintable';
import * as fs from 'fs';

/**
 * Implementation of TestMessageProvider for testing and simulation.
 * Implements MessageSender and MessageReceiver, and loads messages from files.
 * If a file contains <host_address> as the To or From field, the email address
 * of the host user will be used.
 */
export class TestMessageProvider implements ITestMessageProvider {
    private _hostAddress: EmailAddress;
    private _messages: SimpleMessageWithMessageId[];
    private _sentMessages: SimpleMessageWithMessageId[];

    constructor(hostAddress: EmailAddress) {
        this._hostAddress = hostAddress;
        this._messages = [];
        this._sentMessages = [];
    }

    get hostAddress(): EmailAddress {
        return this._hostAddress;
    }

    get sentMessages(): ReadonlyArray<SimpleMessageWithMessageId> {
        return [...this._sentMessages];
    }

    /**
     * Send a draft message.
     * Builds a SimpleMessageWithMessageId from the draft, including the
     * X-friendlymail header, and makes it available on the next call to
     * getMessages(). Also stores the message in sentMessages for testing
     * verification.
     * @param draft The draft message to send
     */
    async sendDraft(draft: MessageDraft): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!draft.isReadyToSend()) {
            throw new Error('Draft is not ready to send');
        }
        const meta: Record<string, string> = {};
        if (draft.messageType !== null) meta.messageType = draft.messageType;
        if (draft.inReplyTo) meta.inReplyTo = draft.inReplyTo;
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
    }

    /**
     * Retrieve loaded messages. Each message is returned only once;
     * messages are cleared after being returned.
     * @returns Promise that resolves to an array of SimpleMessageWithMessageId objects
     */
    async getMessages(): Promise<SimpleMessageWithMessageId[]> {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const messages = [...this._messages];
        this._messages = [];
        return messages;
    }

    /**
     * Load a SimpleMessageWithMessageId. The message will be returned on the
     * next call to getMessages().
     * @param message The SimpleMessageWithMessageId to load
     */
    async loadMessage(message: SimpleMessageWithMessageId): Promise<void> {
        this._messages.push(message);
    }

    /**
     * Load messages from a file.
     * Replaces <host_address> placeholders with the host email address.
     * Parses From, To, Subject, X-friendlymail, and Message-ID headers and body
     * into a SimpleMessageWithMessageId. If the Message-ID value is [message-id],
     * a UUID is generated for the messageId field.
     * @param filePath The path to the file to load
     */
    async loadFromFile(filePath: string): Promise<void> {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const processedContent = content.replace(/<host_address>/g, this._hostAddress.toString());
        await this._parseAndLoad(processedContent, filePath);
    }

    /**
     * Load a message from a string containing email content.
     * Parses From, To, Subject, X-friendlymail headers and body into a
     * SimpleMessageWithMessageId.
     * @param content The email content string to parse
     */
    async loadFromString(content: string): Promise<void> {
        await this._parseAndLoad(content, '<string>');
    }

    private async _parseAndLoad(content: string, source: string): Promise<void> {
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

        this._messages.push(new SimpleMessageWithMessageId(from, to, subject, body, new Date(), xFriendlymail, undefined, messageId));
    }

    /**
     * Add a message directly (useful for testing)
     * @param message The message to add
     */
    addMessage(message: SimpleMessageWithMessageId): void {
        this._messages.push(message);
    }

    /**
     * Clear all messages
     */
    clear(): void {
        this._messages = [];
        this._sentMessages = [];
    }
}
