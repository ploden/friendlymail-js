import { IMailProvider } from './MailProvider.interface';
import { MessageDraft } from './MessageDraft.impl';
import { SimpleMessage } from './SimpleMessage';

/**
 * Implementation of MailProvider for sending and receiving email messages.
 * Implements both MessageSender and MessageReceiver.
 */
export class MailProvider implements IMailProvider {
    /**
     * Send a draft message
     * @param draft The draft message to send
     * @returns Promise that resolves when the message is sent
     */
    async sendDraft(draft: MessageDraft): Promise<void> {
        // Base implementation - override in subclasses for actual email sending
        throw new Error('sendDraft must be implemented by a concrete provider');
    }

    /**
     * Retrieve messages from the server
     * @returns Promise that resolves to an array of SimpleMessage objects
     */
    async getMessages(): Promise<SimpleMessage[]> {
        // Base implementation - override in subclasses for actual email retrieval
        throw new Error('getMessages must be implemented by a concrete provider');
    }
}
