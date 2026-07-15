/**
 * Scenario: The host runs `$ invite --addfollower <email>`
 *
 * Covers two bugs:
 *
 * JASON-006 (CRITICAL): No notification email is sent to the follower.
 *   Alice is silently added to the social network but receives nothing.
 *   She will later receive post notifications from a stranger with zero
 *   context about why. Expected: two messages produced by the command —
 *   a host confirmation AND a follower notification.
 *
 * JASON-007 (MAJOR): The host confirmation message has no HTML version.
 *   Every other command response carries an html field. The addfollower
 *   confirmation is sent with isHtml: false and a missing html field.
 *   Expected: the host confirmation must include a non-empty html body.
 *
 * Background (shared with invite scenario):
 *   - setup_attachHost: runs daemon once, sending the welcome message
 *   - setup_createAccount: loads $ adduser command and runs daemon
 *
 * Step under test:
 *   - Load $ invite --addfollower alice@test.com from host to host
 *   - Run daemon with numDrafts=2 (host confirmation + follower notification)
 */

import { Daemon } from '../../../src/models/Daemon';
import { TestMessageProvider } from '../../../src/models/TestMessageProvider';
import { EmailAddress } from '../../../src/models/EmailAddress';
import { ISimpleMessage } from '../../../src/models/SimpleMessage';
import { SimpleMessageWithMessageId } from '../../../src/models/SimpleMessageWithMessageId';
import { FriendlymailMessageType } from '../../../src/models/FriendlymailMessageType';
import { ISocialNetwork } from '../../../src/models/SocialNetwork';

const HOST_EMAIL = 'phil@test.com';
const FOLLOWER_EMAIL = 'alice@test.com';

function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getUser: jest.fn(),
        setUser: jest.fn()
    };
}

