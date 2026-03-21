/**
 * Scenario: An invited non-host user accepts the invite by sending the follow command
 *
 * Covers the flow where a host with an existing account invites a non-host address,
 * the invitee responds with "$ follow", and subsequent posts reach the new follower.
 *
 * Steps:
 *   1. Host attaches (welcome sent)
 *   2. Host creates account
 *   3. Host sends invite to invitee
 *   4. Invitee sends follow command
 *   5. Host creates a post
 */

import { Daemon } from '../../../src/models/Daemon';
import { TestMessageProvider } from '../../../src/models/TestMessageProvider';
import { EmailAddress } from '../../../src/models/EmailAddress';
import { SimpleMessageWithMessageId } from '../../../src/models/SimpleMessageWithMessageId';
import { FriendlymailMessageType } from '../../../src/models/FriendlymailMessageType';
import { ISocialNetwork } from '../../../src/models/SocialNetwork';

const HOST_EMAIL = 'phil@test.com';
const INVITEE_EMAIL = 'alice@test.com';

function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getUser: jest.fn(),
        setUser: jest.fn()
    };
}

describe('Scenario: Invited non-host user accepts invite by sending follow command', () => {
    let hostAddress: EmailAddress;
    let inviteeAddress: EmailAddress;
    let provider: TestMessageProvider;
    let daemon: Daemon;

    beforeEach(() => {
        jest.useFakeTimers();
        hostAddress = new EmailAddress(HOST_EMAIL);
        inviteeAddress = new EmailAddress(INVITEE_EMAIL);
        provider = new TestMessageProvider(hostAddress);
        daemon = new Daemon(hostAddress, provider, provider, makeSocialNetwork());
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    async function runDaemon(numDrafts = 1): Promise<void> {
        const runPromise = daemon.run();
        await jest.advanceTimersByTimeAsync((numDrafts + 2) * 1000);
        await runPromise;
    }

    // ── Message factories ──────────────────────────────────────────────────────

    function adduserCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', '$ adduser');
    }

    function inviteCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            hostAddress, [hostAddress], 'Fm',
            `$ invite ${INVITEE_EMAIL}`
        );
    }

    function inviteeFollowCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(inviteeAddress, [hostAddress], 'Fm', '$ follow');
    }

    function createPostCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', 'Hello, world');
    }

    // ── Setup helpers ──────────────────────────────────────────────────────────

    async function step1_attachHost(): Promise<void> {
        await runDaemon(1); // welcome sent
    }

    async function step2_createAccount(): Promise<void> {
        await provider.loadMessage(adduserCommand());
        await runDaemon(1);
    }

    async function step3_hostSendsInvite(): Promise<void> {
        await provider.loadMessage(inviteCommand());
        await runDaemon(2); // confirmation to host + invite to invitee
    }

    async function step4_inviteeSendsFollow(): Promise<void> {
        await provider.loadMessage(inviteeFollowCommand());
        await runDaemon(2); // follow response to invitee + new follower notification to host
    }

    async function step5_hostCreatesPost(): Promise<void> {
        await provider.loadMessage(createPostCommand());
        await runDaemon(2); // post notification to host + post notification to invitee (now follower)
    }

    // ── Step 4: Invitee sends follow command ───────────────────────────────────

    describe('Step 4: Invitee sends follow command after receiving invite', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_createAccount();
            await step3_hostSendsInvite();
            await step4_inviteeSendsFollow();
        });

        it('should send at least one message in response to the follow command', () => {
            // Before fix: Sent: (none) — zero messages produced after accept_invite
            const messagesAfterFollow = provider.sentMessages.slice(4); // first 4: welcome, adduser, invite-confirm, invite-to-invitee
            expect(messagesAfterFollow.length).toBeGreaterThan(0);
        });

        it('should send a follow response to the invitee', () => {
            const followResponse = provider.sentMessages.find(m =>
                m.to.some((a: EmailAddress) => a.toString() === INVITEE_EMAIL) &&
                m.xFriendlymail?.includes(FriendlymailMessageType.FOLLOW_RESPONSE)
            );
            expect(followResponse).toBeDefined();
        });

        it('should send a new follower notification to the host', () => {
            const newFollowerNotification = provider.sentMessages.find(m =>
                m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL) &&
                m.xFriendlymail?.includes(FriendlymailMessageType.NEW_FOLLOWER_NOTIFICATION)
            );
            expect(newFollowerNotification).toBeDefined();
        });

        it('should include the host email in the follow response body', () => {
            const followResponse = provider.sentMessages.find(m =>
                m.to.some((a: EmailAddress) => a.toString() === INVITEE_EMAIL) &&
                m.xFriendlymail?.includes(FriendlymailMessageType.FOLLOW_RESPONSE)
            );
            expect(followResponse?.body).toContain(HOST_EMAIL);
        });
    });

    // ── Step 5: Host creates a post after invitee has followed ─────────────────

    describe('Step 5: Host creates a post after invitee accepted invite', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_createAccount();
            await step3_hostSendsInvite();
            await step4_inviteeSendsFollow();
            await step5_hostCreatesPost();
        });

        it('should send a post notification to the invitee (now a follower)', () => {
            // Before fix: post notification only sent to host, not to the new follower
            const postToInvitee = provider.sentMessages.find(m =>
                m.to.some((a: EmailAddress) => a.toString() === INVITEE_EMAIL) &&
                m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION)
            );
            expect(postToInvitee).toBeDefined();
        });

        it('should send a post notification to the host', () => {
            const postToHost = provider.sentMessages.find(m =>
                m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL) &&
                m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION)
            );
            expect(postToHost).toBeDefined();
        });

        it('should include the post content in the notification to the invitee', () => {
            const postToInvitee = provider.sentMessages.find(m =>
                m.to.some((a: EmailAddress) => a.toString() === INVITEE_EMAIL) &&
                m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION)
            );
            expect(postToInvitee?.body).toContain('Hello, world');
        });
    });
});
