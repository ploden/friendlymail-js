import { EmailMessage } from '../EmailMessage';
import { Account } from './models/Account';
import { User } from './models/User';
import { SocialGraph } from './models/SocialGraph';
import { EmailAddress } from './models/EmailAddress';
import * as path from 'path';

export class ProcessMessages {
    private messages: EmailMessage[];
    private socialGraphs: Map<string, SocialGraph>;

    constructor(messages: EmailMessage[] = []) {
        this.messages = messages;
        this.socialGraphs = new Map();
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
    private createAccountFromMessage(message: EmailMessage): void {
        // Extract username from message body after useradd command
        const usernameMatch = message.body.match(/\$\s*useradd\s*\n+\s*([^\n]+)/);
        if (!usernameMatch) {
            console.warn('No username found in create account command message');
            return;
        }

        const username = usernameMatch[1].trim();
        const fromEmail = message.from;

        // If account exists, update the username
        const existingAccount = this.getAccount(fromEmail.toString());
        if (existingAccount) {
            existingAccount.user.updateProfile({ username });
            return;
        }

        // Create a new user and account using the username from the useradd command
        const user = new User(username, fromEmail);
        const account = new Account(user);
        const socialGraph = new SocialGraph(account);

        // Store the social graph
        this.socialGraphs.set(fromEmail.toString(), socialGraph);
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
        const senderAccount = this.getAccount(message.from.toString());
        if (!senderAccount) {
            console.warn(`Cannot follow - sender account ${message.from.toString()} does not exist`);
            return;
        }

        // Get the account to follow (must already exist)
        const followAccount = this.getAccount(followEmail);
        if (!followAccount) {
            console.warn(`Cannot follow ${followEmail} - account does not exist`);
            return;
        }

        // Add the follow relationship using the account's social graph
        senderAccount.socialGraph.follow(followAccount);
    }

    /**
     * Add an account to the processor
     */
    addAccount(account: Account): void {
        const socialGraph = new SocialGraph(account);
        this.socialGraphs.set(account.user.email.toString(), socialGraph);
    }

    /**
     * Get an account by email
     */
    getAccount(email: string): Account | undefined {
        const socialGraph = this.socialGraphs.get(email);
        return socialGraph?.getAccount();
    }

    /**
     * Get all accounts
     */
    getAllAccounts(): Account[] {
        return Array.from(this.socialGraphs.values()).map(graph => graph.getAccount());
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
     * Get social graph for a specific email
     */
    getSocialGraph(email: string): SocialGraph | undefined {
        return this.socialGraphs.get(email);
    }

    /**
     * Get all social graphs
     */
    getAllSocialGraphs(): SocialGraph[] {
        return Array.from(this.socialGraphs.values());
    }
} 