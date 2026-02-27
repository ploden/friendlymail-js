import { User } from './models/User';
import { SocialNetwork } from './models/SocialNetwork';
import { MessageDraft } from './models/MessageDraft';

/**
 * Interface for MessageProcessor data type
 */
export interface IMessageProcessor {
    /**
     * Get a user by email
     */
    getAccountByEmail(email: string): User | null;

    /**
     * Get the social network for the host user, or null if no host account exists
     */
    getHostSocialNetwork(): SocialNetwork | null;

    /**
     * Get all message drafts queued for sending
     */
    getMessageDrafts(): MessageDraft[];

    /**
     * Remove a draft from the queue (typically after sending)
     */
    removeDraft(draft: MessageDraft): void;
}
