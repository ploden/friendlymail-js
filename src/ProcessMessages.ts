import { EmailMessage } from '../EmailMessage';
import { Account } from './models/Account';
import { User } from './models/User';
import { SocialNetwork } from './models/SocialNetwork';
import { EmailAddress } from './models/EmailAddress';
import * as path from 'path';

export class ProcessMessages {
    // The email account sending and receiving messages
    private host: EmailAddress;
    private messages: EmailMessage[];
    private socialNetworks: Map<string, SocialNetwork>;
    private following: Map<string, Set<string>>;
    private followers: Map<string, Set<string>>;

    constructor(host: EmailAddress, messages: EmailMessage[] = []) {
        this.host = host;
        this.messages = messages;
        this.socialNetworks = new Map();
        this.following = new Map();
        this.followers = new Map();
    }

    /**
     * Add a single message to the processor
     */
    addMessage(message: EmailMessage): void {
        this.messages.push(message);
        this.processMessage(message);
    }

    /**
     * Add multiple messages to the processor
     */
    addMessages(messages: EmailMessage[]): void {
        this.messages.push(...messages);
        messages.forEach(message => this.processMessage(message));
    }

    /**
     * Process a single message
     */
    private processMessage(message: EmailMessage): void {
        // Check if this is a create account command
        if (message.subject === 'fm' && message.body.includes('$ useradd')) {
            this.createAccountFromMessage(message);
        }
        // Check if this is a follow command
        else if (message.subject === 'fm' && message.body.includes('$ follow add')) {
            this.addFollowerFromMessage(message);
        }
    }

    /**
     * Create an account from a create account command message
     */
    createAccountFromMessage(message: EmailMessage): Account | null {
        const fromEmail = message.from;
        if (!fromEmail) {
            console.warn('Cannot create account: missing from email');
            return null;
        }

        const usernameMatch = message.body.match(/\$\s*useradd\s*\n+\s*([^\n]+)/);
        if (!usernameMatch) {
            console.warn('Cannot create account: missing username in message body');
            return null;
        }

        const username = usernameMatch[1].trim();
        const user = new User(username, fromEmail);
        const account = new Account(user);

        // Check if account already exists
        const existingAccount = this.getAccountByEmail(fromEmail.toString());
        if (existingAccount) {
            // Update the username
            existingAccount.user.updateProfile({ username });
            console.warn(`Account already exists for ${fromEmail}, updating username to ${username}`);
            return existingAccount;
        }

        const socialNetwork = new SocialNetwork(account);
        this.socialNetworks.set(fromEmail.toString(), socialNetwork);
        return account;
    }

    /**
     * Add a follower from a follow command message
     */
    private addFollowerFromMessage(message: EmailMessage): void {
        // Extract the email to follow from the message body
        const followMatch = message.body.match(/\$\s*follow\s+add\s+(.+?)(?:\s*$|\n)/);
        if (!followMatch) {
            console.warn('No follow email found in follow command message');
            return;
        }
        const followEmail = followMatch[1].trim();

        // Get the sender's account (must already exist)
        const senderAccount = this.getAccountByEmail(message.from.toString());
        if (!senderAccount) {
            console.warn(`Cannot follow - sender account ${message.from.toString()} does not exist`);
            return;
        }

        // Get the account to follow (must already exist)
        const followAccount = this.getAccountByEmail(followEmail);
        if (!followAccount) {
            console.warn(`Cannot follow ${followEmail} - account does not exist`);
            return;
        }

        // Add the follow relationship
        this.follow(senderAccount, followAccount);
    }

    /**
     * Follow another account
     */
    follow(follower: Account, followee: Account): void {
        const followerEmail = follower.user.email.toString();
        const followeeEmail = followee.user.email.toString();

        if (followerEmail === followeeEmail) {
            console.warn('Cannot follow yourself');
            return;
        }

        // Initialize sets if they don't exist
        if (!this.following.has(followerEmail)) {
            this.following.set(followerEmail, new Set());
        }
        if (!this.followers.has(followeeEmail)) {
            this.followers.set(followeeEmail, new Set());
        }

        // Add the follow relationship
        this.following.get(followerEmail)!.add(followeeEmail);
        this.followers.get(followeeEmail)!.add(followerEmail);
    }

    /**
     * Unfollow an account
     */
    unfollow(follower: Account, followee: Account): void {
        const followerEmail = follower.user.email.toString();
        const followeeEmail = followee.user.email.toString();

        // Remove the follow relationship
        this.following.get(followerEmail)?.delete(followeeEmail);
        this.followers.get(followeeEmail)?.delete(followerEmail);
    }

    /**
     * Get all accounts this account is following
     */
    getFollowing(account: Account): Account[] {
        const email = account.user.email.toString();
        const followingEmails = this.following.get(email) || new Set();
        return Array.from(followingEmails)
            .map(e => this.getAccountByEmail(e))
            .filter((a): a is Account => a !== null);
    }

    /**
     * Get all accounts following this account
     */
    getFollowers(account: Account): Account[] {
        const email = account.user.email.toString();
        const followerEmails = this.followers.get(email) || new Set();
        return Array.from(followerEmails)
            .map(e => this.getAccountByEmail(e))
            .filter((a): a is Account => a !== null);
    }

