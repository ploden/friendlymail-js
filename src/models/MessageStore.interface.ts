import { SimpleMessage } from './SimpleMessage';
import { MessageDraft } from './MessageDraft.impl';

/**
 * Interface for storing messages received from a MessageReceiver.
 * Also stores messages that should be sent using a MessageSender.
 * Contains an allMessages property for storing all messages, and a
 * draftMessages property for storing messages that should be sent.
 */
export interface IMessageStore {
    /**
     * All received messages
     */
    readonly allMessages: ReadonlyArray<SimpleMessage>;

    /**
     * Draft messages to be sent
     */
    readonly draftMessages: ReadonlyArray<MessageDraft>;

    /**
     * Add a received message to the store
     * @param message The message to add
     */
    addMessage(message: SimpleMessage): void;

    /**
     * Add multiple received messages to the store
     * @param messages The messages to add
     */
    addMessages(messages: SimpleMessage[]): void;

    /**
     * Add a draft message to be sent
     * @param draft The draft message to add
     */
    addDraft(draft: MessageDraft): void;

    /**
     * Remove a draft message after it has been sent
     * @param draft The draft message to remove
     */
    removeDraft(draft: MessageDraft): void;

    /**
     * Clear all messages from the store
     */
    clear(): void;
}
