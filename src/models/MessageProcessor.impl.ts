import { IMessageProcessor } from './MessageProcessor.interface';
import { IMessageStore } from './MessageStore.interface';
import { SocialNetwork } from './SocialNetwork.impl';
import { Account } from './Account.impl';

/**
 * Implementation of MessageProcessor for processing messages in a MessageStore.
 * Creates draft messages to be sent based on the contents of the MessageStore.
 * As soon as a draft is created, the processor stops processing messages.
 */
export class MessageProcessor implements IMessageProcessor {
    private _messageStore: IMessageStore;
    private _socialNetwork: SocialNetwork;
    private _processedCount: number;

    /**
     * Create a new MessageProcessor
     * @param messageStore The message store containing messages to process
     * @param accountOrSocialNetwork Either an Account (to create a new SocialNetwork) or an existing SocialNetwork to update
     */
    constructor(
        messageStore: IMessageStore,
        accountOrSocialNetwork: Account | SocialNetwork
    ) {
        this._messageStore = messageStore;
        if (accountOrSocialNetwork instanceof SocialNetwork) {
            this._socialNetwork = accountOrSocialNetwork;
        } else {
            this._socialNetwork = new SocialNetwork(accountOrSocialNetwork);
        }
        this._processedCount = 0;
    }

    get messageStore(): IMessageStore {
        return this._messageStore;
    }

    get socialNetwork(): SocialNetwork {
        return this._socialNetwork;
    }

    /**
     * Process messages in the message store.
     * Creates draft messages and updates the social network.
     * Stops processing as soon as a draft is created.
     * @returns true if a draft was created, false otherwise
     */
    process(): boolean {
        const messages = this._messageStore.allMessages;
        const initialDraftCount = this._messageStore.draftMessages.length;

        for (let i = this._processedCount; i < messages.length; i++) {
            // Process each message and potentially create drafts
            // This is a placeholder - actual processing logic would go here
            this._processedCount++;

            // Check if a draft was created
            if (this._messageStore.draftMessages.length > initialDraftCount) {
                return true;
            }
        }

        return false;
    }
}