    /**
     * Check if one account is following another
     */
    isFollowing(follower: Account, followee: Account): boolean {
        const followerEmail = follower.user.email.toString();
        const followeeEmail = followee.user.email.toString();
        return this.following.get(followerEmail)?.has(followeeEmail) || false;
    }

    /**
     * Check if one account is followed by another
     */
    isFollowedBy(followee: Account, follower: Account): boolean {
        const followerEmail = follower.user.email.toString();
        const followeeEmail = followee.user.email.toString();
        return this.followers.get(followeeEmail)?.has(followerEmail) || false;
    }

    /**
     * Add an account to the processor
     */
    addAccount(account: Account): void {
        const socialNetwork = new SocialNetwork(account);
        this.socialNetworks.set(account.user.email.toString(), socialNetwork);
    }

    /**
     * Get an account by email
     */
    getAccountByEmail(email: string): Account | null {
        const socialNetwork = this.socialNetworks.get(email);
        return socialNetwork?.getAccount() || null;
    }

    /**
     * Get all accounts
     */
    getAllAccounts(): Account[] {
        return Array.from(this.socialNetworks.values()).map(network => network.getAccount());
    }

    /**
     * Get all messages
     */
    getAllMessages(): EmailMessage[] {
        return [...this.messages];
    }

    /**
     * Get messages from a specific sender
     */
    getMessagesFrom(sender: EmailAddress): EmailMessage[] {
        return this.messages.filter(message => message.from.equals(sender));
    }

    /**
     * Get messages to a specific recipient
     */
    getMessagesTo(recipient: EmailAddress): EmailMessage[] {
        return this.messages.filter(message => message.to.some(addr => addr.equals(recipient)));
    }

    /**
     * Get messages with a specific subject
     */
    getMessagesWithSubject(subject: string): EmailMessage[] {
        return this.messages.filter(message => message.subject === subject);
    }

    /**
     * Get messages with high priority
     */
    getHighPriorityMessages(): EmailMessage[] {
        return this.messages.filter(message => message.priority === 'high');
    }

    /**
     * Get messages with attachments
     */
    getMessagesWithAttachments(): EmailMessage[] {
        return this.messages.filter(message => message.attachments.length > 0);
    }

    /**
     * Get HTML messages
     */
    getHtmlMessages(): EmailMessage[] {
        return this.messages.filter(message => message.isHtml);
    }

    /**
     * Get plain text messages
     */
    getPlainTextMessages(): EmailMessage[] {
        return this.messages.filter(message => !message.isHtml);
    }

    /**
     * Get messages containing specific text in the body
     */
    getMessagesContaining(text: string): EmailMessage[] {
        return this.messages.filter(message => message.body.includes(text));
    }

    /**
     * Get messages within a date range
     */
    getMessagesInDateRange(startDate: Date, endDate: Date): EmailMessage[] {
        // Note: This assumes EmailMessage has a date property
        return this.messages.filter(message => {
            const messageDate = new Date(message.body); // This is a placeholder - we need to add date handling
            return messageDate >= startDate && messageDate <= endDate;
        });
    }

    /**
     * Remove a specific message
     */
    removeMessage(message: EmailMessage): void {
        const index = this.messages.indexOf(message);
        if (index !== -1) {
            this.messages.splice(index, 1);
        }
    }

    /**
     * Clear all messages
     */
    clearMessages(): void {
        this.messages = [];
    }

    /**
     * Get the total number of messages
     */
    getMessageCount(): number {
        return this.messages.length;
    }

    /**
     * Get unique senders
     */
    getUniqueSenders(): EmailAddress[] {
        return [...new Set(this.messages.map(message => message.from))];
    }

    /**
     * Get unique recipients
     */
    getUniqueRecipients(): EmailAddress[] {
        const recipients = this.messages.flatMap(message => message.to);
        return [...new Set(recipients)];
    }

    /**
     * Get messages grouped by sender
     */
    getMessagesGroupedBySender(): Map<EmailAddress, EmailMessage[]> {
        const grouped = new Map<EmailAddress, EmailMessage[]>();
        for (const message of this.messages) {
            if (!grouped.has(message.from)) {
                grouped.set(message.from, []);
            }
            grouped.get(message.from)!.push(message);
        }
        return grouped;
    }

    /**
     * Get messages grouped by priority
     */
    getMessagesGroupedByPriority(): Map<'high' | 'normal' | 'low', EmailMessage[]> {
        const grouped = new Map<'high' | 'normal' | 'low', EmailMessage[]>();
        for (const message of this.messages) {
            if (!grouped.has(message.priority)) {
                grouped.set(message.priority, []);
            }
            grouped.get(message.priority)!.push(message);
        }
        return grouped;
    }

    /**
     * Get social network for a specific email
     */
    getSocialNetwork(email: string): SocialNetwork | undefined {
        return this.socialNetworks.get(email);
    }

    /**
     * Get all social networks
     */
    getAllSocialNetworks(): SocialNetwork[] {
        return Array.from(this.socialNetworks.values());
    }
} 