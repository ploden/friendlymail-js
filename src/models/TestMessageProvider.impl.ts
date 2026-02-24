import { ITestMessageProvider } from './TestMessageProvider.interface';
import { EmailAddress } from './EmailAddress.impl';
import { MessageDraft } from './MessageDraft.impl';
import { SimpleMessage } from './SimpleMessage';
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
    private _messages: SimpleMessage[];
    private _sentMessages: SimpleMessage[];

    constructor(hostAddress: EmailAddress) {
        this._hostAddress = hostAddress;
        this._messages = [];
        this._sentMessages = [];
    }

    get hostAddress(): EmailAddress {
        return this._hostAddress;
    }

    get sentMessages(): ReadonlyArray<SimpleMessage> {
        return [...this._sentMessages];
    }

    /**
     * Send a draft message.
     * Builds a SimpleMessage from the draft, including the X-friendlymail header,
     * and makes it available on the next call to getMessages().
     * Also stores the message in sentMessages for testing verification.
     * @param draft The draft message to send
     */
    async sendDraft(draft: MessageDraft): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!draft.isReadyToSend()) {
            throw new Error('Draft is not ready to send');
        }
        const xFriendlymail = draft.messageType !== null
            ? encodeQuotedPrintable(JSON.stringify({ messageType: draft.messageType }))
            : undefined;
        const message = new SimpleMessage(
            draft.from!,
            draft.to,
            draft.subject,
            draft.body,
            new Date(),
            xFriendlymail
        );
        this._sentMessages.push(message);
        this._messages.push(message);
    }

    /**
     * Retrieve loaded messages. Each message is returned only once;
     * messages are cleared after being returned.
     * @returns Promise that resolves to an array of SimpleMessage objects
     */
    async getMessages(): Promise<SimpleMessage[]> {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const messages = [...this._messages];
        this._messages = [];
        return messages;
    }

    /**
     * Load a SimpleMessage. The message will be returned on the next call to getMessages().
     * @param message The SimpleMessage to load
     */
    async loadMessage(message: SimpleMessage): Promise<void> {
        this._messages.push(message);
    }

    /**
     * Load messages from a file.
     * Replaces <host_address> placeholders with the host email address.
     * Parses From, To, Subject, X-friendlymail headers and body into a SimpleMessage.
     * @param filePath The path to the file to load
     */
    async loadFromFile(filePath: string): Promise<void> {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const processedContent = content.replace(
            /<host_address>/g,
            this._hostAddress.toString()
        );

        const lines = processedContent.split('\n');
        let from: EmailAddress | null = null;
        let to: EmailAddress[] = [];
        let subject = '';
        let xFriendlymail: string | undefined;
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
            throw new Error(`Missing required email fields in file: ${filePath}`);
        }

        this._messages.push(new SimpleMessage(from, to, subject, body, new Date(), xFriendlymail));
    }

    /**
     * Add a message directly (useful for testing)
     * @param message The message to add
     */
    addMessage(message: SimpleMessage): void {
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
