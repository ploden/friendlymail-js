import { EmailMessage } from '../EmailMessage';
import { Account } from './models/Account';
import { User } from './models/User';
import { SocialGraph } from './models/SocialGraph';
import * as path from 'path';

export class ProcessMessages {
    private messages: EmailMessage[];
    private accounts: Map<string, Account>;
    private socialGraphs: Map<string, SocialGraph>;

    constructor(messages: EmailMessage[] = []) {
        this.messages = messages;
        this.accounts = new Map();
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
        // Extract name and email from the From header
        // Handle different formats:
        // 1. "Name <email@example.com>" -> use username from useradd command
        // 2. "email@example.com" -> use username from useradd command
        let email: string;
        let displayName: string;

        const fromMatch = message.from.match(/^(?:(.+?)\s*<([^>]+)>|(.+))$/);
        if (fromMatch) {
            if (fromMatch[2]) {
                // Format: "Name <email@example.com>"
                email = fromMatch[2].trim();
            } else {
                // Format: "email@example.com"
                email = fromMatch[3].trim();
            }

            // Extract username from the message body after the useradd command and newlines
            const usernameMatch = message.body.match(/\$\s*useradd\s*\n+\s*(.+?)(?:\s*$|\n)/);
            displayName = usernameMatch ? usernameMatch[1].trim() : email.split('@')[0];
        } else {
            console.warn('Invalid From header format');
            return;
        }

        // Create a new user and account using the username from the useradd command
        const user = new User(displayName, email, 'password123'); // Default password, should be changed
        const account = new Account(user);
        const socialGraph = new SocialGraph(account);

        // Store the account and social graph
        this.accounts.set(email, account);
        this.socialGraphs.set(email, socialGraph);
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

        // Extract the sender's email from the From header
        const fromMatch = message.from.match(/^(?:(.+?)\s*<([^>]+)>|(.+))$/);
        if (!fromMatch) {
            console.warn('Invalid From header format');
            return;
        }
        const senderEmail = fromMatch[2] ? fromMatch[2].trim() : fromMatch[3].trim();

        // Get the sender's account (must already exist)
        const senderAccount = this.accounts.get(senderEmail);
        if (!senderAccount) {
            console.warn(`Cannot follow - sender account ${senderEmail} does not exist`);
            return;
        }

        // Get the account to follow (must already exist)
        const followAccount = this.accounts.get(followEmail);
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
        this.accounts.set(account.user.email, account);
    }

    /**
     * Get an account by email
     */
    getAccount(email: string): Account | undefined {
        return this.accounts.get(email);
    }

    /**
     * Get all accounts
     */
    getAllAccounts(): Account[] {
        return Array.from(this.accounts.values());
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
    getMessagesFrom(sender: string): EmailMessage[] {
        return this.messages.filter(message => message.from === sender);
    }

    /**
     * Get messages to a specific recipient
     */
    getMessagesTo(recipient: string): EmailMessage[] {
        return this.messages.filter(message => message.to.includes(recipient));
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
    getUniqueSenders(): string[] {
        return [...new Set(this.messages.map(message => message.from))];
    }

    /**
     * Get unique recipients
     */
    getUniqueRecipients(): string[] {
        const recipients = this.messages.flatMap(message => message.to);
        return [...new Set(recipients)];
    }

    /**
     * Get messages grouped by sender
     */
    getMessagesGroupedBySender(): Map<string, EmailMessage[]> {
        const grouped = new Map<string, EmailMessage[]>();
        this.messages.forEach(message => {
            const sender = message.from;
            if (!grouped.has(sender)) {
                grouped.set(sender, []);
            }
            grouped.get(sender)!.push(message);
        });
        return grouped;
    }

    /**
     * Get messages grouped by priority
     */
    getMessagesGroupedByPriority(): Map<'high' | 'normal' | 'low', EmailMessage[]> {
        const grouped = new Map<'high' | 'normal' | 'low', EmailMessage[]>();
        this.messages.forEach(message => {
            const priority = message.priority;
            if (!grouped.has(priority)) {
                grouped.set(priority, []);
            }
            grouped.get(priority)!.push(message);
        });
        return grouped;
    }

    /**
     * Get a social graph by email
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