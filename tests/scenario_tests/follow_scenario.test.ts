/**
 * Scenario: An invitee accepts an invite by sending `$ follow`
 *
 * Covers:
 *
 * JASON-012 (MAJOR): The `new_follower_notification` sent to the host uses a
 *   machine-derived synthetic name ("Alice L") instead of the sender's actual
 *   display name ("Alice Johnson").
 *
 *   Root cause: `_createNewFollowerNotificationDraft()` called
 *   `this._displayName(message.from)`, which generates a name from the email
 *   address local-part and domain initial, ignoring `message.fromName` entirely.
 *
 *   `_displayName('alice@test.com')` → "Alice L"
 *   `message.fromName`              → "Alice Johnson"  (ignored)
 *
 *   Fix: use `message.fromName ?? this._displayName(message.from)`.
 *
 * Background setup:
 *   - setup_attachHost:    run daemon once to send the welcome message
 *   - setup_createAccount: send `$ adduser` from host, run daemon
 *   - setup_inviteAlice:   send `$ invite alice@test.com` from host, run daemon
 *
 * Step under test:
 *   - Alice sends `$ follow` with `fromName` set to "Alice Johnson"
 *   - Assert the `new_follower_notification` draft uses "Alice Johnson",
 *     not the synthetic "Alice L"
 */

import { Daemon } from '../../src/models/Daemon';
import { TestMessageProvider } from '../../src/models/TestMessageProvider';
import { EmailAddress } from '../../src/models/EmailAddress';
import { ISimpleMessage } from '../../src/models/SimpleMessage';
import { SimpleMessageWithMessageId } from '../../src/models/SimpleMessageWithMessageId';
import { FriendlymailMessageType } from '../../src/models/FriendlymailMessageType';
import { ISocialNetwork } from '../../src/models/SocialNetwork';

const HOST_EMAIL = 'ploden.postcards@gmail.com';
const FOLLOWER_EMAIL = 'alice@test.com';
const FOLLOWER_DISPLAY_NAME = 'Alice Johnson';

// The synthetic name _displayName() produces for 'alice@test.com':
//   local="alice" → "Alice"
//   sld="test" → t(20)+e(5)+s(19)+t(20)=64 → 64%26=12 → 'L'
//   result: "Alice L"
const SYNTHETIC_NAME = 'Alice L';

function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getUser: jest.fn(),
        setUser: jest.fn()
    };
}

describe('Scenario: Invitee accepts an invite by sending $ follow', () => {
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
     * Run one daemon cycle.
     * Each cycle = getMessages (1s) + numDrafts × sendDraft (1s each) + getMessages (1s).
     */
    async function runDaemon(numDrafts = 1): Promise<void> {
        const runPromise = daemon.run();
        await jest.advanceTimersByTimeAsync((numDrafts + 2) * 1000);
        await runPromise;
    }

    // -- Message factories -------------------------------------------------------

    function hostAdduserCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', '$ adduser');
    }

    function hostInviteCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            hostAddress,
            [hostAddress],
            'Fm',
            `$ invite ${FOLLOWER_EMAIL}`
        );
    }

    /**
     * The `$ follow` message Alice sends after receiving her invite.
     * `fromName` is set to her actual display name "Alice Johnson".
     * The bug under test causes this value to be ignored in favour of the
     * synthetic "Alice L" derived from her email address.
     */
    function aliceFollowCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            followerAddress,
            [hostAddress],
            'Fm',
            '$ follow',
            new Date(),
            undefined,  // xFriendlymail
            undefined,  // html
            undefined,  // messageId (auto-generated)
            undefined,  // photoAttachment
            FOLLOWER_DISPLAY_NAME  // fromName — "Alice Johnson"
        );
    }

    // -- Background setup helpers ------------------------------------------------

    async function setup_attachHost(): Promise<void> {
        await runDaemon(1); // sends welcome → sentMessages: 1
    }

    async function setup_createAccount(): Promise<void> {
        await provider.loadMessage(hostAdduserCommand());
        await runDaemon(1); // sends adduser reply → sentMessages: 2
    }

    async function setup_inviteAlice(): Promise<void> {
        await provider.loadMessage(hostInviteCommand());
        await runDaemon(2); // sends invite confirmation + invite to alice → sentMessages: 4
    }

    // -- Scenario step -----------------------------------------------------------

    async function step_aliceFollows(): Promise<void> {
        await provider.loadMessage(aliceFollowCommand());
        // Two drafts: follow_response to alice + new_follower_notification to host
        await runDaemon(2);
    }

    // -- Test suite --------------------------------------------------------------

    describe('Step: Alice sends $ follow with display name "Alice Johnson"', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await setup_createAccount();
            await setup_inviteAlice();
            await step_aliceFollows();
        });

        describe('new_follower_notification sent to host', () => {
            let notificationMsg: SimpleMessageWithMessageId | undefined;

            beforeEach(() => {
                // The new_follower_notification is addressed to the host and carries
                // the NEW_FOLLOWER_NOTIFICATION message type in X-friendlymail.
                notificationMsg = provider.sentMessages.find((m: SimpleMessageWithMessageId) =>
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL) &&
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_FOLLOWER_NOTIFICATION)
                );
            });

            /**
             * Precondition: the notification must exist before asserting on its content.
             */
            it('should send a new_follower_notification to the host', () => {
                expect(notificationMsg).toBeDefined();
            });

            /**
             * JASON-012: Subject must contain the sender's actual display name.
             *
             * The subject line is constructed as:
             *   `friendlymail: ${followerName} is now following you`
             *
             * With the bug, `followerName` is "Alice L" (derived from alice@test.com).
             * With the fix, `followerName` is "Alice Johnson" (from message.fromName).
             *
             * This test MUST FAIL until JASON-012 is fixed.
             */
            it('JASON-012: subject should contain the sender display name "Alice Johnson", not the synthetic "Alice L"', () => {
                expect(notificationMsg).toBeDefined();
                expect(notificationMsg!.subject).toContain(FOLLOWER_DISPLAY_NAME);
            });

            /**
             * JASON-012: Body must contain the sender's actual display name.
             *
             * The template renders as: "{{ follower_name }} is now following you."
             *
             * With the bug, `follower_name` is "Alice L".
             * With the fix, `follower_name` is "Alice Johnson".
             *
             * This test MUST FAIL until JASON-012 is fixed.
             */
            it('JASON-012: body should contain the sender display name "Alice Johnson", not the synthetic "Alice L"', () => {
                expect(notificationMsg).toBeDefined();
                expect(notificationMsg!.body).toContain(FOLLOWER_DISPLAY_NAME);
            });

            /**
             * JASON-012: The synthetic name must NOT appear in the subject.
             *
             * "Alice L" is generated by _displayName('alice@test.com') and is
             * meaningless to the host. Its presence indicates the bug is active.
             *
             * This test MUST FAIL until JASON-012 is fixed.
             */
            it('JASON-012: subject should NOT contain the synthetic name "Alice L"', () => {
                expect(notificationMsg).toBeDefined();
                expect(notificationMsg!.subject).not.toContain(SYNTHETIC_NAME);
            });

            /**
             * JASON-012: The synthetic name must NOT appear in the body.
             *
             * Same rationale as the subject assertion above.
             *
             * This test MUST FAIL until JASON-012 is fixed.
             */
            it('JASON-012: body should NOT contain the synthetic name "Alice L"', () => {
                expect(notificationMsg).toBeDefined();
                expect(notificationMsg!.body).not.toContain(SYNTHETIC_NAME);
            });
        });
    });
});
