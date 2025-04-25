import { ProcessMessages } from '../src/ProcessMessages';
import { EmailMessage } from '../EmailMessage';
import { User } from '../src/models/User';
import { Account } from '../src/models/Account';
import * as fs from 'fs';
import * as path from 'path';

describe('ProcessMessages Follow Command', () => {
    describe('Follow Command Processing', () => {
        it('should establish follow relationship when both accounts exist', async () => {
            const processor = new ProcessMessages();

            // Create sender account using useradd command
            const createSenderMessage = new EmailMessage(
                'Phil Loden <ploden@gmail.com>',
                ['ploden@gmail.com'],
                'fm',
                '$ useradd\n\nPhil Loden',
                { priority: 'normal', isHtml: false }
            );
            processor.addMessage(createSenderMessage);

            // Create account to be followed using useradd command
            const createFollowMessage = new EmailMessage(
                'ploden.postcards@gmail.com',
                ['ploden.postcards@gmail.com'],
                'fm',
                '$ useradd\n\nPostcards',
                { priority: 'normal', isHtml: false }
            );
            processor.addMessage(createFollowMessage);

            // Process the follow command
            const followMessage = await EmailMessage.fromTextFile('tests/test_data/create_command_follow.txt');
            processor.addMessage(followMessage);

            // Get the accounts
            const senderAccount = processor.getAccount('ploden@gmail.com');
            const followAccount = processor.getAccount('ploden.postcards@gmail.com');

            // Verify accounts exist
            expect(senderAccount).toBeDefined();
            expect(followAccount).toBeDefined();

            // Verify user details
            expect(senderAccount?.user.username).toBe('Phil Loden');
            expect(senderAccount?.user.email).toBe('ploden@gmail.com');
            expect(followAccount?.user.username).toBe('Postcards');
            expect(followAccount?.user.email).toBe('ploden.postcards@gmail.com');

            // Verify follow relationship
            expect(senderAccount?.socialGraph.isFollowing(followAccount!)).toBe(true);
            expect(followAccount?.socialGraph.isFollowedBy(senderAccount!)).toBe(true);
        });

        it('should not establish follow relationship when sender account does not exist', async () => {
            const processor = new ProcessMessages();
            
            // Create only the account to be followed
            const createFollowMessage = new EmailMessage(
                'ploden.postcards@gmail.com',
                ['ploden.postcards@gmail.com'],
                'fm',
                '$ useradd\n\nPostcards',
                { priority: 'normal', isHtml: false }
            );
            processor.addMessage(createFollowMessage);

            // Try to follow without having a sender account
            const followMessage = await EmailMessage.fromTextFile('tests/test_data/create_command_follow.txt');
            processor.addMessage(followMessage);

            // Verify the follow relationship was not established
            const followAccount = processor.getAccount('ploden.postcards@gmail.com');
            expect(followAccount).toBeDefined();
            expect(followAccount?.socialGraph.getFollowers()).toHaveLength(0);
        });

        it('should not establish follow relationship when target account does not exist', async () => {
            const processor = new ProcessMessages();
            
            // Create only the sender account
            const createSenderMessage = new EmailMessage(
                'Phil Loden <ploden@gmail.com>',
                ['ploden@gmail.com'],
                'fm',
                '$ useradd\n\nPhil Loden',
                { priority: 'normal', isHtml: false }
            );
            processor.addMessage(createSenderMessage);

            // Try to follow a non-existent account
            const followMessage = await EmailMessage.fromTextFile('tests/test_data/create_command_follow.txt');
            processor.addMessage(followMessage);

            // Verify the follow relationship was not established
            const senderAccount = processor.getAccount('ploden@gmail.com');
            expect(senderAccount).toBeDefined();
            expect(senderAccount?.socialGraph.getFollowing()).toHaveLength(0);
        });

        it('should not create duplicate follow relationships', async () => {
            const processor = new ProcessMessages();
            
            // Create both accounts using useradd commands
            const createSenderMessage = new EmailMessage(
                'Phil Loden <ploden@gmail.com>',
                ['ploden@gmail.com'],
                'fm',
                '$ useradd\n\nPhil Loden',
                { priority: 'normal', isHtml: false }
            );
            processor.addMessage(createSenderMessage);

            const createFollowMessage = new EmailMessage(
                'ploden.postcards@gmail.com',
                ['ploden.postcards@gmail.com'],
                'fm',
                '$ useradd\n\nPostcards',
                { priority: 'normal', isHtml: false }
            );
            processor.addMessage(createFollowMessage);

            // Process the follow command twice
            const followMessage = await EmailMessage.fromTextFile('tests/test_data/create_command_follow.txt');
            processor.addMessage(followMessage);
            processor.addMessage(followMessage);

            // Verify only one follow relationship exists
            const senderAccount = processor.getAccount('ploden@gmail.com');
            const followAccount = processor.getAccount('ploden.postcards@gmail.com');

            const following = senderAccount?.socialGraph.getFollowing();
            const followers = followAccount?.socialGraph.getFollowers();

            expect(following).toHaveLength(1);
            expect(followers).toHaveLength(1);
        });

        it('should handle follow command with email-only format', async () => {
            const processor = new ProcessMessages();
            
            // Create both accounts using useradd commands
            const createSenderMessage = new EmailMessage(
                'ploden@gmail.com',
                ['ploden@gmail.com'],
                'fm',
                '$ useradd\n\nploden',
                { priority: 'normal', isHtml: false }
            );
            processor.addMessage(createSenderMessage);

            const createFollowMessage = new EmailMessage(
                'ploden.postcards@gmail.com',
                ['ploden.postcards@gmail.com'],
                'fm',
                '$ useradd\n\nPostcards',
                { priority: 'normal', isHtml: false }
            );
            processor.addMessage(createFollowMessage);

            // Process the follow command
            const followMessage = await EmailMessage.fromTextFile('tests/test_data/create_command_follow_email_only.txt');
            processor.addMessage(followMessage);

            // Verify the follow relationship was established
            const senderAccount = processor.getAccount('ploden@gmail.com');
            const followAccount = processor.getAccount('ploden.postcards@gmail.com');

            expect(senderAccount).toBeDefined();
            expect(followAccount).toBeDefined();
            expect(senderAccount?.user.username).toBe('ploden');
            expect(senderAccount?.socialGraph.isFollowing(followAccount!)).toBe(true);
        });
    });
}); 