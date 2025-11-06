import { ProcessMessages } from '../src/ProcessMessages';
import { EmailMessage } from '../EmailMessage';
import { EmailAddress } from '../src/models/EmailAddress';
import { MessageDraft } from '../src/models/MessageDraft';
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
        const hostEmail = new EmailAddress('friendlymail@example.com');
        processor = new ProcessMessages(hostEmail);

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
            const hostEmail = new EmailAddress('friendlymail@example.com');
            processor = new ProcessMessages(hostEmail, [message1, message2, message3]);

            const allMessages = processor.getAllMessages();
            expect(allMessages).toHaveLength(3);
            expect(allMessages).toContain(message1);
            expect(allMessages).toContain(message2);
            expect(allMessages).toContain(message3);
        });

        it('should remove messages', () => {
            const hostEmail = new EmailAddress('friendlymail@example.com');
            processor = new ProcessMessages(hostEmail, [message1, message2, message3]);
            processor.removeMessage(message2);

            const allMessages = processor.getAllMessages();
            expect(allMessages).toHaveLength(2);
            expect(allMessages).not.toContain(message2);
        });

        it('should clear all messages', () => {
            const hostEmail = new EmailAddress('friendlymail@example.com');
            processor = new ProcessMessages(hostEmail, [message1, message2, message3]);
            processor.clearMessages();

            expect(processor.getMessageCount()).toBe(0);
        });
    });

    describe('Account Management', () => {
        it('should create an account from a create account message', async () => {
            const message = await EmailMessage.fromTextFile('create_command_create_account.txt');
            const hostEmail = new EmailAddress('friendlymail@example.com');
            processor = new ProcessMessages(hostEmail, [message]);

            const account = processor.getAccountByEmail('ploden@gmail.com');
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
            const hostEmail = new EmailAddress('friendlymail@example.com');
            processor = new ProcessMessages(hostEmail, [message]);

            const account = processor.getAccountByEmail('ploden@gmail.com');
            expect(account).toBeNull();
        });

        it('should handle multiple create account messages', async () => {
            const message1 = await EmailMessage.fromTextFile('create_command_create_account.txt');
            const message2 = await EmailMessage.fromTextFile('create_command_create_account_2.txt');
            
            const hostEmail = new EmailAddress('friendlymail@example.com');
            processor = new ProcessMessages(hostEmail, [message1]);
            const account1 = processor.getAccountByEmail('ploden@gmail.com');
            expect(account1).toBeDefined();
            expect(account1?.user.username).toBe('Phil');

            processor = new ProcessMessages(hostEmail, [message1, message2]);
            const account2 = processor.getAccountByEmail('ploden@gmail.com');
            expect(account2).toBeDefined();
            expect(account2?.user.username).toBe('ploden');
        });
    });

    describe('Welcome Message Drafts', () => {
        it('should create a welcome message draft when a new account is created', async () => {
            const message = await EmailMessage.fromTextFile('create_command_create_account.txt');
            const senderEmail = new EmailAddress('ploden@gmail.com');
            const hostEmail = new EmailAddress('friendlymail@example.com');
            
            processor = new ProcessMessages(hostEmail, [message]);
            
            const drafts = processor.getMessageDrafts();
            expect(drafts).toHaveLength(1);
            
            const welcomeDraft = drafts[0];
            expect(welcomeDraft).toBeDefined();
            expect(welcomeDraft.from?.equals(senderEmail)).toBe(true);
            expect(welcomeDraft.to).toHaveLength(1);
            expect(welcomeDraft.to[0].equals(hostEmail)).toBe(true);
            expect(welcomeDraft.subject).toBe('Welcome to friendlymail');
            
            // Verify template content was loaded and signature placeholder was replaced
            const templatePath = path.join(process.cwd(), 'src', 'templates', 'welcome_template.txt');
            const templateContent = fs.readFileSync(templatePath, 'utf8');
            const expectedBody = templateContent.replace('{{ signature }}', 'friendlymail@example.com');
            expect(welcomeDraft.body).toBe(expectedBody);
        });

        it('should not create duplicate welcome message drafts for the same recipient', async () => {
            const message = await EmailMessage.fromTextFile('create_command_create_account.txt');
            const senderEmail = new EmailAddress('ploden@gmail.com');
            const hostEmail = new EmailAddress('friendlymail@example.com');
            
            // Create account first time
            processor = new ProcessMessages(hostEmail, [message]);
            let drafts = processor.getMessageDrafts();
            expect(drafts).toHaveLength(1);
            
            // Try to create account again (should update username, but still create welcome message)
            processor = new ProcessMessages(hostEmail, [message]);
            drafts = processor.getMessageDrafts();
            expect(drafts).toHaveLength(1);
            
            // Verify welcome message was marked as sent
            expect(processor.hasWelcomeMessageBeenSent(senderEmail)).toBe(true);
        });

        it('should create separate welcome message drafts for different recipients', async () => {
            const message1 = await EmailMessage.fromTextFile('create_command_create_account.txt');
            const message2 = await EmailMessage.fromTextFile(path.join(__dirname, 'test_data', 'create_command_create_account2.txt'));
            const hostEmail = new EmailAddress('friendlymail@example.com');
            
            processor = new ProcessMessages(hostEmail, [message1, message2]);
            
            const drafts = processor.getMessageDrafts();
            expect(drafts).toHaveLength(2);
            
            // Both drafts should be sent to host address
            const recipientEmails = drafts.map(d => d.to[0].toString());
            expect(recipientEmails).toContain('friendlymail@example.com');
            expect(recipientEmails).toContain('friendlymail@example.com');
            
            // But from different senders
            const senderEmails = drafts.map(d => d.from?.toString());
            expect(senderEmails).toContain('ploden@gmail.com');
            expect(senderEmails).toContain('phil@example.com');
        });

        it('should not create welcome message draft for non-create account messages', async () => {
            const fromAddr = new EmailAddress('test@example.com');
            const toAddr = new EmailAddress('test@example.com');
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
            const hostEmail = new EmailAddress('friendlymail@example.com');
            
            processor = new ProcessMessages(hostEmail, [message]);
            
            const drafts = processor.getMessageDrafts();
            expect(drafts).toHaveLength(0);
            expect(processor.hasWelcomeMessageBeenSent(fromAddr)).toBe(false);
        });

        it('should create welcome message draft even when account creation fails', async () => {
            // Create a message with invalid account creation (missing username)
            const fromAddr = new EmailAddress('test@example.com');
            const toAddr = new EmailAddress('test@example.com');
            const message = new EmailMessage(
                fromAddr,
                [toAddr],
                'fm',
                '$ useradd\n',
                {
                    priority: 'normal',
                    isHtml: false,
                    attachments: []
                }
            );
            const hostEmail = new EmailAddress('friendlymail@example.com');
            
            processor = new ProcessMessages(hostEmail, [message]);
            
            // Welcome message should still be created
            const drafts = processor.getMessageDrafts();
            expect(drafts).toHaveLength(1);
            
            const draft = drafts[0];
            expect(draft.from?.equals(fromAddr)).toBe(true);
            expect(draft.to[0].equals(new EmailAddress('friendlymail@example.com'))).toBe(true);
            
            // Account should not be created
            const account = processor.getAccountByEmail('test@example.com');
            expect(account).toBeNull();
        });

        it('should queue welcome message draft with correct properties', async () => {
            const message = await EmailMessage.fromTextFile('create_command_create_account.txt');
            const hostEmail = new EmailAddress('friendlymail@example.com');
            processor = new ProcessMessages(hostEmail, [message]);
            
            const drafts = processor.getMessageDrafts();
            expect(drafts).toHaveLength(1);
            
            const draft = drafts[0];
            expect(draft.isHtml).toBe(false);
            expect(draft.priority).toBe('normal');
            expect(draft.attachments).toHaveLength(0);
            expect(draft.cc).toHaveLength(0);
            expect(draft.bcc).toHaveLength(0);
        });
    });

    describe('Message Management', () => {
        beforeEach(() => {
            const hostEmail = new EmailAddress('friendlymail@example.com');
            processor = new ProcessMessages(hostEmail, [message1, message2, message3]);
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