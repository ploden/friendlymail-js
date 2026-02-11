import { EmailMessage } from '../EmailMessage';
import { Account } from './models/Account';
import { User } from './models/User';
import { SocialNetwork } from './models/SocialNetwork';
import { EmailAddress } from './models/EmailAddress';
import { MessageDraft } from './models/MessageDraft';
import { Mailbox } from './models/Mailbox';
import { FriendlymailMessageType } from './models/FriendlymailMessageType';
import { IProcessMessages } from './ProcessMessages.interface';
import * as path from 'path';
import * as fs from 'fs';
import { VERSION, SIGNATURE } from './constants';

export class ProcessMessages implements IProcessMessages {
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

    unfollow(follower: Account, followee: Account): void {
        const followerEmail = follower.user.email.toString();
        const followeeEmail = followee.user.email.toString();

        // Remove the follow relationship
        this.following.get(followerEmail)?.delete(followeeEmail);
        this.followers.get(followeeEmail)?.delete(followeeEmail);
    }

    getFollowing(account: Account): Account[] {
        const email = account.user.email.toString();
        const followingEmails = this.following.get(email) || new Set();
        return Array.from(followingEmails)
            .map(e => this.getAccountByEmail(e))
            .filter((a): a is Account => a !== null);
    }

    getFollowers(account: Account): Account[] {
        const email = account.user.email.toString();
        const followerEmails = this.followers.get(email) || new Set();
        return Array.from(followerEmails)
            .map(e => this.getAccountByEmail(e))
            .filter((a): a is Account => a !== null);
    }

    isFollowing(follower: Account, followee: Account): boolean {
        const followerEmail = follower.user.email.toString();
        const followeeEmail = followee.user.email.toString();
        return this.following.get(followerEmail)?.has(followeeEmail) || false;
    }

    isFollowedBy(followee: Account, follower: Account): boolean {
        const followerEmail = follower.user.email.toString();
        const followeeEmail = followee.user.email.toString();
        return this.followers.get(followeeEmail)?.has(followerEmail) || false;
    }

    addAccount(account: Account): void {
        const socialNetwork = new SocialNetwork(account);
        this.socialNetworks.set(account.user.email.toString(), socialNetwork);
    }

    getAccountByEmail(email: string): Account | null {
        const socialNetwork = this.socialNetworks.get(email);
        return socialNetwork?.getAccount() || null;
    }

    getAllAccounts(): Account[] {
        return Array.from(this.socialNetworks.values()).map(network => network.getAccount());
    }

    getAllMessages(): EmailMessage[] {
        return [...this.mailbox.receivedMessages];
    }

    getMessagesFrom(sender: EmailAddress): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.from.equals(sender));
    }

    getMessagesTo(recipient: EmailAddress): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.to.some(addr => addr.equals(recipient)));
    }

    getMessagesWithSubject(subject: string): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.subject === subject);
    }

    getHighPriorityMessages(): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.priority === 'high');
    }

    getMessagesWithAttachments(): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.attachments.length > 0);
    }

    getHtmlMessages(): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.isHtml);
    }

    getPlainTextMessages(): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => !message.isHtml);
    }

    getMessagesContaining(text: string): EmailMessage[] {
        return this.mailbox.receivedMessages.filter(message => message.body.includes(text));
    }

    getMessagesInDateRange(startDate: Date, endDate: Date): EmailMessage[] {
        // Note: This assumes EmailMessage has a date property
        return this.mailbox.receivedMessages.filter(message => {
            const messageDate = new Date(message.body); // This is a placeholder - we need to add date handling
            return messageDate >= startDate && messageDate <= endDate;
        });
    }

    removeMessage(message: EmailMessage): void {
        const receivedMessages = Array.from(this.mailbox.receivedMessages).filter(m => m !== message);
        this.mailbox = new Mailbox(
            this.mailbox.hostEmailAddress,
            receivedMessages,
            Array.from(this.mailbox.sentMessages),
            Array.from(this.mailbox.drafts)
        );
    }

    clearMessages(): void {
        this.mailbox = new Mailbox(
            this.mailbox.hostEmailAddress,
            [],
            Array.from(this.mailbox.sentMessages),
            Array.from(this.mailbox.drafts)
        );
    }

    getMessageCount(): number {
        return this.mailbox.receivedMessages.length;
    }

    getUniqueSenders(): EmailAddress[] {
        return Array.from(new Set(this.mailbox.receivedMessages.map(message => message.from)));
    }

    getUniqueRecipients(): EmailAddress[] {
        const recipients = this.mailbox.receivedMessages.flatMap(message => message.to);
        return Array.from(new Set(recipients));
    }

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

    getSocialNetwork(email: string): SocialNetwork | undefined {
        return this.socialNetworks.get(email);
    }

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
                    priority: 'normal',
                    messageType: FriendlymailMessageType.WELCOME
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
                priority: 'normal',
                messageType: FriendlymailMessageType.HELP
            }
        );

        this.mailbox = this.mailbox.addingDrafts([draft]) as Mailbox;
    }

    getMessageDrafts(): MessageDraft[] {
        return [...this.mailbox.drafts];
    }

    removeDraft(draft: MessageDraft): void {
        this.mailbox = this.mailbox.removingDrafts([draft]) as Mailbox;
    }

    hasWelcomeMessageBeenSent(sender: EmailAddress): boolean {
        return this.sentWelcomeMessages.has(sender.toString());
    }

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

    getSentMessages(): EmailMessage[] {
        return [...this.mailbox.sentMessages];
    }
}
