import { SimpleMessage } from './models/SimpleMessage';
import { Account } from './models/Account';
import { SocialNetwork } from './models/SocialNetwork';
import { EmailAddress } from './models/EmailAddress';
import { MessageDraft } from './models/MessageDraft';

/**
 * Interface for MessageProcessor data type
 */
export interface IMessageProcessor {
    /**
     * Create an account from a create account command message
     */
    createAccountFromMessage(message: SimpleMessage): Account | null;

    /**
     * Follow another account
     */
    follow(follower: Account, followee: Account): void;

    /**
     * Unfollow an account
     */
    unfollow(follower: Account, followee: Account): void;

    /**
     * Get all accounts this account is following
     */
    getFollowing(account: Account): Account[];

    /**
     * Get all accounts following this account
     */
    getFollowers(account: Account): Account[];

    /**
     * Check if one account is following another
     */
    isFollowing(follower: Account, followee: Account): boolean;

    /**
     * Check if one account is followed by another
     */
    isFollowedBy(followee: Account, follower: Account): boolean;

    /**
     * Add an account to the processor
     */
    addAccount(account: Account): void;

    /**
     * Get an account by email
     */
    getAccountByEmail(email: string): Account | null;

    /**
     * Get all accounts
     */
    getAllAccounts(): Account[];

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
