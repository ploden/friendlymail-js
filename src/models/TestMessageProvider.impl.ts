import { ITestMessageProvider } from './TestMessageProvider.interface';
import { EmailAddress } from './EmailAddress.impl';
import { EmailMessage } from '../../EmailMessage';
import { MessageDraft } from './MessageDraft.impl';
import { SimpleMessage } from './SimpleMessage';
import * as fs from 'fs';

/**
 * Implementation of TestMessageProvider for testing and simulation.
 * Implements MessageSender and MessageReceiver, and loads messages from files.
 * If a file contains <host_address> as the To or From field, the email address
 * of the host user will be used.
 */
export class TestMessageProvider implements ITestMessageProvider {
    private _hostAddress: EmailAddress;
    private _messages: EmailMessage[];
    private _sentMessages: EmailMessage[];

    constructor(hostAddress: EmailAddress) {
        this._hostAddress = hostAddress;
        this._messages = [];
        this._sentMessages = [];
    }

    get hostAddress(): EmailAddress {
        return this._hostAddress;
    }

    get sentMessages(): ReadonlyArray<EmailMessage> {
        return [...this._sentMessages];
    }

    /**
     * Send a draft message
     * Stores the message in sentMessages for testing verification
     * @param draft The draft message to send
     */
    async sendDraft(draft: MessageDraft): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!draft.isReadyToSend()) {
            throw new Error('Draft is not ready to send');
        }
        const message = draft.toEmailMessage();
        this._sentMessages.push(message);
    }

    /**
     * Retrieve loaded messages. Each message is returned only once;
     * messages are cleared after being returned.
     * @returns Promise that resolves to an array of EmailMessage objects
     */
    async getMessages(): Promise<EmailMessage[]> {
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
        const customHeaders = message.xFriendlymail
            ? new Map([['X-friendlymail', message.xFriendlymail]])
            : new Map<string, string>();
        const emailMessage = new EmailMessage(
            message.from,
            message.to,
            message.subject,
            message.body,
            { customHeaders }
        );
        this._messages.push(emailMessage);
    }

    /**
     * Load messages from a file
     * Replaces <host_address> placeholders with the host email address
     * @param filePath The path to the file to load
     */
    async loadFromFile(filePath: string): Promise<void> {
        const content = await fs.promises.readFile(filePath, 'utf8');

        // Replace <host_address> placeholders with the host email address
        const processedContent = content.replace(
            /<host_address>/g,
            this._hostAddress.toString()
        );

        // Write to a temporary file for parsing
        const tempPath = filePath + '.tmp';
        await fs.promises.writeFile(tempPath, processedContent, 'utf8');

        try {
            const message = await EmailMessage.fromTextFile(tempPath);
            this._messages.push(message);
        } finally {
            // Clean up temp file
            await fs.promises.unlink(tempPath).catch(() => {});
        }
    }

    /**
     * Add a message directly (useful for testing)
     * @param message The message to add
     */
    addMessage(message: EmailMessage): void {
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
