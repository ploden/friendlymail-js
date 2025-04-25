import { ProcessMessages } from '../src/ProcessMessages';
import { EmailMessage } from '../EmailMessage';
import { EmailAddress } from '../src/models/EmailAddress';
import * as fs from 'fs';
import * as path from 'path';
import { Account } from '../src/models/Account';
import { User } from '../src/models/User';

describe('ProcessMessages', () => {
    let processor: ProcessMessages;
    let message1: EmailMessage;
    let message2: EmailMessage;
    let message3: EmailMessage;
    let createAccountMessage: EmailMessage;
    let createAccountMessage2: EmailMessage;
    let sender1: EmailAddress;
    let sender2: EmailAddress;
    let recipient1: EmailAddress;
    let recipient2: EmailAddress;

    beforeEach(async () => {
        processor = new ProcessMessages();

        sender1 = new EmailAddress('sender1@example.com');
        sender2 = new EmailAddress('sender2@example.com');
        recipient1 = new EmailAddress('recipient1@example.com');
        recipient2 = new EmailAddress('recipient2@example.com');

        message1 = new EmailMessage(
            sender1,
            [recipient1],
            'Test Subject 1',
            'Test Body 1',
            {
                priority: 'normal',
                isHtml: false,
                attachments: []
            }
        );

        message2 = new EmailMessage(
            sender1,
            [recipient2],
            'Test Subject 2',
            'Test Body 2',
            {
                priority: 'high',
                isHtml: false,
                attachments: []
            }
        );

        message3 = new EmailMessage(
            sender2,
            [recipient1],
            'Test Subject 3',
            'Test Body 3',
            {
                priority: 'normal',
                isHtml: true,
                attachments: []
            }
        );
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

    describe('Account Management', () => {
        it('should create an account from a create account message', async () => {
            const message = await EmailMessage.fromTextFile('create_command_create_account.txt');
            processor.addMessage(message);

            const account = processor.getAccount('ploden@gmail.com');
            expect(account).toBeDefined();
            expect(account?.user.username).toBe('Phil');
            expect(account?.user.email.toString()).toBe('ploden@gmail.com');
        });

        it('should not create an account from a non-create account message', async () => {
            // Create a non-create account message
            const fromAddr = new EmailAddress('ploden@gmail.com');
            const toAddr = new EmailAddress('ploden@gmail.com');
            const message = new EmailMessage(
                fromAddr,
                [toAddr],
                'Regular Subject',
                'Regular Body',
                {
                    priority: 'normal',
                    isHtml: false,
                    attachments: []
                }
            );
            processor.addMessage(message);

            const account = processor.getAccount('ploden@gmail.com');
            expect(account).toBeUndefined();
        });

        it('should handle multiple create account messages', async () => {
            const message1 = await EmailMessage.fromTextFile('create_command_create_account.txt');
            const message2 = await EmailMessage.fromTextFile('create_command_create_account_2.txt');
            
            processor.addMessage(message1);
            const account1 = processor.getAccount('ploden@gmail.com');
            expect(account1).toBeDefined();
            expect(account1?.user.username).toBe('Phil');

            processor.addMessage(message2);
            const account2 = processor.getAccount('ploden@gmail.com');
            expect(account2).toBeDefined();
            expect(account2?.user.username).toBe('ploden');
        });
    });

    describe('Message Management', () => {
        beforeEach(() => {
            processor.addMessages([message1, message2, message3]);
        });

        it('should get messages from a specific sender', () => {
            const sender1Messages = processor.getMessagesFrom(sender1);
            expect(sender1Messages).toHaveLength(2);
            expect(sender1Messages).toContain(message1);
            expect(sender1Messages).toContain(message2);
        });

        it('should get messages to a specific recipient', () => {
            const recipient1Messages = processor.getMessagesTo(recipient1);
            expect(recipient1Messages).toHaveLength(2);
            expect(recipient1Messages).toContain(message1);
            expect(recipient1Messages).toContain(message3);
        });

        it('should get messages with a specific subject', () => {
            const subjectMessages = processor.getMessagesWithSubject('Test Subject 1');
            expect(subjectMessages).toHaveLength(1);
            expect(subjectMessages).toContain(message1);
        });

        it('should get high priority messages', () => {
            const highPriorityMessages = processor.getHighPriorityMessages();
            expect(highPriorityMessages).toHaveLength(1);
            expect(highPriorityMessages).toContain(message2);
        });

        it('should get HTML messages', () => {
            const htmlMessages = processor.getHtmlMessages();
            expect(htmlMessages).toHaveLength(1);
            expect(htmlMessages).toContain(message3);
        });

        it('should get plain text messages', () => {
            const plainTextMessages = processor.getPlainTextMessages();
            expect(plainTextMessages).toHaveLength(2);
            expect(plainTextMessages).toContain(message1);
            expect(plainTextMessages).toContain(message2);
        });

        it('should get messages containing specific text', () => {
            const containingMessages = processor.getMessagesContaining('Body 1');
            expect(containingMessages).toHaveLength(1);
            expect(containingMessages).toContain(message1);
        });

        it('should group messages by sender', () => {
            const groupedBySender = processor.getMessagesGroupedBySender();
            expect(groupedBySender.get(sender1)).toHaveLength(2);
            expect(groupedBySender.get(sender2)).toHaveLength(1);
        });

        it('should group messages by priority', () => {
            const groupedByPriority = processor.getMessagesGroupedByPriority();
            expect(groupedByPriority.get('normal')).toHaveLength(2);
            expect(groupedByPriority.get('high')).toHaveLength(1);
        });

        it('should get unique senders', () => {
            const uniqueSenders = processor.getUniqueSenders();
            expect(uniqueSenders).toHaveLength(2);
            expect(uniqueSenders.includes(sender1)).toBe(true);
            expect(uniqueSenders.includes(sender2)).toBe(true);
        });

        it('should get unique recipients', () => {
            const uniqueRecipients = processor.getUniqueRecipients();
            expect(uniqueRecipients).toHaveLength(2);
            expect(uniqueRecipients.includes(recipient1)).toBe(true);
            expect(uniqueRecipients.includes(recipient2)).toBe(true);
        });
    });
}); 