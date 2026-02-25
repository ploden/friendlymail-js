/**
 * Scenario: Permissions are enforced for friendlymail commands
 *
 * A fresh Daemon and TestMessageProvider are created before each test.
 * Each step's beforeEach runs through all prior steps to establish the
 * correct cumulative state. Each test then makes assertions about the
 * messages sent during that step.
 *
 * Background setup helpers (not explicit scenario steps):
 *   - setup_attachHost: runs the daemon for the first time to send the welcome message
 *   - setup_createAccount: sends an adduser command to create the host account
 *
 * These are required for certain scenario steps to execute correctly but are
 * not themselves named steps in the scenario.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Daemon } from '../../../src/models/Daemon';
import { TestMessageProvider } from '../../../src/models/TestMessageProvider';
import { EmailAddress } from '../../../src/models/EmailAddress';
import { SimpleMessage } from '../../../src/models/SimpleMessage';
import { FriendlymailMessageType } from '../../../src/models/FriendlymailMessageType';
import { ISocialNetwork } from '../../../src/models/SocialNetwork';

const HOST_EMAIL = 'phil@test.com';
const NON_HOST_EMAIL = 'kath@test.com';
const THIRD_PARTY_EMAIL = 'dave@test.com';

function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getUser: jest.fn(),
        setUser: jest.fn()
    };
}

describe('Scenario: Permissions are enforced for friendlymail commands', () => {
    let hostAddress: EmailAddress;
    let nonHostAddress: EmailAddress;
    let provider: TestMessageProvider;
    let daemon: Daemon;

    beforeEach(() => {
        jest.useFakeTimers();
        hostAddress = new EmailAddress(HOST_EMAIL);
        nonHostAddress = new EmailAddress(NON_HOST_EMAIL);
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

    function nonHostAdduserCommand(): SimpleMessage {
        return new SimpleMessage(nonHostAddress, [hostAddress], 'Fm', '$ adduser');
    }

    function hostAdduserCommand(): SimpleMessage {
        return new SimpleMessage(hostAddress, [hostAddress], 'Fm', '$ adduser');
    }

    function hostInviteCommand(): SimpleMessage {
        return new SimpleMessage(hostAddress, [hostAddress], 'Fm', `$ invite ${NON_HOST_EMAIL}`);
    }

    function nonHostInviteAddfollowerCommand(): SimpleMessage {
        return new SimpleMessage(
            nonHostAddress, [hostAddress], 'Fm',
            `$ invite --addfollower ${THIRD_PARTY_EMAIL}`
        );
    }

    function nonHostFollowShowCommand(): SimpleMessage {
        return new SimpleMessage(nonHostAddress, [hostAddress], 'Fm', '$ follow --show');
    }

    function nonHostLikeMessage(): SimpleMessage {
        return new SimpleMessage(
            nonHostAddress, [hostAddress],
            'Fm Like ❤️:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+',
            '❤️'
        );
    }

    function nonHostCommentMessage(): SimpleMessage {
        return new SimpleMessage(
            nonHostAddress, [hostAddress],
            'Fm Comment 💬:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+',
            'hello, universe!'
        );
    }

    function nonHostUnfollowCommand(): SimpleMessage {
        return new SimpleMessage(nonHostAddress, [hostAddress], 'Fm', `$ unfollow ${THIRD_PARTY_EMAIL}`);
    }

    function nonHostFollowCommand(): SimpleMessage {
        return new SimpleMessage(nonHostAddress, [hostAddress], 'Fm', `$ follow ${THIRD_PARTY_EMAIL}`);
    }

    function nonHostCreatePostMessage(): SimpleMessage {
        return new SimpleMessage(nonHostAddress, [hostAddress], 'Fm', 'hello, world');
    }

    // ── Background setup helpers (not explicit scenario steps) ─────────────────

    async function setup_attachHost(): Promise<void> {
        await runDaemon(1); // sends welcome message → sentMessages: 1
    }

    async function setup_createAccount(): Promise<void> {
        await provider.loadMessage(hostAdduserCommand());
        await runDaemon(1); // sends adduser success reply → sentMessages +1
    }

    // ── Scenario step helpers ──────────────────────────────────────────────────

    async function step1_nonHostSendsAdduser(): Promise<void> {
        await provider.loadMessage(nonHostAdduserCommand());
        await runDaemon(1); // replies: permission denied
    }

    async function step2_hostInviteBeforeAccount(): Promise<void> {
        await provider.loadMessage(hostInviteCommand());
        await runDaemon(1); // replies: fatal error
    }

    async function step3_hostSecondAdduser(): Promise<void> {
        await provider.loadMessage(hostAdduserCommand());
        await runDaemon(1); // replies: fatal user already exists
    }

    async function step4_nonHostInviteAddfollower(): Promise<void> {
        await provider.loadMessage(nonHostInviteAddfollowerCommand());
        await runDaemon(1); // replies: permission denied
    }

    async function step5_nonHostFollowShow(): Promise<void> {
        await provider.loadMessage(nonHostFollowShowCommand());
        await runDaemon(0); // no reply sent
    }

    async function step6_nonHostLike(): Promise<void> {
        await provider.loadMessage(nonHostLikeMessage());
        await runDaemon(0); // no reply sent
    }

    async function step7_nonHostComment(): Promise<void> {
        await provider.loadMessage(nonHostCommentMessage());
        await runDaemon(0); // no reply sent
    }

    async function step8_nonHostUnfollow(): Promise<void> {
        await provider.loadMessage(nonHostUnfollowCommand());
        await runDaemon(1); // replies: permission denied
    }

    async function step9_nonHostFollow(): Promise<void> {
        await provider.loadMessage(nonHostFollowCommand());
        await runDaemon(1); // replies: permission denied
    }

    async function step10_nonHostCreatePost(): Promise<void> {
        await provider.loadMessage(nonHostCreatePostMessage());
        await runDaemon(0); // no reply sent
    }

    // ── Step 1: A non-host user sends an adduser command ──────────────────────

    describe('Step 1: A non-host user sends an adduser command', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await step1_nonHostSendsAdduser();
        });

        it('should send exactly two messages total', () => {
            expect(provider.sentMessages).toHaveLength(2);
        });

        it('should send the adduser reply to the non-host user', () => {
            expect(provider.sentMessages[1].to.map((a: EmailAddress) => a.toString())).toContain(NON_HOST_EMAIL);
        });

        it('should send the adduser reply from the host address', () => {
            expect(provider.sentMessages[1].from.toString()).toBe(HOST_EMAIL);
        });

        it('should set the X-friendlymail header to the adduser_response type', () => {
            expect(provider.sentMessages[1].xFriendlymail)
                .toContain(FriendlymailMessageType.ADDUSER_RESPONSE);
        });

        it('should include "Permission denied" in the reply body', () => {
            expect(provider.sentMessages[1].body).toContain('Permission denied');
        });

        it('should include the signature in the reply body', () => {
            expect(provider.sentMessages[1].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 2: The host sends an invite command before creating a user account ─

    describe('Step 2: The host sends an invite command before creating a user account', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await step1_nonHostSendsAdduser();
            await step2_hostInviteBeforeAccount();
        });

        it('should send exactly three messages total', () => {
            expect(provider.sentMessages).toHaveLength(3);
        });

        it('should send the invite reply to the host', () => {
            expect(provider.sentMessages[2].to.map((a: EmailAddress) => a.toString())).toContain(HOST_EMAIL);
        });

        it('should send the invite reply from the host address', () => {
            expect(provider.sentMessages[2].from.toString()).toBe(HOST_EMAIL);
        });

        it('should set the X-friendlymail header to the invite type', () => {
            expect(provider.sentMessages[2].xFriendlymail)
                .toContain(FriendlymailMessageType.INVITE);
        });

        it('should include the fatal error message in the reply body', () => {
            expect(provider.sentMessages[2].body)
                .toContain('Fatal: a friendlymail user account is required for this command.');
        });

        it('should include the signature in the reply body', () => {
            expect(provider.sentMessages[2].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 3: The host sends a second adduser command after an account exists ─

    describe('Step 3: The host sends a second adduser command after an account already exists', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await step1_nonHostSendsAdduser();
            await step2_hostInviteBeforeAccount();
            await setup_createAccount(); // sentMessages: 4
            await step3_hostSecondAdduser(); // sentMessages: 5
        });

        it('should send exactly five messages total', () => {
            expect(provider.sentMessages).toHaveLength(5);
        });

        it('should send the adduser reply to the host', () => {
            expect(provider.sentMessages[4].to.map((a: EmailAddress) => a.toString())).toContain(HOST_EMAIL);
        });

        it('should send the adduser reply from the host address', () => {
            expect(provider.sentMessages[4].from.toString()).toBe(HOST_EMAIL);
        });

        it('should set the X-friendlymail header to the adduser_response type', () => {
            expect(provider.sentMessages[4].xFriendlymail)
                .toContain(FriendlymailMessageType.ADDUSER_RESPONSE);
        });

        it('should include the fatal error message in the reply body', () => {
            expect(provider.sentMessages[4].body)
                .toContain(`Fatal: a friendlymail user already exists for ${HOST_EMAIL}`);
        });

        it('should include the signature in the reply body', () => {
            expect(provider.sentMessages[4].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 4: A non-host user sends an invite --addfollower message ──────────

    describe('Step 4: A non-host user sends an invite --addfollower message to the host user', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await step1_nonHostSendsAdduser();
            await step2_hostInviteBeforeAccount();
            await setup_createAccount(); // sentMessages: 4
            await step3_hostSecondAdduser(); // sentMessages: 5
            await step4_nonHostInviteAddfollower(); // sentMessages: 6
        });

        it('should send exactly six messages total', () => {
            expect(provider.sentMessages).toHaveLength(6);
        });

        it('should send the invite reply to the non-host user', () => {
            expect(provider.sentMessages[5].to.map((a: EmailAddress) => a.toString())).toContain(NON_HOST_EMAIL);
        });

        it('should send the invite reply from the host address', () => {
            expect(provider.sentMessages[5].from.toString()).toBe(HOST_EMAIL);
        });

        it('should set the X-friendlymail header to the invite type', () => {
            expect(provider.sentMessages[5].xFriendlymail)
                .toContain(FriendlymailMessageType.INVITE);
        });

        it('should include "Permission denied" in the reply body', () => {
            expect(provider.sentMessages[5].body).toContain('Permission denied');
        });

        it('should include the signature in the reply body', () => {
            expect(provider.sentMessages[5].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 5: A non-host, non-follower user sends a follow --show message ────

    describe('Step 5: A non-host, non-follower user sends a follow --show message to the host user', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await step1_nonHostSendsAdduser();
            await step2_hostInviteBeforeAccount();
            await setup_createAccount();
            await step3_hostSecondAdduser();
            await step4_nonHostInviteAddfollower();
            await step5_nonHostFollowShow();
        });

        it('should send exactly six messages total (no new reply)', () => {
            expect(provider.sentMessages).toHaveLength(6);
        });
    });

    // ── Step 6: A non-host, non-follower user sends a create like message ──────

    describe('Step 6: A non-host, non-follower user sends a create like message to the host user', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await step1_nonHostSendsAdduser();
            await step2_hostInviteBeforeAccount();
            await setup_createAccount();
            await step3_hostSecondAdduser();
            await step4_nonHostInviteAddfollower();
            await step5_nonHostFollowShow();
            await step6_nonHostLike();
        });

        it('should send exactly six messages total (no new reply)', () => {
            expect(provider.sentMessages).toHaveLength(6);
        });
    });

    // ── Step 7: A non-host, non-follower user sends a create comment message ───

    describe('Step 7: A non-host, non-follower user sends a create comment message to the host user', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await step1_nonHostSendsAdduser();
            await step2_hostInviteBeforeAccount();
            await setup_createAccount();
            await step3_hostSecondAdduser();
            await step4_nonHostInviteAddfollower();
            await step5_nonHostFollowShow();
            await step6_nonHostLike();
            await step7_nonHostComment();
        });

        it('should send exactly six messages total (no new reply)', () => {
            expect(provider.sentMessages).toHaveLength(6);
        });
    });

    // ── Step 8: A non-host user sends an unfollow message ─────────────────────

    describe('Step 8: A non-host user sends an unfollow message to the host user, with a third party address as the parameter', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await step1_nonHostSendsAdduser();
            await step2_hostInviteBeforeAccount();
            await setup_createAccount();
            await step3_hostSecondAdduser();
            await step4_nonHostInviteAddfollower();
            await step5_nonHostFollowShow();
            await step6_nonHostLike();
            await step7_nonHostComment();
            await step8_nonHostUnfollow();
        });

        it('should send exactly seven messages total', () => {
            expect(provider.sentMessages).toHaveLength(7);
        });

        it('should send the unfollow reply to the non-host user', () => {
            expect(provider.sentMessages[6].to.map((a: EmailAddress) => a.toString())).toContain(NON_HOST_EMAIL);
        });

        it('should send the unfollow reply from the host address', () => {
            expect(provider.sentMessages[6].from.toString()).toBe(HOST_EMAIL);
        });

        it('should set the X-friendlymail header to the unfollow_response type', () => {
            expect(provider.sentMessages[6].xFriendlymail)
                .toContain(FriendlymailMessageType.UNFOLLOW_RESPONSE);
        });

        it('should include "Permission denied" in the reply body', () => {
            expect(provider.sentMessages[6].body).toContain('Permission denied');
        });

        it('should include the signature in the reply body', () => {
            expect(provider.sentMessages[6].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 9: A non-host user sends a follow message ─────────────────────────

    describe('Step 9: A non-host user sends a follow message to the host user, with a third party address as the parameter', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await step1_nonHostSendsAdduser();
            await step2_hostInviteBeforeAccount();
            await setup_createAccount();
            await step3_hostSecondAdduser();
            await step4_nonHostInviteAddfollower();
            await step5_nonHostFollowShow();
            await step6_nonHostLike();
            await step7_nonHostComment();
            await step8_nonHostUnfollow();
            await step9_nonHostFollow();
        });

        it('should send exactly eight messages total', () => {
            expect(provider.sentMessages).toHaveLength(8);
        });

        it('should send the follow reply to the non-host user', () => {
            expect(provider.sentMessages[7].to.map((a: EmailAddress) => a.toString())).toContain(NON_HOST_EMAIL);
        });

        it('should send the follow reply from the host address', () => {
            expect(provider.sentMessages[7].from.toString()).toBe(HOST_EMAIL);
        });

        it('should set the X-friendlymail header to the follow_response type', () => {
            expect(provider.sentMessages[7].xFriendlymail)
                .toContain(FriendlymailMessageType.FOLLOW_RESPONSE);
        });

        it('should include "Permission denied" in the reply body', () => {
            expect(provider.sentMessages[7].body).toContain('Permission denied');
        });

        it('should include the signature in the reply body', () => {
            expect(provider.sentMessages[7].body)
                .toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Step 10: A non-host user sends a create post message ──────────────────

    describe('Step 10: A non-host user sends a create post message to the host user', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await step1_nonHostSendsAdduser();
            await step2_hostInviteBeforeAccount();
            await setup_createAccount();
            await step3_hostSecondAdduser();
            await step4_nonHostInviteAddfollower();
            await step5_nonHostFollowShow();
            await step6_nonHostLike();
            await step7_nonHostComment();
            await step8_nonHostUnfollow();
            await step9_nonHostFollow();
            await step10_nonHostCreatePost();
        });

        it('should send exactly eight messages total (no new reply)', () => {
            expect(provider.sentMessages).toHaveLength(8);
        });
    });

    // ── Output: write sent and received message files ──────────────────────────

    afterAll(async () => {
        jest.useFakeTimers();

        const localHost = new EmailAddress(HOST_EMAIL);
        const localNonHost = new EmailAddress(NON_HOST_EMAIL);
        const localProvider = new TestMessageProvider(localHost);
        const localDaemon = new Daemon(localHost, localProvider, localProvider, makeSocialNetwork());
        const receivedMessages: SimpleMessage[] = [];

        async function localRun(numDrafts = 1): Promise<void> {
            const p = localDaemon.run();
            await jest.advanceTimersByTimeAsync((numDrafts + 2) * 1000);
            await p;
        }

        async function receive(message: SimpleMessage): Promise<void> {
            receivedMessages.push(message);
            await localProvider.loadMessage(message);
        }

        function formatMessage(message: SimpleMessage): string {
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

        // setup_attachHost
        await localRun(1);
        // step1: non-host sends adduser
        await receive(new SimpleMessage(localNonHost, [localHost], 'Fm', '$ adduser'));
        await localRun(1);
        // step2: host sends invite before account
        await receive(new SimpleMessage(localHost, [localHost], 'Fm', `$ invite ${NON_HOST_EMAIL}`));
        await localRun(1);
        // setup_createAccount
        await receive(new SimpleMessage(localHost, [localHost], 'Fm', '$ adduser'));
        await localRun(1);
        // step3: host sends second adduser
        await receive(new SimpleMessage(localHost, [localHost], 'Fm', '$ adduser'));
        await localRun(1);
        // step4: non-host sends invite --addfollower
        await receive(new SimpleMessage(localNonHost, [localHost], 'Fm', `$ invite --addfollower ${THIRD_PARTY_EMAIL}`));
        await localRun(1);
        // step5: non-host, non-follower sends follow --show
        await receive(new SimpleMessage(localNonHost, [localHost], 'Fm', '$ follow --show'));
        await localRun(0);
        // step6: non-host, non-follower sends like
        await receive(new SimpleMessage(
            localNonHost, [localHost],
            'Fm Like ❤️:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+',
            '❤️'
        ));
        await localRun(0);
        // step7: non-host, non-follower sends comment
        await receive(new SimpleMessage(
            localNonHost, [localHost],
            'Fm Comment 💬:PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+',
            'hello, universe!'
        ));
        await localRun(0);
        // step8: non-host sends unfollow with third-party address
        await receive(new SimpleMessage(localNonHost, [localHost], 'Fm', `$ unfollow ${THIRD_PARTY_EMAIL}`));
        await localRun(1);
        // step9: non-host sends follow with third-party address
        await receive(new SimpleMessage(localNonHost, [localHost], 'Fm', `$ follow ${THIRD_PARTY_EMAIL}`));
        await localRun(1);
        // step10: non-host sends create post
        await receive(new SimpleMessage(localNonHost, [localHost], 'Fm', 'hello, world'));
        await localRun(0);

        jest.useRealTimers();

        const sentDir = path.join(__dirname, 'sent');
        const receivedDir = path.join(__dirname, 'received');
        fs.mkdirSync(sentDir, { recursive: true });
        fs.mkdirSync(receivedDir, { recursive: true });

        localProvider.sentMessages.forEach((message: SimpleMessage, index: number) => {
            fs.writeFileSync(path.join(sentDir, `${index + 1}.txt`), formatMessage(message));
        });

        receivedMessages.forEach((message: SimpleMessage, index: number) => {
            fs.writeFileSync(path.join(receivedDir, `${index + 1}.txt`), formatMessage(message));
        });
    });
});
