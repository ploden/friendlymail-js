import { MessageDraft } from './MessageDraft.impl';

/**
 * Interface for a data type capable of sending messages.
 * Declares a method sendDraft that will send a draft message.
 */
export interface IMessageSender {
    /**
     * Send a draft message
     * @param draft The draft message to send
     * @returns Promise that resolves when the message is sent
     */
    sendDraft(draft: MessageDraft): Promise<void>;
}
