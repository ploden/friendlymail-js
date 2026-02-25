import { SimpleMessage } from './models/SimpleMessage';
import { User } from './models/User';
import { SocialNetwork } from './models/SocialNetwork';
import { EmailAddress } from './models/EmailAddress';
import { MessageDraft } from './models/MessageDraft';

/**
 * Interface for MessageProcessor data type
 */
export interface IMessageProcessor {
    /**
     * Create a user from a create account command message
     */
    createAccountFromMessage(message: SimpleMessage): User | null;

    /**
     * Follow another user
     */
    follow(follower: User, followee: User): void;

    /**
     * Unfollow a user
     */
    unfollow(follower: User, followee: User): void;

    /**
     * Get all users this user is following
     */
    getFollowing(user: User): User[];

    /**
     * Get all users following this user
     */
    getFollowers(user: User): User[];

    /**
     * Check if one user is following another
     */
    isFollowing(follower: User, followee: User): boolean;

    /**
     * Check if one user is followed by another
     */
    isFollowedBy(followee: User, follower: User): boolean;

    /**
     * Add a user to the processor
     */
    addAccount(user: User): void;

    /**
     * Get a user by email
     */
    getAccountByEmail(email: string): User | null;

    /**
     * Get all users
     */
    getAllAccounts(): User[];

    /**
     * Get all messages
     */
    getAllMessages(): SimpleMessage[];

    /**
     * Get messages from a specific sender
     */
    getMessagesFrom(sender: EmailAddress): SimpleMessage[];

    /**
     * Get messages to a specific recipient
     */
    getMessagesTo(recipient: EmailAddress): SimpleMessage[];

    /**
     * Get messages with a specific subject
     */
    getMessagesWithSubject(subject: string): SimpleMessage[];

    /**
     * Get messages containing specific text in the body
     */
    getMessagesContaining(text: string): SimpleMessage[];

    /**
     * Get messages within a date range
     */
    getMessagesInDateRange(startDate: Date, endDate: Date): SimpleMessage[];

    /**
     * Remove a specific message
     */
    removeMessage(message: SimpleMessage): void;

    /**
     * Clear all messages
     */
    clearMessages(): void;

    /**
     * Get the total number of messages
     */
    getMessageCount(): number;

    /**
     * Get unique senders
     */
    getUniqueSenders(): EmailAddress[];

    /**
     * Get unique recipients
     */
    getUniqueRecipients(): EmailAddress[];

    /**
     * Get messages grouped by sender
     */
    getMessagesGroupedBySender(): Map<EmailAddress, SimpleMessage[]>;

    /**
     * Get social network for a specific email
     */
    getSocialNetwork(email: string): SocialNetwork | undefined;

    /**
     * Get all social networks
     */
    getAllSocialNetworks(): SocialNetwork[];

    /**
     * Get all message drafts queued for sending
     */
    getMessageDrafts(): MessageDraft[];

    /**
     * Remove a draft from the queue (typically after sending)
     */
    removeDraft(draft: MessageDraft): void;

    /**
     * Check if a welcome message has been sent for a sender
     */
    hasWelcomeMessageBeenSent(sender: EmailAddress): boolean;

    /**
     * Send a draft message by converting it to a SimpleMessage and adding it to sentMessages
     * @param draftIndex The index of the draft to send (0-based)
     * @returns The sent SimpleMessage, or null if the index is invalid or draft is not ready
     */
    sendDraft(draftIndex: number): SimpleMessage | null;

    /**
     * Get all sent messages
     */
    getSentMessages(): SimpleMessage[];
}
