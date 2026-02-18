import { ITestMessageProvider } from './TestMessageProvider.interface';
import { EmailAddress } from './EmailAddress.impl';
import { EmailMessage } from '../../EmailMessage';
import { MessageDraft } from './MessageDraft.impl';
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
        if (!draft.isReadyToSend()) {
            throw new Error('Draft is not ready to send');
        }
        const message = draft.toEmailMessage();
        this._sentMessages.push(message);
    }

    /**
     * Retrieve loaded messages
     * @returns Promise that resolves to an array of EmailMessage objects
     */
    async getMessages(): Promise<EmailMessage[]> {
        return [...this._messages];
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
