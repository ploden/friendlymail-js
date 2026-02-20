/**
 * Scenario: friendlymail is run for the first time
 *
 * Step 1: The Daemon runs for the first time. A TestMessageProvider is used to
 * send and receive messages. After checking for messages, MessageStore contains
 * no friendlymail messages.
 *
 * Result: A welcome message draft is created by the MessageProcessor. The
 * TestMessageProvider sends the draft, resulting in the message being removed
 * from drafts and appearing in allMessages of the MessageStore.
 */

import { Daemon } from '../../src/models/Daemon';
import { TestMessageProvider } from '../../src/models/TestMessageProvider';
import { EmailAddress } from '../../src/models/EmailAddress';
import { ISocialNetwork } from '../../src/models/SocialNetwork';

const HOST_EMAIL = 'phil@test.com';

function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getAccount: jest.fn(),
        setAccount: jest.fn()
    };
}

describe('Scenario: friendlymail is run for the first time', () => {
    let hostAddress: EmailAddress;
    let provider: TestMessageProvider;
    let daemon: Daemon;

    beforeEach(() => {
        jest.useFakeTimers();
        hostAddress = new EmailAddress(HOST_EMAIL);
        provider = new TestMessageProvider(hostAddress);
        daemon = new Daemon(hostAddress, provider, provider, makeSocialNetwork());
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    async function runDaemon(): Promise<void> {
        const runPromise = daemon.run();
        // Advance past: getMessages (1s) + sendDraft (1s) + getMessages post-send (1s)
        await jest.advanceTimersByTimeAsync(3000);
        await runPromise;
    }

    describe('Step 1: Daemon runs for the first time with an empty MessageStore', () => {
        it('should have no messages in the MessageStore before run()', () => {
            expect(daemon.messageStore.allMessages).toHaveLength(0);
        });

        it('should add the sent welcome message to allMessages of the MessageStore', async () => {
            await runDaemon();
            expect(daemon.messageStore.allMessages).toHaveLength(1);
        });

        it('should send the welcome message to the host', async () => {
            await runDaemon();
            const msg = daemon.messageStore.allMessages[0];
            expect(msg.to.map(a => a.toString())).toContain(HOST_EMAIL);
        });

        it('should send the welcome message from the host', async () => {
            await runDaemon();
            const msg = daemon.messageStore.allMessages[0];
            expect(msg.from.toString()).toBe(HOST_EMAIL);
        });

        it('should send the welcome message with the correct subject', async () => {
            await runDaemon();
            const msg = daemon.messageStore.allMessages[0];
            expect(msg.subject).toBe('Welcome to friendlymail!');
        });

        it('should send a welcome message body containing the version number', async () => {
            await runDaemon();
            const msg = daemon.messageStore.allMessages[0];
            expect(msg.body).toContain('friendlymail 0.0.1');
        });

        it('should send a welcome message body containing the help prompt', async () => {
            await runDaemon();
            const msg = daemon.messageStore.allMessages[0];
            expect(msg.body).toContain('Reply to this message with "$ help" for more information.');
        });

        it('should send a welcome message body containing the signature', async () => {
            await runDaemon();
            const msg = daemon.messageStore.allMessages[0];
            expect(msg.body).toContain('friendlymail, an open-source, email-based, alternative social network');
        });

        it('should have no remaining drafts after the welcome message is sent', async () => {
            await runDaemon();
            expect(daemon.messageProcessor.getMessageDrafts()).toHaveLength(0);
        });
    });
});
