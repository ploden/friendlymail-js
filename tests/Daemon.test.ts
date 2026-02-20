import { Daemon } from '../src/models/Daemon';
import { EmailAddress } from '../src/models/EmailAddress';
import { EmailMessage } from '../EmailMessage';
import { IMessageReceiver } from '../src/models/MessageReceiver';
import { IMessageSender } from '../src/models/MessageSender';
import { ISocialNetwork } from '../src/models/SocialNetwork';
import { MessageDraft } from '../src/models/MessageDraft';
import { FriendlymailMessageType } from '../src/models/FriendlymailMessageType';

const HOST_EMAIL = 'phil@test.com';
const hostAddress = new EmailAddress(HOST_EMAIL);

/** Create a mock IMessageReceiver that returns the given messages */
function makeReceiver(messages: EmailMessage[] = []): jest.Mocked<IMessageReceiver> {
    return { getMessages: jest.fn().mockResolvedValue(messages) };
}

/** Create a mock IMessageSender */
function makeSender(): jest.Mocked<IMessageSender> {
    return { sendDraft: jest.fn().mockResolvedValue(undefined) };
}

/** Create a mock ISocialNetwork */
function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getAccount: jest.fn(),
        setAccount: jest.fn()
    };
}

describe('Daemon', () => {
    describe('properties (IDaemon)', () => {
        it('should expose messageStore', () => {
            const daemon = new Daemon(hostAddress, makeReceiver(), makeSender(), makeSocialNetwork());
            expect(daemon.messageStore).toBeDefined();
        });

        it('should expose the messageReceiver that was provided', () => {
            const receiver = makeReceiver();
            const daemon = new Daemon(hostAddress,receiver, makeSender(), makeSocialNetwork());
            expect(daemon.messageReceiver).toBe(receiver);
        });

        it('should expose the messageSender that was provided', () => {
            const sender = makeSender();
            const daemon = new Daemon(hostAddress,makeReceiver(), sender, makeSocialNetwork());
            expect(daemon.messageSender).toBe(sender);
        });

        it('should expose messageProcessor', () => {
            const daemon = new Daemon(hostAddress,makeReceiver(), makeSender(), makeSocialNetwork());
            expect(daemon.messageProcessor).toBeDefined();
        });

        it('should expose the socialNetwork that was provided', () => {
            const socialNetwork = makeSocialNetwork();
            const daemon = new Daemon(hostAddress,makeReceiver(), makeSender(), socialNetwork);
            expect(daemon.socialNetwork).toBe(socialNetwork);
        });

        it('messageStore should initially contain no messages', () => {
            const daemon = new Daemon(hostAddress,makeReceiver(), makeSender(), makeSocialNetwork());
            expect(daemon.messageStore.allMessages.length).toBe(0);
        });
    });

    describe('run() (IDaemon)', () => {
        it('should return a Promise', () => {
            const daemon = new Daemon(hostAddress,makeReceiver(), makeSender(), makeSocialNetwork());
            const result = daemon.run();
            expect(result).toBeInstanceOf(Promise);
            return result;
        });

        it('should resolve without throwing', async () => {
            const daemon = new Daemon(hostAddress,makeReceiver(), makeSender(), makeSocialNetwork());
            await expect(daemon.run()).resolves.toBeUndefined();
        });

        it('should call getMessages() on the messageReceiver', async () => {
            const receiver = makeReceiver();
            const daemon = new Daemon(hostAddress,receiver, makeSender(), makeSocialNetwork());
            await daemon.run();
            // run() calls getMessages() twice per cycle: once to fetch incoming messages
            // and once after sending drafts to pick up sent messages
            expect(receiver.getMessages).toHaveBeenCalledTimes(2);
        });

        it('should call getMessages() on each run', async () => {
            const receiver = makeReceiver();
            const daemon = new Daemon(hostAddress,receiver, makeSender(), makeSocialNetwork());
            await daemon.run();
            await daemon.run();
            // 2 calls per run × 2 runs = 4
            expect(receiver.getMessages).toHaveBeenCalledTimes(4);
        });

        it('should add messages fetched from the receiver to the messageStore', async () => {
            const message = new EmailMessage(
                new EmailAddress('kath@test.com'),
                [hostAddress],
                'Fm',
                'hello'
            );
            const receiver = makeReceiver([message]);
            const daemon = new Daemon(hostAddress,receiver, makeSender(), makeSocialNetwork());
            await daemon.run();
            expect(daemon.messageStore.allMessages).toContain(message);
        });

        it('should accumulate messages in the messageStore across multiple runs', async () => {
            const msg1 = new EmailMessage(new EmailAddress('a@test.com'), [hostAddress], 'Fm', 'one');
            const msg2 = new EmailMessage(new EmailAddress('b@test.com'), [hostAddress], 'Fm', 'two');

            const receiver = makeReceiver();
            receiver.getMessages
                .mockResolvedValueOnce([msg1])
                .mockResolvedValueOnce([msg2]);

            const daemon = new Daemon(hostAddress,receiver, makeSender(), makeSocialNetwork());
            await daemon.run();
            await daemon.run();

            expect(daemon.messageStore.allMessages).toContain(msg1);
            expect(daemon.messageStore.allMessages).toContain(msg2);
        });

        // Per the README: "The welcome message is sent when friendlymail is configured
        // with a host … A welcome message should be sent once and only once to the host."
        it('should send a welcome message draft on the first run', async () => {
            const sender = makeSender();
            const daemon = new Daemon(hostAddress,makeReceiver(), sender, makeSocialNetwork());
            await daemon.run();
            expect(sender.sendDraft).toHaveBeenCalledTimes(1);
        });

        it('should call sendDraft() with a MessageDraft instance', async () => {
            const sender = makeSender();
            const daemon = new Daemon(hostAddress,makeReceiver(), sender, makeSocialNetwork());
            await daemon.run();
            const draft = sender.sendDraft.mock.calls[0][0];
            expect(draft).toBeInstanceOf(MessageDraft);
        });

        it('should not send the welcome message again on the second run', async () => {
            const sender = makeSender();
            const receiver = makeReceiver();
            const daemon = new Daemon(hostAddress, receiver, sender, makeSocialNetwork());

            // After run 1 sends the welcome draft, the post-send getMessages() call must
            // return the sent welcome message so the MessageProcessor on run 2 sees it
            // and does not create another welcome draft.
            const sentWelcome = new EmailMessage(
                hostAddress,
                [hostAddress],
                'Welcome to friendlymail',
                'Welcome body',
                {
                    customHeaders: new Map([
                        ['X-friendlymail', `{"messageType":"${FriendlymailMessageType.WELCOME}"}`]
                    ])
                }
            );
            receiver.getMessages
                .mockResolvedValueOnce([])          // run 1: fetch incoming
                .mockResolvedValueOnce([sentWelcome]) // run 1: pick up sent
                .mockResolvedValueOnce([])          // run 2: fetch incoming
                .mockResolvedValueOnce([]);         // run 2: pick up sent

            await daemon.run();
            sender.sendDraft.mockClear();
            await daemon.run();
            expect(sender.sendDraft).not.toHaveBeenCalled();
        });
    });
});
