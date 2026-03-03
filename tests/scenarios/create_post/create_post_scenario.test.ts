/**
 * Scenario: A friendlymail account is created and a post is made
 *
 * A fresh Daemon and TestMessageProvider are created before each test.
 * Each step's beforeEach runs through all prior steps to establish the
 * correct cumulative state. Each test then makes assertions about the
 * messages sent during that step.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Daemon } from '../../../src/models/Daemon';
import { TestMessageProvider } from '../../../src/models/TestMessageProvider';
import { EmailAddress } from '../../../src/models/EmailAddress';
import { SimpleMessage } from '../../../src/models/SimpleMessage';
import { SimpleMessageWithMessageId } from '../../../src/models/SimpleMessageWithMessageId';
import { FriendlymailMessageType } from '../../../src/models/FriendlymailMessageType';
import { ISocialNetwork } from '../../../src/models/SocialNetwork';

const HOST_EMAIL = 'phil@test.com';
const FOLLOWER_EMAIL = 'kath@test.com';
const FIRST_POST_MESSAGE_ID = '74206DB7-D586-4F7D-A203-5C5E1DAE7112@gmail.com';
const FIRST_POST_REF_ID = `${String(new Date().getFullYear()).slice(-2)}1`;
const COMMENT_REF_ID = `${String(new Date().getFullYear()).slice(-2)}2`;
const SECOND_FOLLOWER_EMAIL = 'alice@test.com';
const THIRD_POST_REF_ID = `${String(new Date().getFullYear()).slice(-2)}4`;

function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getUser: jest.fn(),
        setUser: jest.fn()
    };
}

describe('Scenario: A friendlymail account is created and a post is made', () => {
    let hostAddress: EmailAddress;
    let followerAddress: EmailAddress;
    let provider: TestMessageProvider;
    let daemon: Daemon;

    beforeEach(() => {
        jest.useFakeTimers();
        hostAddress = new EmailAddress(HOST_EMAIL);
        followerAddress = new EmailAddress(FOLLOWER_EMAIL);
        provider = new TestMessageProvider(hostAddress);
        daemon = new Daemon(hostAddress, provider, provider, makeSocialNetwork());
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    /**
     * Run one daemon cycle. Each cycle =
     *   getMessages (1s) + numDrafts × sendDraft (1s each) + getMessages (1s).
     */
    async function runDaemon(numDrafts = 1): Promise<void> {
        const runPromise = daemon.run();
        await jest.advanceTimersByTimeAsync((numDrafts + 2) * 1000);
        await runPromise;
    }

    // ── Message factories ──────────────────────────────────────────────────────

    function helpCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', '$ help');
    }

    function adduserCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', '$ adduser');
    }

    function inviteAddfollowerCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            hostAddress, [hostAddress], 'Fm',
            `$ invite --addfollower ${FOLLOWER_EMAIL}`
        );
    }

    function createPostMessage(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', 'Hello, world', undefined, undefined, undefined, FIRST_POST_MESSAGE_ID);
    }

    function createSecondPostMessage(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', 'Hello, world');
    }

    function likeMessage(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            followerAddress, [hostAddress],
            `Fm Like ❤️:${FIRST_POST_REF_ID}`,
            '❤️'
        );
    }

    function commentMessage(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            followerAddress, [hostAddress],
            `Fm Comment 💬:${FIRST_POST_REF_ID}`,
            'hello, universe!'
        );
    }

    function inviteSecondAddfollowerCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            hostAddress, [hostAddress], 'Fm',
            `$ invite --addfollower ${SECOND_FOLLOWER_EMAIL}`
        );
    }

    function createThirdPostMessage(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', 'Hi Alice and Kath');
    }

    // ── Step helpers ───────────────────────────────────────────────────────────

    async function step1_attachHost(): Promise<void> {
        await runDaemon(1);
    }

    async function step2_sendHelp(): Promise<void> {
        await provider.loadMessage(helpCommand());
        await runDaemon(1);
    }

    async function step3_createAccount(): Promise<void> {
        await provider.loadMessage(adduserCommand());
        await runDaemon(1);
    }

    async function step4_inviteFollower(): Promise<void> {
        await provider.loadMessage(inviteAddfollowerCommand());
        await runDaemon(1);
    }

    async function step5_createPost(): Promise<void> {
        await provider.loadMessage(createPostMessage());
        await runDaemon(2); // sends new post notification to host + to follower
    }

    async function step6_likePost(): Promise<void> {
        await provider.loadMessage(likeMessage());
        await runDaemon(1);
    }

    async function step7_commentOnPost(): Promise<void> {
        await provider.loadMessage(commentMessage());
        await runDaemon(1);
    }

    async function step8_createPostAgain(): Promise<void> {
        await provider.loadMessage(createSecondPostMessage());
        await runDaemon(2); // sends new post notification to host + to follower
    }

    async function step9_inviteSecondFollower(): Promise<void> {
        await provider.loadMessage(inviteSecondAddfollowerCommand());
        await runDaemon(1);
    }

    async function step10_createThirdPost(): Promise<void> {
        await provider.loadMessage(createThirdPostMessage());
        await runDaemon(3); // sends new post notification to host + kath + alice
    }

    // ── Step 1: friendlymail is attached to a host ─────────────────────────────

    describe('Step 1: friendlymail is attached to a host', () => {
        beforeEach(async () => {
            await step1_attachHost();
        });

        it('should send exactly one message', () => {
            expect(provider.sentMessages).toHaveLength(1);
        });

        it('should send the welcome message to the host', () => {
            expect(provider.sentMessages[0].to.map((a: EmailAddress) => a.toString())).toContain(HOST_EMAIL);
        });

        it('should send the welcome message from the host address', () => {
            expect(provider.sentMessages[0].from.toString()).toBe(HOST_EMAIL);
        });

        it('should send the welcome message with the correct subject', () => {
            expect(provider.sentMessages[0].subject).toBe('Welcome to friendlymail!');
        });

        it('should set the X-friendlymail header to the welcome type', () => {
            expect(provider.sentMessages[0].xFriendlymail)
                .toContain(FriendlymailMessageType.WELCOME);
        });

        it('should include the version number in the welcome message body', () => {
            expect(provider.sentMessages[0].body).toContain('friendlymail 0.0.1');
        });

        it('should include the help prompt in the welcome message body', () => {
            expect(provider.sentMessages[0].body)
                .toContain('Reply to this message with "$ help" for more information.');
        });

        it('should include the signature in the welcome message body', () => {
            expect(provider.sentMessages[0].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 2: The host sends a help command ──────────────────────────────────

    describe('Step 2: The host sends a help command', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
        });

        it('should send exactly two messages total', () => {
            expect(provider.sentMessages).toHaveLength(2);
        });

        it('should send the help reply to the host', () => {
            expect(provider.sentMessages[1].to.map((a: EmailAddress) => a.toString())).toContain(HOST_EMAIL);
        });

        it('should send the help reply from the host address', () => {
            expect(provider.sentMessages[1].from.toString()).toBe(HOST_EMAIL);
        });

        it('should set the X-friendlymail header to the help type', () => {
            expect(provider.sentMessages[1].xFriendlymail)
                .toContain(FriendlymailMessageType.HELP);
        });

        it('should include command listings in the help reply body', () => {
            expect(provider.sentMessages[1].body).toContain('$ help');
        });

        it('should include the signature in the help reply body', () => {
            expect(provider.sentMessages[1].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 3: The host sends a create account command ────────────────────────

    describe('Step 3: The host sends a create account command', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
            await step3_createAccount();
        });

        it('should send exactly three messages total', () => {
            expect(provider.sentMessages).toHaveLength(3);
        });

        it('should send the adduser reply to the host', () => {
            expect(provider.sentMessages[2].to.map((a: EmailAddress) => a.toString())).toContain(HOST_EMAIL);
        });

        it('should send the adduser reply from the host address', () => {
            expect(provider.sentMessages[2].from.toString()).toBe(HOST_EMAIL);
        });

        it('should set the X-friendlymail header to the adduser_response type', () => {
            expect(provider.sentMessages[2].xFriendlymail)
                .toContain(FriendlymailMessageType.ADDUSER_RESPONSE);
        });

        it('should include confirmation text in the adduser reply body', () => {
            expect(provider.sentMessages[2].body).toContain('Done.');
        });

        it('should include the signature in the adduser reply body', () => {
            expect(provider.sentMessages[2].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 4: The host sends an invite --addfollower command ─────────────────

    describe('Step 4: The host user sends an invite command with the addfollower parameter', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
            await step3_createAccount();
            await step4_inviteFollower();
        });

        it('should send exactly four messages total', () => {
            expect(provider.sentMessages).toHaveLength(4);
        });

        it('should send the invite reply to the host', () => {
            expect(provider.sentMessages[3].to.map((a: EmailAddress) => a.toString())).toContain(HOST_EMAIL);
        });

        it('should send the invite reply from the host address', () => {
            expect(provider.sentMessages[3].from.toString()).toBe(HOST_EMAIL);
        });

        it('should set the X-friendlymail header to the invite type', () => {
            expect(provider.sentMessages[3].xFriendlymail)
                .toContain(FriendlymailMessageType.INVITE);
        });

        it('should confirm the follower was added in the reply body', () => {
            expect(provider.sentMessages[3].body).toContain(`${FOLLOWER_EMAIL} is now following you`);
        });

        it('should include the signature in the invite reply body', () => {
            expect(provider.sentMessages[3].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 5: The user sends a create post message ───────────────────────────

    describe('Step 5: The user sends a create post message', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
            await step3_createAccount();
            await step4_inviteFollower();
            await step5_createPost();
        });

        it('should send exactly six messages total', () => {
            expect(provider.sentMessages).toHaveLength(6);
        });

        it('should send a new post notification to the host user', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification).toBeDefined();
        });

        it('should send a new post notification to the follower', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notification).toBeDefined();
        });

        it('should send both notifications from the host address', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L'
            );
            expect(notifications).toHaveLength(2);
            expect(notifications.every((m: SimpleMessageWithMessageId) => m.from.toString() === HOST_EMAIL)).toBe(true);
        });

        it('should set the X-friendlymail header to the new_post_notification type on the host notification', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.xFriendlymail)
                .toContain(FriendlymailMessageType.NEW_POST_NOTIFICATION);
        });

        it('should set the X-friendlymail header to the new_post_notification type on the follower notification', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notification!.xFriendlymail)
                .toContain(FriendlymailMessageType.NEW_POST_NOTIFICATION);
        });

        it('should include the post content in the host notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.body).toContain('Hello, world');
        });

        it('should include the post content in the follower notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notification!.body).toContain('Hello, world');
        });

        it('should include the signature in the host notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });

        it('should include the like link with the correct ref id in the host notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.body).toContain(FIRST_POST_REF_ID);
        });

        it('should include the like link with the correct ref id in the follower notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notification!.body).toContain(FIRST_POST_REF_ID);
        });
    });

    // ── Step 6: The follower likes the post ────────────────────────────────────

    describe('Step 6: The follower likes the post', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
            await step3_createAccount();
            await step4_inviteFollower();
            await step5_createPost();
            await step6_likePost();
        });

        it('should send exactly seven messages total', () => {
            expect(provider.sentMessages).toHaveLength(7);
        });

        it('should send the like notification to the host user', () => {
            expect(provider.sentMessages[6].to.map((a: EmailAddress) => a.toString())).toContain(HOST_EMAIL);
        });

        it('should send the like notification from the host address', () => {
            expect(provider.sentMessages[6].from.toString()).toBe(HOST_EMAIL);
        });

        it('should send the like notification with the correct subject', () => {
            expect(provider.sentMessages[6].subject).toContain('Kath L liked your post');
        });

        it('should set the X-friendlymail header to the new_like_notification type', () => {
            expect(provider.sentMessages[6].xFriendlymail)
                .toContain(FriendlymailMessageType.NEW_LIKE_NOTIFICATION);
        });

        it('should include the original post content in the like notification body', () => {
            expect(provider.sentMessages[6].body).toContain('Hello, world');
        });

        it('should include the like emoji in the like notification body', () => {
            expect(provider.sentMessages[6].body).toContain('❤️');
        });

        it('should include the signature in the like notification body', () => {
            expect(provider.sentMessages[6].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 8: The user sends a second create post message ────────────────────

    describe('Step 8: The user again sends a create post message', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
            await step3_createAccount();
            await step4_inviteFollower();
            await step5_createPost();
            await step6_likePost();
            await step7_commentOnPost();
            await step8_createPostAgain();
        });

        it('should send exactly ten messages total', () => {
            expect(provider.sentMessages).toHaveLength(10);
        });

        it('should send a second new post notification to the host user', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notifications).toHaveLength(2);
        });

        it('should send a second new post notification to the follower', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notifications).toHaveLength(2);
        });

        it('should send both second notifications from the host address', () => {
            const allNotifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L'
            );
            expect(allNotifications).toHaveLength(4);
            expect(allNotifications.every((m: SimpleMessageWithMessageId) => m.from.toString() === HOST_EMAIL)).toBe(true);
        });

        it('should set the X-friendlymail header to the new_post_notification type on the second host notification', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notifications[1].xFriendlymail)
                .toContain(FriendlymailMessageType.NEW_POST_NOTIFICATION);
        });

        it('should set the X-friendlymail header to the new_post_notification type on the second follower notification', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notifications[1].xFriendlymail)
                .toContain(FriendlymailMessageType.NEW_POST_NOTIFICATION);
        });

        it('should include the post content in the second host notification body', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notifications[1].body).toContain('Hello, world');
        });

        it('should include the post content in the second follower notification body', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notifications[1].body).toContain('Hello, world');
        });

        it('should include the signature in the second host notification body', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                     m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notifications[1].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 9: The host user sends a second invite --addfollower command ─────

    describe('Step 9: The host user sends a second invite command with the addfollower parameter', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
            await step3_createAccount();
            await step4_inviteFollower();
            await step5_createPost();
            await step6_likePost();
            await step7_commentOnPost();
            await step8_createPostAgain();
            await step9_inviteSecondFollower();
        });

        it('should send exactly eleven messages total', () => {
            expect(provider.sentMessages).toHaveLength(11);
        });

        it('should send the invite reply to the host', () => {
            expect(provider.sentMessages[10].to.map((a: EmailAddress) => a.toString())).toContain(HOST_EMAIL);
        });

        it('should send the invite reply from the host address', () => {
            expect(provider.sentMessages[10].from.toString()).toBe(HOST_EMAIL);
        });

        it('should set the X-friendlymail header to the invite type', () => {
            expect(provider.sentMessages[10].xFriendlymail)
                .toContain(FriendlymailMessageType.INVITE);
        });

        it('should confirm the second follower was added in the reply body', () => {
            expect(provider.sentMessages[10].body).toContain(`${SECOND_FOLLOWER_EMAIL} is now following you`);
        });

        it('should include the signature in the invite reply body', () => {
            expect(provider.sentMessages[10].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 10: The user sends a post with two followers ─────────────────────

    describe('Step 10: The user sends a create post message with two followers', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
            await step3_createAccount();
            await step4_inviteFollower();
            await step5_createPost();
            await step6_likePost();
            await step7_commentOnPost();
            await step8_createPostAgain();
            await step9_inviteSecondFollower();
            await step10_createThirdPost();
        });

        it('should send exactly fourteen messages total', () => {
            expect(provider.sentMessages).toHaveLength(14);
        });

        it('should send a new post notification to the host user', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL) &&
                    m.body.includes('Hi Alice and Kath')
            );
            expect(notification).toBeDefined();
        });

        it('should send a new post notification to the first follower (kath)', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL) &&
                    m.body.includes('Hi Alice and Kath')
            );
            expect(notification).toBeDefined();
        });

        it('should send a new post notification to the second follower (alice)', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                    m.to.some((a: EmailAddress) => a.toString() === SECOND_FOLLOWER_EMAIL)
            );
            expect(notification).toBeDefined();
        });

        it('should send all three notifications from the host address', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                    m.body.includes('Hi Alice and Kath')
            );
            expect(notifications).toHaveLength(3);
            expect(notifications.every((m: SimpleMessageWithMessageId) => m.from.toString() === HOST_EMAIL)).toBe(true);
        });

        it('should set the X-friendlymail header to the new_post_notification type on all three notifications', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                    m.body.includes('Hi Alice and Kath')
            );
            expect(notifications.every((m: SimpleMessageWithMessageId) =>
                m.xFriendlymail !== undefined &&
                m.xFriendlymail.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION)
            )).toBe(true);
        });

        it('should include the post content in all three notification bodies', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                    m.body.includes('Hi Alice and Kath')
            );
            expect(notifications).toHaveLength(3);
        });

        it('should include the ref id in the host notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL) &&
                    m.body.includes('Hi Alice and Kath')
            );
            expect(notification!.body).toContain(THIRD_POST_REF_ID);
        });

        it('should include the ref id in the first follower notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL) &&
                    m.body.includes('Hi Alice and Kath')
            );
            expect(notification!.body).toContain(THIRD_POST_REF_ID);
        });

        it('should include the ref id in the second follower notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                    m.to.some((a: EmailAddress) => a.toString() === SECOND_FOLLOWER_EMAIL)
            );
            expect(notification!.body).toContain(THIRD_POST_REF_ID);
        });

        it('should include the signature in all three notification bodies', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.subject === 'friendlymail: New post from Phil L' &&
                    m.body.includes('Hi Alice and Kath')
            );
            expect(notifications.every((m: SimpleMessageWithMessageId) =>
                m.body.includes('friendlymail, an open-source, email-based, alternative social network')
            )).toBe(true);
        });
    });

    // ── Output: write sent and received message files ──────────────────────────

    afterAll(async () => {
        jest.useFakeTimers();

        const localHost = new EmailAddress(HOST_EMAIL);
        const localFollower = new EmailAddress(FOLLOWER_EMAIL);
        const localProvider = new TestMessageProvider(localHost);
        const localDaemon = new Daemon(localHost, localProvider, localProvider, makeSocialNetwork());
        const receivedMessages: SimpleMessageWithMessageId[] = [];

        async function localRun(numDrafts = 1): Promise<void> {
            const p = localDaemon.run();
            await jest.advanceTimersByTimeAsync((numDrafts + 2) * 1000);
            await p;
        }

        async function receive(message: SimpleMessageWithMessageId): Promise<void> {
            receivedMessages.push(message);
            await localProvider.loadMessage(message);
        }

        function formatMessage(message: SimpleMessageWithMessageId): string {
            const lines: string[] = [];
            lines.push(`From: ${message.from.toString()}`);
            lines.push(`To: ${message.to.map((a: EmailAddress) => a.toString()).join(', ')}`);
            lines.push(`Subject: ${message.subject}`);
            lines.push(`Date: ${message.date.toUTCString()}`);
            if (message.xFriendlymail !== undefined) {
                lines.push(`X-friendlymail: ${message.xFriendlymail}`);
            }
            lines.push('');
            lines.push(message.body);
            return lines.join('\n');
        }

        // Step 1
        await localRun(1);
        // Step 2
        await receive(new SimpleMessageWithMessageId(localHost, [localHost], 'Fm', '$ help'));
        await localRun(1);
        // Step 3
        await receive(new SimpleMessageWithMessageId(localHost, [localHost], 'Fm', '$ adduser'));
        await localRun(1);
        // Step 4
        await receive(new SimpleMessageWithMessageId(localHost, [localHost], 'Fm', `$ invite --addfollower ${FOLLOWER_EMAIL}`));
        await localRun(1);
        // Step 5
        await receive(new SimpleMessageWithMessageId(localHost, [localHost], 'Fm', 'Hello, world', undefined, undefined, undefined, FIRST_POST_MESSAGE_ID));
        await localRun(2);
        // Step 6
        await receive(new SimpleMessageWithMessageId(
            localFollower, [localHost],
            `Fm Like ❤️:${FIRST_POST_REF_ID}`,
            '❤️'
        ));
        await localRun(1);
        // Step 7
        await receive(new SimpleMessageWithMessageId(
            localFollower, [localHost],
            `Fm Comment 💬:${FIRST_POST_REF_ID}`,
            'hello, universe!'
        ));
        await localRun(1);
        // Step 8
        await receive(new SimpleMessageWithMessageId(localHost, [localHost], 'Fm', 'Hello, world'));
        await localRun(2);
        // Step 9
        await receive(new SimpleMessageWithMessageId(localHost, [localHost], 'Fm', `$ invite --addfollower ${SECOND_FOLLOWER_EMAIL}`));
        await localRun(1);
        // Step 10
        await receive(new SimpleMessageWithMessageId(localHost, [localHost], 'Fm', 'Hi Alice and Kath'));
        await localRun(3);

        jest.useRealTimers();

        const sentDir = path.join(__dirname, 'sent');
        const receivedDir = path.join(__dirname, 'received');
        fs.mkdirSync(sentDir, { recursive: true });
        fs.mkdirSync(receivedDir, { recursive: true });

        localProvider.sentMessages.forEach((message: SimpleMessageWithMessageId, index: number) => {
            fs.writeFileSync(path.join(sentDir, `${index + 1}.txt`), formatMessage(message));
            if (message.html) {
                fs.writeFileSync(path.join(sentDir, `${index + 1}.html`), message.html);
            }
        });

        receivedMessages.forEach((message: SimpleMessageWithMessageId, index: number) => {
            fs.writeFileSync(path.join(receivedDir, `${index + 1}.txt`), formatMessage(message));
            if (message.html) {
                fs.writeFileSync(path.join(receivedDir, `${index + 1}.html`), message.html);
            }
        });
    });

    // ── Step 7: The follower comments on the post ──────────────────────────────

    describe('Step 7: The follower comments on the post', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
            await step3_createAccount();
            await step4_inviteFollower();
            await step5_createPost();
            await step6_likePost();
            await step7_commentOnPost();
        });

        it('should send exactly eight messages total', () => {
            expect(provider.sentMessages).toHaveLength(8);
        });

        it('should send the comment notification to the host user', () => {
            expect(provider.sentMessages[7].to.map((a: EmailAddress) => a.toString())).toContain(HOST_EMAIL);
        });

        it('should send the comment notification from the host address', () => {
            expect(provider.sentMessages[7].from.toString()).toBe(HOST_EMAIL);
        });

        it('should send the comment notification with the correct subject', () => {
            expect(provider.sentMessages[7].subject).toContain('New comment from Kath L');
        });

        it('should set the X-friendlymail header to the new_comment_notification type', () => {
            expect(provider.sentMessages[7].xFriendlymail)
                .toContain(FriendlymailMessageType.NEW_COMMENT_NOTIFICATION);
        });

        it('should include the comment text in the notification body', () => {
            expect(provider.sentMessages[7].body).toContain('hello, universe!');
        });

        it('should include the original post content in the comment thread', () => {
            expect(provider.sentMessages[7].body).toContain('Hello, world');
        });

        it('should include the signature in the comment notification body', () => {
            expect(provider.sentMessages[7].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });

        it('should include the like link with the comment ref id in the comment notification body', () => {
            expect(provider.sentMessages[7].body).toContain(COMMENT_REF_ID);
        });

        it('should include the comment link with the original post ref id in the comment notification body', () => {
            expect(provider.sentMessages[7].body).toContain(FIRST_POST_REF_ID);
        });
    });
});
