import { SimpleMessageWithMessageId } from './SimpleMessageWithMessageId';

/**
 * Interface for a data type capable of receiving messages.
 * Declares a method getMessages that will retrieve messages from the server.
 */
export interface IMessageReceiver {
    /**
     * Retrieve messages from the server
     * @returns Promise that resolves to an array of SimpleMessageWithMessageId objects
     */
    getMessages(): Promise<SimpleMessageWithMessageId[]>;
}
