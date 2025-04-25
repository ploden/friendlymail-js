import { ProcessMessages } from '../src/ProcessMessages';
import { EmailMessage } from '../EmailMessage';
import * as fs from 'fs';
import * as path from 'path';

describe('ProcessMessages', () => {
    let processor: ProcessMessages;
    let message1: EmailMessage;
    let message2: EmailMessage;
    let message3: EmailMessage;
    let createAccountMessage: EmailMessage;
    let createAccountMessage2: EmailMessage;

    beforeEach(async () => {
        processor = new ProcessMessages();

        // Create regular test messages
        message1 = new EmailMessage(
            'sender1@example.com',
            ['recipient1@example.com'],
            'Subject 1',
            'Body 1',
            { priority: 'high', isHtml: true }
        );
        message2 = new EmailMessage(
            'sender2@example.com',
            ['recipient2@example.com'],
            'Subject 2',
            'Body 2',
            { priority: 'normal', isHtml: false }
        );
        message3 = new EmailMessage(
            'sender1@example.com',
            ['recipient1@example.com', 'recipient2@example.com'],
            'Subject 3',
            'Body 3',
            { priority: 'high', isHtml: true }
        );

        // Create account messages with different formats
        try {
            const filePath1 = path.resolve(__dirname, '..', 'create_command_create_account.txt');
            const filePath2 = path.resolve(__dirname, '..', 'create_command_create_account_2.txt');

            // Check if files exist
            if (!fs.existsSync(filePath1) || !fs.existsSync(filePath2)) {
                throw new Error('Test files not found');
            }

            createAccountMessage = await EmailMessage.fromTextFile(filePath1);
            createAccountMessage2 = await EmailMessage.fromTextFile(filePath2);
        } catch (error) {
            console.error('Error loading test files:', error);
            throw error;
        }
    });

    describe('Basic Operations', () => {
        it('should add and retrieve messages', () => {
            processor.addMessage(message1);
            processor.addMessages([message2, message3]);

            const allMessages = processor.getAllMessages();
            expect(allMessages).toHaveLength(3);
            expect(allMessages).toContain(message1);
            expect(allMessages).toContain(message2);
            expect(allMessages).toContain(message3);
        });

        it('should remove messages', () => {
            processor.addMessages([message1, message2, message3]);
            processor.removeMessage(message2);

            const allMessages = processor.getAllMessages();
            expect(allMessages).toHaveLength(2);
            expect(allMessages).not.toContain(message2);
        });

        it('should clear all messages', () => {
            processor.addMessages([message1, message2, message3]);
            processor.clearMessages();

            expect(processor.getMessageCount()).toBe(0);
        });
    });

    describe('Account Creation', () => {
        it('should create an account from a create account message with name and email format', () => {
            processor.addMessage(createAccountMessage);

            const account = processor.getAccount('ploden@gmail.com');
            expect(account).toBeDefined();
            expect(account?.user.username).toBe('Phil');
            expect(account?.user.email).toBe('ploden@gmail.com');
        });

        it('should create an account from a create account message with email-only format', () => {
            processor.addMessage(createAccountMessage2);

            const account = processor.getAccount('ploden@gmail.com');
            expect(account).toBeDefined();
            expect(account?.user.username).toBe('ploden'); // Uses email local part as name
            expect(account?.user.email).toBe('ploden@gmail.com');
        });

        it('should not create an account from non-create account messages', () => {
            processor.addMessages([message1, message2, message3]);

            expect(processor.getAllAccounts()).toHaveLength(0);
        });

        it('should handle multiple create account messages with different formats', () => {
            processor.addMessage(createAccountMessage);
            processor.addMessage(createAccountMessage2);

            const accounts = processor.getAllAccounts();
            expect(accounts).toHaveLength(1); // Should only create one account per email
        });
    });

    describe('Filtering Methods', () => {
        beforeEach(() => {
            processor.addMessages([message1, message2, message3]);
        });

        it('should filter messages by sender', () => {
            const sender1Messages = processor.getMessagesFrom('sender1@example.com');
            expect(sender1Messages).toHaveLength(2);
            expect(sender1Messages).toContain(message1);
            expect(sender1Messages).toContain(message3);
        });

        it('should filter messages by recipient', () => {
            const recipient1Messages = processor.getMessagesTo('recipient1@example.com');
            expect(recipient1Messages).toHaveLength(2);
            expect(recipient1Messages).toContain(message1);
            expect(recipient1Messages).toContain(message3);
        });

        it('should filter messages by subject', () => {
            const subject2Messages = processor.getMessagesWithSubject('Subject 2');
            expect(subject2Messages).toHaveLength(1);
            expect(subject2Messages).toContain(message2);
        });

        it('should filter high priority messages', () => {
            const highPriorityMessages = processor.getHighPriorityMessages();
            expect(highPriorityMessages).toHaveLength(2);
            expect(highPriorityMessages).toContain(message1);
            expect(highPriorityMessages).toContain(message3);
        });

        it('should filter HTML messages', () => {
            const htmlMessages = processor.getHtmlMessages();
            expect(htmlMessages).toHaveLength(2);
            expect(htmlMessages).toContain(message1);
            expect(htmlMessages).toContain(message3);
        });

        it('should filter plain text messages', () => {
            const plainTextMessages = processor.getPlainTextMessages();
            expect(plainTextMessages).toHaveLength(1);
            expect(plainTextMessages).toContain(message2);
        });

        it('should filter messages containing text', () => {
            const body1Messages = processor.getMessagesContaining('Body 1');
            expect(body1Messages).toHaveLength(1);
            expect(body1Messages).toContain(message1);
        });
    });

    describe('Analysis Methods', () => {
        beforeEach(() => {
            processor.addMessages([message1, message2, message3]);
        });

        it('should get unique senders', () => {
            const uniqueSenders = processor.getUniqueSenders();
            expect(uniqueSenders).toHaveLength(2);
            expect(uniqueSenders).toContain('sender1@example.com');
            expect(uniqueSenders).toContain('sender2@example.com');
        });

        it('should get unique recipients', () => {
            const uniqueRecipients = processor.getUniqueRecipients();
            expect(uniqueRecipients).toHaveLength(2);
            expect(uniqueRecipients).toContain('recipient1@example.com');
            expect(uniqueRecipients).toContain('recipient2@example.com');
        });

        it('should group messages by sender', () => {
            const groupedBySender = processor.getMessagesGroupedBySender();
            expect(groupedBySender.get('sender1@example.com')).toHaveLength(2);
            expect(groupedBySender.get('sender2@example.com')).toHaveLength(1);
        });

        it('should group messages by priority', () => {
            const groupedByPriority = processor.getMessagesGroupedByPriority();
            expect(groupedByPriority.get('high')).toHaveLength(2);
            expect(groupedByPriority.get('normal')).toHaveLength(1);
        });
    });
}); 