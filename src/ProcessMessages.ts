import { EmailMessage } from '../EmailMessage';
import { Account } from './models/Account';
import { User } from './models/User';
import { SocialNetwork } from './models/SocialNetwork';
import { EmailAddress } from './models/EmailAddress';
import { MessageDraft } from './models/MessageDraft';
import { Mailbox } from './models/Mailbox';
import * as path from 'path';
import * as fs from 'fs';
import { VERSION, SIGNATURE } from './constants';

export class ProcessMessages {
    private mailbox: Mailbox;
    private sentWelcomeMessages: Set<string>;
    private socialNetworks: Map<string, SocialNetwork>;
    private following: Map<string, Set<string>>;
    private followers: Map<string, Set<string>>;

    constructor(mailbox: Mailbox) {
        this.mailbox = mailbox;
        this.sentWelcomeMessages = new Set();
        this.socialNetworks = new Map();
        this.following = new Map();
        this.followers = new Map();
        
        if (this.shouldCreateWelcomeMessageDraft()) {
            this.createWelcomeMessageDraftForHost();
        }
        
        mailbox.receivedMessages.forEach(message => this.processMessage(message));
    }

    /**
     * Process a single message
     */
    private processMessage(message: EmailMessage): void {
        // Check if this is a help command
        if (message.subject === 'Fm' && message.body.trim().toLowerCase() === 'help') {
            this.createHelpMessageDraft(message);
        }
        // Check if this is a create account command
        else if (message.subject === 'fm' && message.body.includes('$ useradd')) {
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
        return [...this.mailbox.receivedMessages];
    }

    /**
     * Get messages from a specific sender
     */
    getMessagesFrom(sender: EmailAddress): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.from.equals(sender));
    }

    /**
     * Get messages to a specific recipient
     */
    getMessagesTo(recipient: EmailAddress): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.to.some(addr => addr.equals(recipient)));
    }

    /**
     * Get messages with a specific subject
     */
    getMessagesWithSubject(subject: string): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.subject === subject);
    }

    /**
     * Get messages with high priority
     */
    getHighPriorityMessages(): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.priority === 'high');
    }

    /**
     * Get messages with attachments
     */
    getMessagesWithAttachments(): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.attachments.length > 0);
    }

    /**
     * Get HTML messages
     */
    getHtmlMessages(): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.isHtml);
    }

    /**
     * Get plain text messages
     */
    getPlainTextMessages(): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => !message.isHtml);
    }

    /**
     * Get messages containing specific text in the body
     */
    getMessagesContaining(text: string): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.body.includes(text));
    }

    /**
     * Get messages within a date range
     */
    getMessagesInDateRange(startDate: Date, endDate: Date): EmailMessage[] {
        // Note: This assumes EmailMessage has a date property
        return this.mailbox.receivedMessages.filter(message => {
            const messageDate = new Date(message.body); // This is a placeholder - we need to add date handling
            return messageDate >= startDate && messageDate <= endDate;
        });
    }

    /**
     * Remove a specific message
     */
    removeMessage(message: EmailMessage): void {
        const receivedMessages = Array.from(this.mailbox.receivedMessages).filter(m => m !== message);
        this.mailbox = new Mailbox(
            this.mailbox.hostEmailAddress,
            receivedMessages,
            Array.from(this.mailbox.sentMessages),
            Array.from(this.mailbox.drafts)
        );
    }

    /**
     * Clear all messages
     */
    clearMessages(): void {
        this.mailbox = new Mailbox(
            this.mailbox.hostEmailAddress,
            [],
            Array.from(this.mailbox.sentMessages),
            Array.from(this.mailbox.drafts)
        );
    }

    /**
     * Get the total number of messages
     */
    getMessageCount(): number {
        return this.mailbox.receivedMessages.length;
    }

    /**
     * Get unique senders
     */
    getUniqueSenders(): EmailAddress[] {
        return [...new Set(this.mailbox.receivedMessages.map(message => message.from))];
    }

    /**
     * Get unique recipients
     */
    getUniqueRecipients(): EmailAddress[] {
        const recipients = this.mailbox.receivedMessages.flatMap(message => message.to);
        return [...new Set(recipients)];
    }

    /**
     * Get messages grouped by sender
     */
    getMessagesGroupedBySender(): Map<EmailAddress, EmailMessage[]> {
        const grouped = new Map<EmailAddress, EmailMessage[]>();
        for (const message of this.mailbox.receivedMessages) {
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
        for (const message of this.mailbox.receivedMessages) {
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

    /**
     * Returns true if a welcome message draft should be created, false otherwise.
     * A welcome message should be sent to the host if a welcome message has not already been sent.
     */
    private shouldCreateWelcomeMessageDraft(): Boolean {
        const hostEmail = this.mailbox.hostEmailAddress.toString();
        return !this.sentWelcomeMessages.has(hostEmail);
    }

    /**
     * Create a welcome message draft from host to host (when no messages provided)
     */
    private createWelcomeMessageDraftForHost(): void {
        const hostEmail = this.mailbox.hostEmailAddress.toString();
        
        // Check if welcome message has already been sent for the host
        if (this.sentWelcomeMessages.has(hostEmail)) {
            return;
        }

        try {
            // Load welcome template - path relative to project root
            const templatePath = path.join(process.cwd(), 'src', 'templates', 'welcome_template.txt');
            const templateContent = fs.readFileSync(templatePath, 'utf8');
            
            // Replace template placeholders with constants
            const body = templateContent
                .replace('{{ version }}', VERSION)
                .replace('{{ signature }}', SIGNATURE);
            
            // Create draft with host as sender and host as recipient
            const draft = new MessageDraft(
                this.mailbox.hostEmailAddress,
                [this.mailbox.hostEmailAddress],
                'Welcome to friendlymail',
                body,
                {
                    isHtml: false,
                    priority: 'normal'
                }
            );

            // Queue the draft for sending
            this.mailbox = this.mailbox.addingDrafts([draft]) as Mailbox;
            
            // Mark as sent to prevent duplicates
            this.sentWelcomeMessages.add(hostEmail);
        } catch (error) {
            console.warn(`Failed to create welcome message draft for host ${hostEmail}:`, error);
        }
    }

    /**
     * Create a help message draft in response to a help command
     */
    private createHelpMessageDraft(message: EmailMessage): void {
        const sender = message.from;
        if (!sender) {
            console.warn('Cannot create help message: missing sender');
            return;
        }

        const helpBody = `$ help
friendlymail: friendlymail, version ${VERSION}
These shell commands are defined internally.  Type \`help' to see this list.
Type \`help name' to find out more about the function \`name'.

useradd
help

${SIGNATURE}`;

        const draft = new MessageDraft(
            this.mailbox.hostEmailAddress,
            [sender],
            'Re: Fm',
            helpBody,
            {
                isHtml: false,
                priority: 'normal'
            }
        );

        this.mailbox = this.mailbox.addingDrafts([draft]) as Mailbox;
    }

    /**
     * Get all message drafts queued for sending
     */
    getMessageDrafts(): MessageDraft[] {
        return [...this.mailbox.drafts];
    }

    /**
     * Remove a draft from the queue (typically after sending)
     */
    removeDraft(draft: MessageDraft): void {
        this.mailbox = this.mailbox.removingDrafts([draft]) as Mailbox;
    }

    /**
     * Check if a welcome message has been sent for a sender
     */
    hasWelcomeMessageBeenSent(sender: EmailAddress): boolean {
        return this.sentWelcomeMessages.has(sender.toString());
    }

    /**
     * Send a draft message by converting it to an EmailMessage and adding it to sentMessages
     * @param draftIndex The index of the draft to send (0-based)
     * @returns The sent EmailMessage, or null if the index is invalid or draft is not ready
     */
    sendDraft(draftIndex: number): EmailMessage | null {
        const drafts = this.mailbox.drafts;
        if (draftIndex < 0 || draftIndex >= drafts.length) {
            return null;
        }

        const draft = drafts[draftIndex];
        if (!draft.isReadyToSend()) {
            return null;
        }

        const emailMessage = draft.toEmailMessage();
        this.mailbox = this.mailbox.addingSentMessages([emailMessage]) as Mailbox;
        this.mailbox = this.mailbox.removingDrafts([draft]) as Mailbox;

        return emailMessage;
    }

    /**
     * Get all sent messages
     */
    getSentMessages(): EmailMessage[] {
        return [...this.mailbox.sentMessages];
    }
} 