describe('Scenario: The host runs $ invite --addfollower to add a follower directly', () => {
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

    /**
     * Run one daemon cycle.
     * Each cycle = getMessages (1s) + numDrafts x sendDraft (1s each) + getMessages (1s).
     */
    async function runDaemon(numDrafts = 1): Promise<void> {
        const runPromise = daemon.run();
        await jest.advanceTimersByTimeAsync((numDrafts + 2) * 1000);
        await runPromise;
    }

    // -- Message factories ------------------------------------------------------

    function hostAdduserCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', '$ adduser');
    }

    function hostAddFollowerCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            hostAddress,
            [hostAddress],
            'Fm',
            `$ invite --addfollower ${FOLLOWER_EMAIL}`
        );
    }

    // -- Background setup helpers -----------------------------------------------

    async function setup_attachHost(): Promise<void> {
        await runDaemon(1); // sends welcome -> sentMessages: 1
    }

    async function setup_createAccount(): Promise<void> {
        await provider.loadMessage(hostAdduserCommand());
        await runDaemon(1); // sends adduser reply -> sentMessages: 2
    }

    // -- Scenario step ----------------------------------------------------------

    async function step_hostAddsFollower(): Promise<void> {
        await provider.loadMessage(hostAddFollowerCommand());
        // numDrafts=2: host confirmation + follower notification (JASON-006: second one is missing)
        await runDaemon(2);
    }

    // -- Test suite -------------------------------------------------------------

    describe('Step: Host adds follower directly with $ invite --addfollower', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await setup_createAccount();
            await step_hostAddsFollower();
        });

        // -- JASON-006: Follower notification is missing ------------------------

        describe('JASON-006: Follower notification email', () => {
            /**
             * Root assertion: the command must produce exactly 4 sent messages.
             * welcome(1) + adduser_reply(2) + host_confirmation(3) + follower_notification(4)
             * Currently produces 3 -- the follower notification is never created.
             * This test MUST FAIL until JASON-006 is fixed.
             */
            it('should send exactly four messages total (welcome + adduser_reply + host_confirmation + follower_notification)', () => {
                expect(provider.sentMessages).toHaveLength(4);
            });

            /**
             * The follower must receive at least one message addressed directly to them.
             * Currently no message is sent to alice@test.com at all.
             * This test MUST FAIL until JASON-006 is fixed.
             */
            it('should send a message addressed to the follower email', () => {
                const followerMsg = provider.sentMessages.find((m: SimpleMessageWithMessageId) =>
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
                );
                expect(followerMsg).toBeDefined();
            });

            /**
             * The follower notification must include the host's email address so Alice
             * knows who added her and can identify the stranger sending her future posts.
             * This test MUST FAIL until JASON-006 is fixed.
             */
            it('should include the host email address in the follower notification body', () => {
                const followerMsg = provider.sentMessages.find((m: SimpleMessageWithMessageId) =>
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
                );
                // Existence guard: if JASON-006 is still open the prior test already fails.
                // This assertion targets content correctness independently.
                expect(followerMsg).toBeDefined();
                expect((followerMsg as SimpleMessageWithMessageId).body).toContain(HOST_EMAIL);
            });

            /**
             * The follower notification must provide some explanation of why Alice is
             * receiving this message -- e.g. that she has been added as a follower.
             * Without this context, the email is confusing and potentially alarming.
             * This test MUST FAIL until JASON-006 is fixed.
             */
            it('should include an explanation in the follower notification body (e.g. "follow", "follower", "following", or "added")', () => {
                const followerMsg = provider.sentMessages.find((m: SimpleMessageWithMessageId) =>
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
                );
                expect(followerMsg).toBeDefined();
                const body = (followerMsg as SimpleMessageWithMessageId).body.toLowerCase();
                const hasExplanation = body.includes('follow') || body.includes('added');
                expect(hasExplanation).toBe(true);
            });

            /**
             * The follower notification must carry the INVITE message type in the
             * X-friendlymail header so clients can filter or identify it correctly.
             * This test MUST FAIL until JASON-006 is fixed.
             */
            it('should set X-friendlymail to INVITE type on the follower notification', () => {
                const followerMsg = provider.sentMessages.find((m: SimpleMessageWithMessageId) =>
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
                );
                expect(followerMsg).toBeDefined();
                expect((followerMsg as SimpleMessageWithMessageId).xFriendlymail).toContain(FriendlymailMessageType.INVITE);
            });
        });

        // -- JASON-007: Host confirmation has no HTML version -------------------

        describe('JASON-007: Host confirmation HTML body', () => {
            let hostConfirmationMsg: SimpleMessageWithMessageId | undefined;

            beforeEach(() => {
                // The host confirmation is the message addressed to the host that carries
                // the INVITE type. Welcome and adduser_reply carry different types.
                hostConfirmationMsg = provider.sentMessages.find((m: SimpleMessageWithMessageId) =>
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL) &&
                    m.xFriendlymail?.includes(FriendlymailMessageType.INVITE)
                );
            });

            /**
             * The host confirmation must exist before we can assert on its content.
             * This is a precondition guard, not the JASON-007 assertion itself.
             */
            it('should send an INVITE-typed confirmation to the host', () => {
                expect(hostConfirmationMsg).toBeDefined();
            });

            /**
             * The host confirmation must carry a non-null html field.
             * Currently the message is created with isHtml: false and no html field.
             * Every other command response (adduser, invite, etc.) has an HTML version.
             * This test MUST FAIL until JASON-007 is fixed.
             */
            it('should include a non-null html field on the host confirmation', () => {
                expect(hostConfirmationMsg).toBeDefined();
                expect((hostConfirmationMsg as ISimpleMessage).html).toBeDefined();
            });

            /**
             * The html field must be a non-empty string, not just a placeholder or
             * an empty tag. An empty html body is functionally equivalent to no html.
             * This test MUST FAIL until JASON-007 is fixed.
             */
            it('should include a non-empty html body on the host confirmation', () => {
                expect(hostConfirmationMsg).toBeDefined();
                const html = (hostConfirmationMsg as ISimpleMessage).html;
                expect(html).toBeDefined();
                expect(html!.trim().length).toBeGreaterThan(0);
            });
        });
    });
});
