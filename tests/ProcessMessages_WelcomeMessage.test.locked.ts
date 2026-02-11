import { ProcessMessages } from '../src/ProcessMessages';
import { EmailAddress } from '../src/models/EmailAddress';
import { EmailMessage } from '../EmailMessage';
import { Mailbox } from '../src/models/Mailbox';
import { VERSION, SIGNATURE } from '../src/constants';

describe('ProcessMessages Welcome Message', () => {
    // Test that a welcome message draft is created when ProcessMessages is initialized with a host and no existing messages
    it('should create a welcome message draft when initialized with a host and no messages', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox = new Mailbox(hostEmail);
        const processor = new ProcessMessages(mailbox);
        
        const drafts = processor.getMessageDrafts();
        expect(drafts.length).toBe(1);
        expect(drafts[0].subject).toBe('Welcome to friendlymail');
    });

    // Test that the welcome message draft has the correct sender (host), recipient (host), and subject line
    it('should create welcome message draft with correct sender, recipient, and subject', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox = new Mailbox(hostEmail);
        const processor = new ProcessMessages(mailbox);
        
        const drafts = processor.getMessageDrafts();
        expect(drafts.length).toBe(1);
        expect(drafts[0].from).not.toBeNull();
        expect(drafts[0].from?.equals(hostEmail)).toBe(true);
        expect(drafts[0].to.length).toBe(1);
        expect(drafts[0].to[0].equals(hostEmail)).toBe(true);
        expect(drafts[0].subject).toBe('Welcome to friendlymail');
    });

    // Test that the welcome message draft contains the ASCII art friendlymail logo
    it('should create welcome message draft containing ASCII art logo', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox = new Mailbox(hostEmail);
        const processor = new ProcessMessages(mailbox);
        
        const drafts = processor.getMessageDrafts();
        expect(drafts.length).toBe(1);
        const body = drafts[0].body;
        expect(body).toContain('__');
        expect(body).toContain('friendlymail');
    });

    // Test that the welcome message draft contains the version number
    it('should create welcome message draft containing version number', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox = new Mailbox(hostEmail);
        const processor = new ProcessMessages(mailbox);
        
        const drafts = processor.getMessageDrafts();
        expect(drafts.length).toBe(1);
        const body = drafts[0].body;
        expect(body).toContain(`friendlymail ${VERSION}`);
    });

    // Test that the welcome message draft contains help instructions
    it('should create welcome message draft containing help instructions', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox = new Mailbox(hostEmail);
        const processor = new ProcessMessages(mailbox);
        
        const drafts = processor.getMessageDrafts();
        expect(drafts.length).toBe(1);
        const body = drafts[0].body;
        expect(body).toContain('help');
        expect(body).toContain('Reply to this message');
    });

    // Test that the welcome message draft contains the signature
    it('should create welcome message draft containing signature', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox = new Mailbox(hostEmail);
        const processor = new ProcessMessages(mailbox);
        
        const drafts = processor.getMessageDrafts();
        expect(drafts.length).toBe(1);
        const body = drafts[0].body;
        expect(body).toContain(SIGNATURE);
    });

    // Test that a welcome message is not created if one has already been sent for the host
    it('should not create duplicate welcome message drafts for the same host', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox1 = new Mailbox(hostEmail);
        const processor1 = new ProcessMessages(mailbox1);
        
        const drafts1 = processor1.getMessageDrafts();
        expect(drafts1.length).toBe(1);
        
        const mailbox2 = new Mailbox(hostEmail);
        const processor2 = new ProcessMessages(mailbox2);
        const drafts2 = processor2.getMessageDrafts();
        expect(drafts2.length).toBe(1);
    });

    // Test that hasWelcomeMessageBeenSent returns true after welcome message is created
    it('should mark welcome message as sent after creation', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox = new Mailbox(hostEmail);
        const processor = new ProcessMessages(mailbox);
        
        expect(processor.hasWelcomeMessageBeenSent(hostEmail)).toBe(true);
    });

    // Test that hasWelcomeMessageBeenSent returns false before welcome message is created
    it('should return false for hasWelcomeMessageBeenSent before welcome message is created', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const otherEmail = new EmailAddress('other@test.com');
        const mailbox = new Mailbox(hostEmail);
        const processor = new ProcessMessages(mailbox);
        
        expect(processor.hasWelcomeMessageBeenSent(otherEmail)).toBe(false);
    });

    // Test that welcome message draft is added to message drafts queue
    it('should add welcome message draft to message drafts queue', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox = new Mailbox(hostEmail);
        const processor = new ProcessMessages(mailbox);
        
        const drafts = processor.getMessageDrafts();
        expect(drafts.length).toBe(1);
        expect(drafts[0].subject).toBe('Welcome to friendlymail');
    });

    // Test that welcome message is created even when ProcessMessages is initialized with existing messages
    it('should create welcome message when initialized with existing messages', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const existingMessage = new EmailMessage(
            hostEmail,
            [hostEmail],
            'Fm',
            'test message'
        );
        const mailbox = new Mailbox(hostEmail, [existingMessage]);
        const processor = new ProcessMessages(mailbox);
        
        const drafts = processor.getMessageDrafts();
        expect(drafts.length).toBe(1);
        expect(drafts[0].subject).toBe('Welcome to friendlymail');
    });

    // Test that the welcome message draft is moved from drafts to sent after calling sendDraft
    it('should move welcome message draft from drafts to sent after calling sendDraft', () => {
        const hostEmail = new EmailAddress('phil@test.com');
        const mailbox = new Mailbox(hostEmail);
        const processor = new ProcessMessages(mailbox);
        
        const draftsBefore = processor.getMessageDrafts();
        expect(draftsBefore.length).toBe(1);
        expect(draftsBefore[0].subject).toBe('Welcome to friendlymail');
        
        const sentMessage = processor.sendDraft(0);
        expect(sentMessage).not.toBeNull();
        
        const draftsAfter = processor.getMessageDrafts();
        expect(draftsAfter.length).toBe(0);
        
        const sentMessages = processor.getSentMessages();
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].subject).toBe('Welcome to friendlymail');
        expect(sentMessages[0].from.equals(hostEmail)).toBe(true);
        expect(sentMessages[0].to.length).toBe(1);
        expect(sentMessages[0].to[0].equals(hostEmail)).toBe(true);
        
        // Verify that a new welcome message draft is not created after sending
        expect(processor.hasWelcomeMessageBeenSent(hostEmail)).toBe(true);
        const draftsAfterSending = processor.getMessageDrafts();
        expect(draftsAfterSending.length).toBe(0);
    });
});
