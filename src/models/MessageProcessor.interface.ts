import { IMessageStore } from './MessageStore.interface';
import { SocialNetwork } from './SocialNetwork.impl';

/**
 * Interface for processing messages contained in a MessageStore.
 * Creates draft messages to be sent based on the contents of the MessageStore.
 * As soon as a draft is created, the processor should stop processing messages.
 * If a SocialNetwork object is passed in, the processor will update it.
 * Otherwise, the processor will create a new SocialNetwork object.
 */
export interface IMessageProcessor {
    /**
     * The message store containing messages to process
     */
    readonly messageStore: IMessageStore;

    /**
     * The social network being updated by the processor
     */
    readonly socialNetwork: SocialNetwork;

    /**
     * Process messages in the message store.
     * Creates draft messages and updates the social network.
     * Stops processing as soon as a draft is created.
     * @returns true if a draft was created, false otherwise
     */
    process(): boolean;
}
