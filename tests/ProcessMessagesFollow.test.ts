import { MessageProcessor } from '../src/MessageProcessor';
import { EmailAddress } from '../src/models/EmailAddress';
import { SimpleMessage } from '../src/models/SimpleMessage';
import { TestMessageProvider } from '../src/models/TestMessageProvider';
import * as path from 'path';

describe('MessageProcessor Follow', () => {
    let processor: MessageProcessor;
    let fromEmail: EmailAddress;
    let toEmail: EmailAddress;
    let message: SimpleMessage;

    beforeEach(async () => {
        const hostEmail = new EmailAddress('friendlymail@example.com');
        fromEmail = new EmailAddress('ploden@gmail.com');
        toEmail = new EmailAddress('friendlymail@example.com');
        message = new SimpleMessage(fromEmail, [toEmail], 'Follow Test', '', new Date());

        // Create test accounts
        const provider = new TestMessageProvider(hostEmail);
        await provider.loadFromFile(path.join(__dirname, 'test_data', 'create_command_create_account.txt'));
        await provider.loadFromFile(path.join(__dirname, 'test_data', 'create_command_create_account2.txt'));
        const messages = await provider.getMessages();

        processor = new MessageProcessor(hostEmail, messages);
    });

    test('should follow another account', () => {
        const senderAccount = processor.getAccountByEmail('ploden@gmail.com');
        const followAccount = processor.getAccountByEmail('phil@example.com');

        expect(senderAccount).toBeDefined();
        expect(followAccount).toBeDefined();

        // Follow the account
        processor.follow(senderAccount!, followAccount!);

        // Check that the follow relationship was created
        expect(processor.isFollowing(senderAccount!, followAccount!)).toBe(true);
        expect(processor.isFollowedBy(followAccount!, senderAccount!)).toBe(true);
    });

    test('should get following and followers', () => {
        const senderAccount = processor.getAccountByEmail('ploden@gmail.com');
        const followAccount = processor.getAccountByEmail('phil@example.com');

        expect(senderAccount).toBeDefined();
        expect(followAccount).toBeDefined();

        // Follow the account
        processor.follow(senderAccount!, followAccount!);

        // Get following and followers
        const following = processor.getFollowing(senderAccount!);
        const followers = processor.getFollowers(followAccount!);

        // Check that the follow relationship was created
        expect(following).toContain(followAccount);
        expect(followers).toContain(senderAccount);
    });
}); 