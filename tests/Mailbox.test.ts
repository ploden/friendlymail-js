import { Mailbox } from '../src/models/Mailbox';
import { EmailAddress } from '../src/models/EmailAddress';
import { EmailMessage } from '../EmailMessage';
import { MessageDraft } from '../src/models/MessageDraft';

describe('Mailbox', () => {
    // Test that a Mailbox can be created with just a host email address
    it('should create a mailbox with host email address only', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox = new Mailbox(hostEmail);
        
        expect(mailbox.hostEmailAddress.equals(hostEmail)).toBe(true);
        expect(mailbox.receivedMessages.length).toBe(0);
        expect(mailbox.sentMessages.length).toBe(0);
        expect(mailbox.drafts.length).toBe(0);
    });

    // Test that a Mailbox can be created with host email address and received messages
    it('should create a mailbox with host email address and received messages', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const receivedMessage = new EmailMessage(
            new EmailAddress('sender@test.com'),
            [hostEmail],
            'Test Subject',
            'Test body'
        );
        const mailbox = new Mailbox(hostEmail, [receivedMessage]);
        
        expect(mailbox.hostEmailAddress.equals(hostEmail)).toBe(true);
        expect(mailbox.receivedMessages.length).toBe(1);
        expect(mailbox.receivedMessages[0]).toBe(receivedMessage);
        expect(mailbox.sentMessages.length).toBe(0);
        expect(mailbox.drafts.length).toBe(0);
    });

    // Test that a Mailbox can be created with host email address and sent messages
    it('should create a mailbox with host email address and sent messages', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const sentMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Test Subject',
            'Test body'
        );
        const mailbox = new Mailbox(hostEmail, [], [sentMessage]);
        
        expect(mailbox.hostEmailAddress.equals(hostEmail)).toBe(true);
        expect(mailbox.receivedMessages.length).toBe(0);
        expect(mailbox.sentMessages.length).toBe(1);
        expect(mailbox.sentMessages[0]).toBe(sentMessage);
        expect(mailbox.drafts.length).toBe(0);
    });

    // Test that a Mailbox can be created with host email address and drafts
    it('should create a mailbox with host email address and drafts', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const draft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Draft Subject',
            'Draft body'
        );
        const mailbox = new Mailbox(hostEmail, [], [], [draft]);
        
        expect(mailbox.hostEmailAddress.equals(hostEmail)).toBe(true);
        expect(mailbox.receivedMessages.length).toBe(0);
        expect(mailbox.sentMessages.length).toBe(0);
        expect(mailbox.drafts.length).toBe(1);
        expect(mailbox.drafts[0]).toBe(draft);
    });

    // Test that a Mailbox can be created with all parameters
    it('should create a mailbox with host email address, received messages, sent messages, and drafts', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const receivedMessage = new EmailMessage(
            new EmailAddress('sender@test.com'),
            [hostEmail],
            'Received Subject',
            'Received body'
        );
        const sentMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Sent Subject',
            'Sent body'
        );
        const draft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Draft Subject',
            'Draft body'
        );
        const mailbox = new Mailbox(hostEmail, [receivedMessage], [sentMessage], [draft]);
        
        expect(mailbox.hostEmailAddress.equals(hostEmail)).toBe(true);
        expect(mailbox.receivedMessages.length).toBe(1);
        expect(mailbox.sentMessages.length).toBe(1);
        expect(mailbox.drafts.length).toBe(1);
    });

    // Test that hostEmailAddress getter returns the correct email address
    it('should return the correct host email address', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox = new Mailbox(hostEmail);
        
        expect(mailbox.hostEmailAddress.equals(hostEmail)).toBe(true);
    });

    // Test that receivedMessages getter returns a readonly array of received messages
    it('should return received messages as readonly array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const receivedMessage = new EmailMessage(
            new EmailAddress('sender@test.com'),
            [hostEmail],
            'Test Subject',
            'Test body'
        );
        const mailbox = new Mailbox(hostEmail, [receivedMessage]);
        
        const receivedMessages = mailbox.receivedMessages;
        expect(receivedMessages.length).toBe(1);
        expect(receivedMessages[0]).toBe(receivedMessage);
    });

    // Test that sentMessages getter returns a readonly array of sent messages
    it('should return sent messages as readonly array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const sentMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Test Subject',
            'Test body'
        );
        const mailbox = new Mailbox(hostEmail, [], [sentMessage]);
        
        const sentMessages = mailbox.sentMessages;
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0]).toBe(sentMessage);
    });

    // Test that drafts getter returns a readonly array of drafts
    it('should return drafts as readonly array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const draft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Draft Subject',
            'Draft body'
        );
        const mailbox = new Mailbox(hostEmail, [], [], [draft]);
        
        const drafts = mailbox.drafts;
        expect(drafts.length).toBe(1);
        expect(drafts[0]).toBe(draft);
    });

    // Test that receivedMessages getter returns a copy, not the original array
    it('should return a copy of received messages, not the original array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const receivedMessage = new EmailMessage(
            new EmailAddress('sender@test.com'),
            [hostEmail],
            'Test Subject',
            'Test body'
        );
        const mailbox = new Mailbox(hostEmail, [receivedMessage]);
        
        const receivedMessages1 = mailbox.receivedMessages;
        const receivedMessages2 = mailbox.receivedMessages;
        
        expect(receivedMessages1).not.toBe(receivedMessages2);
        expect(receivedMessages1.length).toBe(receivedMessages2.length);
    });

    // Test that sentMessages getter returns a copy, not the original array
    it('should return a copy of sent messages, not the original array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const sentMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Test Subject',
            'Test body'
        );
        const mailbox = new Mailbox(hostEmail, [], [sentMessage]);
        
        const sentMessages1 = mailbox.sentMessages;
        const sentMessages2 = mailbox.sentMessages;
        
        expect(sentMessages1).not.toBe(sentMessages2);
        expect(sentMessages1.length).toBe(sentMessages2.length);
    });

    // Test that drafts getter returns a copy, not the original array
    it('should return a copy of drafts, not the original array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const draft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Draft Subject',
            'Draft body'
        );
        const mailbox = new Mailbox(hostEmail, [], [], [draft]);
        
        const drafts1 = mailbox.drafts;
        const drafts2 = mailbox.drafts;
        
        expect(drafts1).not.toBe(drafts2);
        expect(drafts1.length).toBe(drafts2.length);
    });

    // Test that addingReceivedMessages creates a new Mailbox instance with added messages
    it('should create a new mailbox instance when adding received messages', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox1 = new Mailbox(hostEmail);
        const newMessage = new EmailMessage(
            new EmailAddress('sender@test.com'),
            [hostEmail],
            'New Subject',
            'New body'
        );
        
        const mailbox2 = mailbox1.addingReceivedMessages([newMessage]);
        
        expect(mailbox2).not.toBe(mailbox1);
        expect(mailbox2.receivedMessages.length).toBe(1);
    });

    // Test that addingReceivedMessages does not modify the original mailbox
    it('should not modify the original mailbox when adding received messages', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox1 = new Mailbox(hostEmail);
        const newMessage = new EmailMessage(
            new EmailAddress('sender@test.com'),
            [hostEmail],
            'New Subject',
            'New body'
        );
        
        mailbox1.addingReceivedMessages([newMessage]);
        
        expect(mailbox1.receivedMessages.length).toBe(0);
    });

    // Test that addingReceivedMessages adds messages to the received messages array
    it('should add messages to received messages array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const existingMessage = new EmailMessage(
            new EmailAddress('sender1@test.com'),
            [hostEmail],
            'Existing Subject',
            'Existing body'
        );
        const mailbox1 = new Mailbox(hostEmail, [existingMessage]);
        const newMessage = new EmailMessage(
            new EmailAddress('sender2@test.com'),
            [hostEmail],
            'New Subject',
            'New body'
        );
        
        const mailbox2 = mailbox1.addingReceivedMessages([newMessage]);
        
        expect(mailbox2.receivedMessages.length).toBe(2);
        expect(mailbox2.receivedMessages).toContain(existingMessage);
        expect(mailbox2.receivedMessages).toContain(newMessage);
    });

    // Test that addingReceivedMessages sorts messages chronologically
    it('should sort received messages chronologically after adding', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox1 = new Mailbox(hostEmail);
        const message1 = new EmailMessage(
            new EmailAddress('sender1@test.com'),
            [hostEmail],
            'Message 1',
            'Body 1'
        );
        const message2 = new EmailMessage(
            new EmailAddress('sender2@test.com'),
            [hostEmail],
            'Message 2',
            'Body 2'
        );
        
        const mailbox2 = mailbox1.addingReceivedMessages([message1, message2]);
        
        expect(mailbox2.receivedMessages.length).toBe(2);
        expect(mailbox2.receivedMessages).toContain(message1);
        expect(mailbox2.receivedMessages).toContain(message2);
    });

    // Test that addingReceivedMessages with empty array returns a mailbox with unchanged received messages
    it('should return mailbox with unchanged received messages when adding empty array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const existingMessage = new EmailMessage(
            new EmailAddress('sender@test.com'),
            [hostEmail],
            'Existing Subject',
            'Existing body'
        );
        const mailbox1 = new Mailbox(hostEmail, [existingMessage]);
        
        const mailbox2 = mailbox1.addingReceivedMessages([]);
        
        expect(mailbox2.receivedMessages.length).toBe(1);
        expect(mailbox2.receivedMessages[0]).toBe(existingMessage);
    });

    // Test that addingSentMessages creates a new Mailbox instance with added messages
    it('should create a new mailbox instance when adding sent messages', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox1 = new Mailbox(hostEmail);
        const newMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'New Subject',
            'New body'
        );
        
        const mailbox2 = mailbox1.addingSentMessages([newMessage]);
        
        expect(mailbox2).not.toBe(mailbox1);
        expect(mailbox2.sentMessages.length).toBe(1);
    });

    // Test that addingSentMessages does not modify the original mailbox
    it('should not modify the original mailbox when adding sent messages', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox1 = new Mailbox(hostEmail);
        const newMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'New Subject',
            'New body'
        );
        
        mailbox1.addingSentMessages([newMessage]);
        
        expect(mailbox1.sentMessages.length).toBe(0);
    });

    // Test that addingSentMessages adds messages to the sent messages array
    it('should add messages to sent messages array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const existingMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient1@test.com')],
            'Existing Subject',
            'Existing body'
        );
        const mailbox1 = new Mailbox(hostEmail, [], [existingMessage]);
        const newMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient2@test.com')],
            'New Subject',
            'New body'
        );
        
        const mailbox2 = mailbox1.addingSentMessages([newMessage]);
        
        expect(mailbox2.sentMessages.length).toBe(2);
        expect(mailbox2.sentMessages).toContain(existingMessage);
        expect(mailbox2.sentMessages).toContain(newMessage);
    });

    // Test that addingSentMessages sorts messages chronologically
    it('should sort sent messages chronologically after adding', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox1 = new Mailbox(hostEmail);
        const message1 = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient1@test.com')],
            'Message 1',
            'Body 1'
        );
        const message2 = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient2@test.com')],
            'Message 2',
            'Body 2'
        );
        
        const mailbox2 = mailbox1.addingSentMessages([message1, message2]);
        
        expect(mailbox2.sentMessages.length).toBe(2);
        expect(mailbox2.sentMessages).toContain(message1);
        expect(mailbox2.sentMessages).toContain(message2);
    });

    // Test that addingSentMessages with empty array returns a mailbox with unchanged sent messages
    it('should return mailbox with unchanged sent messages when adding empty array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const existingMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Existing Subject',
            'Existing body'
        );
        const mailbox1 = new Mailbox(hostEmail, [], [existingMessage]);
        
        const mailbox2 = mailbox1.addingSentMessages([]);
        
        expect(mailbox2.sentMessages.length).toBe(1);
        expect(mailbox2.sentMessages[0]).toBe(existingMessage);
    });

    // Test that addingDrafts creates a new Mailbox instance with added drafts
    it('should create a new mailbox instance when adding drafts', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox1 = new Mailbox(hostEmail);
        const newDraft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'New Draft Subject',
            'New Draft body'
        );
        
        const mailbox2 = mailbox1.addingDrafts([newDraft]);
        
        expect(mailbox2).not.toBe(mailbox1);
        expect(mailbox2.drafts.length).toBe(1);
    });

    // Test that addingDrafts does not modify the original mailbox
    it('should not modify the original mailbox when adding drafts', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox1 = new Mailbox(hostEmail);
        const newDraft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'New Draft Subject',
            'New Draft body'
        );
        
        mailbox1.addingDrafts([newDraft]);
        
        expect(mailbox1.drafts.length).toBe(0);
    });

    // Test that addingDrafts adds drafts to the drafts array
    it('should add drafts to drafts array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const existingDraft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient1@test.com')],
            'Existing Draft Subject',
            'Existing Draft body'
        );
        const mailbox1 = new Mailbox(hostEmail, [], [], [existingDraft]);
        const newDraft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient2@test.com')],
            'New Draft Subject',
            'New Draft body'
        );
        
        const mailbox2 = mailbox1.addingDrafts([newDraft]);
        
        expect(mailbox2.drafts.length).toBe(2);
        expect(mailbox2.drafts).toContain(existingDraft);
        expect(mailbox2.drafts).toContain(newDraft);
    });

    // Test that addingDrafts sorts drafts chronologically by createdAt date
    it('should sort drafts chronologically by createdAt date after adding', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox1 = new Mailbox(hostEmail);
        const date1 = new Date('2024-01-01');
        const date2 = new Date('2024-01-02');
        const draft1 = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient1@test.com')],
            'Draft 1',
            'Body 1',
            { createdAt: date1 }
        );
        const draft2 = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient2@test.com')],
            'Draft 2',
            'Body 2',
            { createdAt: date2 }
        );
        
        const mailbox2 = mailbox1.addingDrafts([draft2, draft1]);
        
        expect(mailbox2.drafts.length).toBe(2);
        expect(mailbox2.drafts[0].createdAt.getTime()).toBeLessThanOrEqual(mailbox2.drafts[1].createdAt.getTime());
    });

    // Test that addingDrafts with empty array returns a mailbox with unchanged drafts
    it('should return mailbox with unchanged drafts when adding empty array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const existingDraft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Existing Draft Subject',
            'Existing Draft body'
        );
        const mailbox1 = new Mailbox(hostEmail, [], [], [existingDraft]);
        
        const mailbox2 = mailbox1.addingDrafts([]);
        
        expect(mailbox2.drafts.length).toBe(1);
        expect(mailbox2.drafts[0]).toBe(existingDraft);
    });

    // Test that removingDrafts creates a new Mailbox instance without removed drafts
    it('should create a new mailbox instance when removing drafts', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const draft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Draft Subject',
            'Draft body'
        );
        const mailbox1 = new Mailbox(hostEmail, [], [], [draft]);
        
        const mailbox2 = mailbox1.removingDrafts([draft]);
        
        expect(mailbox2).not.toBe(mailbox1);
        expect(mailbox2.drafts.length).toBe(0);
    });

    // Test that removingDrafts does not modify the original mailbox
    it('should not modify the original mailbox when removing drafts', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const draft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Draft Subject',
            'Draft body'
        );
        const mailbox1 = new Mailbox(hostEmail, [], [], [draft]);
        
        mailbox1.removingDrafts([draft]);
        
        expect(mailbox1.drafts.length).toBe(1);
    });

    // Test that removingDrafts removes specified drafts from the drafts array
    it('should remove specified drafts from drafts array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const draft1 = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient1@test.com')],
            'Draft 1',
            'Body 1'
        );
        const draft2 = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient2@test.com')],
            'Draft 2',
            'Body 2'
        );
        const mailbox1 = new Mailbox(hostEmail, [], [], [draft1, draft2]);
        
        const mailbox2 = mailbox1.removingDrafts([draft1]);
        
        expect(mailbox2.drafts.length).toBe(1);
        expect(mailbox2.drafts).not.toContain(draft1);
        expect(mailbox2.drafts).toContain(draft2);
    });

    // Test that removingDrafts does not remove drafts that are not in the array
    it('should not remove drafts that are not in the drafts array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const draft1 = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient1@test.com')],
            'Draft 1',
            'Body 1'
        );
        const draft2 = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient2@test.com')],
            'Draft 2',
            'Body 2'
        );
        const mailbox1 = new Mailbox(hostEmail, [], [], [draft1]);
        
        const mailbox2 = mailbox1.removingDrafts([draft2]);
        
        expect(mailbox2.drafts.length).toBe(1);
        expect(mailbox2.drafts).toContain(draft1);
    });

    // Test that removingDrafts with empty array returns a mailbox with unchanged drafts
    it('should return mailbox with unchanged drafts when removing empty array', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const draft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Draft Subject',
            'Draft body'
        );
        const mailbox1 = new Mailbox(hostEmail, [], [], [draft]);
        
        const mailbox2 = mailbox1.removingDrafts([]);
        
        expect(mailbox2.drafts.length).toBe(1);
        expect(mailbox2.drafts[0]).toBe(draft);
    });

    // Test that removingDrafts removes multiple drafts correctly
    it('should remove multiple drafts correctly', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const draft1 = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient1@test.com')],
            'Draft 1',
            'Body 1'
        );
        const draft2 = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient2@test.com')],
            'Draft 2',
            'Body 2'
        );
        const draft3 = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient3@test.com')],
            'Draft 3',
            'Body 3'
        );
        const mailbox1 = new Mailbox(hostEmail, [], [], [draft1, draft2, draft3]);
        
        const mailbox2 = mailbox1.removingDrafts([draft1, draft3]);
        
        expect(mailbox2.drafts.length).toBe(1);
        expect(mailbox2.drafts).not.toContain(draft1);
        expect(mailbox2.drafts).toContain(draft2);
        expect(mailbox2.drafts).not.toContain(draft3);
    });

    // Test that addingReceivedMessages preserves sent messages and drafts
    it('should preserve sent messages and drafts when adding received messages', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const sentMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Sent Subject',
            'Sent body'
        );
        const draft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Draft Subject',
            'Draft body'
        );
        const mailbox1 = new Mailbox(hostEmail, [], [sentMessage], [draft]);
        const newMessage = new EmailMessage(
            new EmailAddress('sender@test.com'),
            [hostEmail],
            'New Subject',
            'New body'
        );
        
        const mailbox2 = mailbox1.addingReceivedMessages([newMessage]);
        
        expect(mailbox2.receivedMessages.length).toBe(1);
        expect(mailbox2.sentMessages.length).toBe(1);
        expect(mailbox2.sentMessages[0]).toBe(sentMessage);
        expect(mailbox2.drafts.length).toBe(1);
        expect(mailbox2.drafts[0]).toBe(draft);
    });

    // Test that addingSentMessages preserves received messages and drafts
    it('should preserve received messages and drafts when adding sent messages', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const receivedMessage = new EmailMessage(
            new EmailAddress('sender@test.com'),
            [hostEmail],
            'Received Subject',
            'Received body'
        );
        const draft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Draft Subject',
            'Draft body'
        );
        const mailbox1 = new Mailbox(hostEmail, [receivedMessage], [], [draft]);
        const newMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'New Subject',
            'New body'
        );
        
        const mailbox2 = mailbox1.addingSentMessages([newMessage]);
        
        expect(mailbox2.receivedMessages.length).toBe(1);
        expect(mailbox2.receivedMessages[0]).toBe(receivedMessage);
        expect(mailbox2.sentMessages.length).toBe(1);
        expect(mailbox2.drafts.length).toBe(1);
        expect(mailbox2.drafts[0]).toBe(draft);
    });

    // Test that addingDrafts preserves received messages and sent messages
    it('should preserve received messages and sent messages when adding drafts', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const receivedMessage = new EmailMessage(
            new EmailAddress('sender@test.com'),
            [hostEmail],
            'Received Subject',
            'Received body'
        );
        const sentMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Sent Subject',
            'Sent body'
        );
        const mailbox1 = new Mailbox(hostEmail, [receivedMessage], [sentMessage]);
        const newDraft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'New Draft Subject',
            'New Draft body'
        );
        
        const mailbox2 = mailbox1.addingDrafts([newDraft]);
        
        expect(mailbox2.receivedMessages.length).toBe(1);
        expect(mailbox2.receivedMessages[0]).toBe(receivedMessage);
        expect(mailbox2.sentMessages.length).toBe(1);
        expect(mailbox2.sentMessages[0]).toBe(sentMessage);
        expect(mailbox2.drafts.length).toBe(1);
    });

    // Test that removingDrafts preserves received messages and sent messages
    it('should preserve received messages and sent messages when removing drafts', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const receivedMessage = new EmailMessage(
            new EmailAddress('sender@test.com'),
            [hostEmail],
            'Received Subject',
            'Received body'
        );
        const sentMessage = new EmailMessage(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Sent Subject',
            'Sent body'
        );
        const draft = new MessageDraft(
            hostEmail,
            [new EmailAddress('recipient@test.com')],
            'Draft Subject',
            'Draft body'
        );
        const mailbox1 = new Mailbox(hostEmail, [receivedMessage], [sentMessage], [draft]);
        
        const mailbox2 = mailbox1.removingDrafts([draft]);
        
        expect(mailbox2.receivedMessages.length).toBe(1);
        expect(mailbox2.receivedMessages[0]).toBe(receivedMessage);
        expect(mailbox2.sentMessages.length).toBe(1);
        expect(mailbox2.sentMessages[0]).toBe(sentMessage);
        expect(mailbox2.drafts.length).toBe(0);
    });
});
