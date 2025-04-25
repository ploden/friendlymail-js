import { ProcessMessages } from '../src/ProcessMessages';
import { EmailAddress } from '../src/models/EmailAddress';
import { EmailMessage } from '../EmailMessage';
import * as path from 'path';

describe('ProcessMessages Follow', () => {
    let processor: ProcessMessages;
    let fromEmail: EmailAddress;
    let toEmail: EmailAddress;
    let message: EmailMessage;

    beforeEach(async () => {
        processor = new ProcessMessages();
        fromEmail = new EmailAddress('ploden@gmail.com');
        toEmail = new EmailAddress('friendlymail@example.com');
        message = new EmailMessage(fromEmail, [toEmail], 'Follow Test', '');

        // Create test accounts
        const createSenderMessage = await EmailMessage.fromTextFile(path.join(__dirname, 'test_data', 'create_command_create_account.txt'));
        const createFollowMessage = await EmailMessage.fromTextFile(path.join(__dirname, 'test_data', 'create_command_create_account2.txt'));
        
        processor.createAccountFromMessage(createSenderMessage);
        processor.createAccountFromMessage(createFollowMessage);
    });

    test('should follow another account', () => {
        const senderAccount = processor.getAccountByEmail('ploden@gmail.com');
        const followAccount = processor.getAccountByEmail('phil@example.com');

        expect(senderAccount).toBeDefined();
        expect(followAccount).toBeDefined();

        // Check that the follow relationship was created
        expect(senderAccount?.socialNetwork.isFollowing(followAccount!)).toBe(true);
        expect(followAccount?.socialNetwork.isFollowedBy(senderAccount!)).toBe(true);
    });

    test('should get following and followers', () => {
        const senderAccount = processor.getAccountByEmail('ploden@gmail.com');
        const followAccount = processor.getAccountByEmail('phil@example.com');

        expect(senderAccount).toBeDefined();
        expect(followAccount).toBeDefined();

        // Get following and followers
        const following = senderAccount?.socialNetwork.getFollowing();
        const followers = followAccount?.socialNetwork.getFollowers();

        // Check that the follow relationship was created
        expect(following).toContain(followAccount);
        expect(followers).toContain(senderAccount);
    });
}); 