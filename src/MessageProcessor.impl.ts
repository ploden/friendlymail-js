import { EmailMessage } from '../EmailMessage';
import { Account } from './models/Account';
import { User } from './models/User';
import { SocialNetwork } from './models/SocialNetwork';
import { EmailAddress } from './models/EmailAddress';
import { MessageDraft } from './models/MessageDraft';
import { FriendlymailMessageType } from './models/FriendlymailMessageType';
import { IMessageProcessor } from './MessageProcessor.interface';
import { encodeQuotedPrintable, decodeQuotedPrintable } from './utils/quotedPrintable';
import * as path from 'path';
import * as fs from 'fs';
import { VERSION, SIGNATURE } from './constants';

export class MessageProcessor implements IMessageProcessor {
    private _hostEmailAddress: EmailAddress;
    private _receivedMessages: EmailMessage[];
    private _drafts: MessageDraft[];
    private _sentMessages: EmailMessage[];
    private socialNetworks: Map<string, SocialNetwork>;
    private following: Map<string, Set<string>>;
    private followers: Map<string, Set<string>>;

    constructor(hostEmailAddress: EmailAddress, receivedMessages: EmailMessage[] = []) {
        this._hostEmailAddress = hostEmailAddress;
        this._receivedMessages = [...receivedMessages];
        this._drafts = [];
        this._sentMessages = [];
        this.socialNetworks = new Map();
        this.following = new Map();
        this.followers = new Map();

        if (this.shouldCreateWelcomeMessageDraft()) {
            this.createWelcomeMessageDraftForHost();
        }

        this._receivedMessages.forEach(message => this.processMessage(message));
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
        return [...this._receivedMessages];
    }

    getMessagesFrom(sender: EmailAddress): EmailMessage[] {
        return this._receivedMessages.filter(message => message.from.equals(sender));
    }

    getMessagesTo(recipient: EmailAddress): EmailMessage[] {
        return this._receivedMessages.filter(message => message.to.some(addr => addr.equals(recipient)));
    }

    getMessagesWithSubject(subject: string): EmailMessage[] {
        return this._receivedMessages.filter(message => message.subject === subject);
    }

    getHighPriorityMessages(): EmailMessage[] {
        return this._receivedMessages.filter(message => message.priority === 'high');
    }

    getMessagesWithAttachments(): EmailMessage[] {
        return this._receivedMessages.filter(message => message.attachments.length > 0);
    }

    getHtmlMessages(): EmailMessage[] {
        return this._receivedMessages.filter(message => message.isHtml);
    }

    getPlainTextMessages(): EmailMessage[] {
        return this._receivedMessages.filter(message => !message.isHtml);
    }

    getMessagesContaining(text: string): EmailMessage[] {
        return this._receivedMessages.filter(message => message.body.includes(text));
    }

    getMessagesInDateRange(startDate: Date, endDate: Date): EmailMessage[] {
        // Note: This assumes EmailMessage has a date property
        return this._receivedMessages.filter(message => {
            const messageDate = new Date(message.body); // This is a placeholder - we need to add date handling
            return messageDate >= startDate && messageDate <= endDate;
        });
    }

    removeMessage(message: EmailMessage): void {
        this._receivedMessages = this._receivedMessages.filter(m => m !== message);
    }

    clearMessages(): void {
        this._receivedMessages = [];
    }

    getMessageCount(): number {
        return this._receivedMessages.length;
    }

    getUniqueSenders(): EmailAddress[] {
        return Array.from(new Set(this._receivedMessages.map(message => message.from)));
    }

    getUniqueRecipients(): EmailAddress[] {
        const recipients = this._receivedMessages.flatMap(message => message.to);
        return Array.from(new Set(recipients));
    }

    getMessagesGroupedBySender(): Map<EmailAddress, EmailMessage[]> {
        const grouped = new Map<EmailAddress, EmailMessage[]>();
        for (const message of this._receivedMessages) {
            if (!grouped.has(message.from)) {
                grouped.set(message.from, []);
            }
            grouped.get(message.from)!.push(message);
        }
        return grouped;
    }

    getMessagesGroupedByPriority(): Map<'high' | 'normal' | 'low', EmailMessage[]> {
        const grouped = new Map<'high' | 'normal' | 'low', EmailMessage[]>();
        for (const message of this._receivedMessages) {
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
     * Returns true if any received message carries an X-friendlymail header
     * identifying it as a welcome message.
     */
    private _welcomeMessageExists(): boolean {
        return this._receivedMessages.some(msg => {
            const header = msg.getCustomHeader('X-friendlymail');
            if (!header) return false;
            try {
                const meta = JSON.parse(decodeQuotedPrintable(header));
                return meta.messageType === FriendlymailMessageType.WELCOME;
            } catch {
                return false;
            }
        });
    }

    /**
     * Returns true if a welcome message draft should be created.
     * A welcome draft is only created when no welcome message is already present
     * in the received messages.
     */
    private shouldCreateWelcomeMessageDraft(): boolean {
        return !this._welcomeMessageExists();
    }

    /**
     * Create a welcome message draft from host to host.
     */
    private createWelcomeMessageDraftForHost(): void {
        const hostEmail = this._hostEmailAddress.toString();

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
                this._hostEmailAddress,
                [this._hostEmailAddress],
                'Welcome to friendlymail',
                body,
                {
                    isHtml: false,
                    priority: 'normal',
                    messageType: FriendlymailMessageType.WELCOME
                }
            );

            this._drafts.push(draft);
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
            this._hostEmailAddress,
            [sender],
            'Re: Fm',
            helpBody,
            {
                isHtml: false,
                priority: 'normal',
                messageType: FriendlymailMessageType.HELP
            }
        );

        this._drafts.push(draft);
    }

    getMessageDrafts(): MessageDraft[] {
        return [...this._drafts];
    }

    removeDraft(draft: MessageDraft): void {
        this._drafts = this._drafts.filter(d => d !== draft);
    }

    hasWelcomeMessageBeenSent(sender: EmailAddress): boolean {
        return this._welcomeMessageExists();
    }

    sendDraft(draftIndex: number): EmailMessage | null {
        if (draftIndex < 0 || draftIndex >= this._drafts.length) {
            return null;
        }

        const draft = this._drafts[draftIndex];
        if (!draft.isReadyToSend()) {
            return null;
        }

        const customHeaders = new Map<string, string>();
        if (draft.messageType !== null) {
            const metadata = JSON.stringify({ messageType: draft.messageType });
            customHeaders.set('X-friendlymail', encodeQuotedPrintable(metadata));
        }
        const emailMessage = new EmailMessage(
            draft.from!,
            draft.to,
            draft.subject,
            draft.body,
            {
                cc: draft.cc,
                bcc: draft.bcc,
                attachments: draft.attachments,
                isHtml: draft.isHtml,
                priority: draft.priority,
                customHeaders
            }
        );
        this._sentMessages.push(emailMessage);
        this._drafts = this._drafts.filter(d => d !== draft);

        return emailMessage;
    }

    getSentMessages(): EmailMessage[] {
        return [...this._sentMessages];
    }
}
