/**
 * Scenario: A registered user creates a post by sending a message WITH a photo attachment
 *
 * Covers:
 *
 * JASON-014/015 (MAJOR): When a post message carries a photoAttachment, the
 *   new_post_notification drafts must have postData.type === 'image', not 'text'.
 *
 *   Root cause under investigation: MessageProcessor.createPostNotifications()
 *   (line 893) correctly sets postType from postMessage.photoAttachment, but in
 *   local sim mode attachments are silently dropped, making photoAttachment
 *   undefined. This test suite uses TestMessageProvider directly (no sim layer)
 *   so the photoAttachment is preserved end-to-end through the processor.
 *   If the tests below FAIL, the bug is in MessageProcessor itself (not the
 *   sim layer) and postType is being computed incorrectly regardless of input.
 *
 *   The postData record is serialised into the X-friendlymail header via
 *   encodeQuotedPrintable(JSON.stringify(meta)). Each test decodes that header
 *   and asserts on postData.type.
 *
 * Contrast test:
 *   A post sent WITHOUT a photoAttachment must produce postData.type === 'text'.
 *
 * Background setup (mirrors create_post_scenario.test.ts):
 *   - step1_attachHost:        run daemon once → sends welcome
 *   - step2_createAccount:     send $ adduser → run daemon
 *   - step3_inviteFollower:    send $ invite --addfollower → run daemon
 *
 * Steps under test:
 *   - Host sends a post WITH a photoAttachment
 *   - Assert every new_post_notification has postData.type === 'image'
 *
 *   - Host sends a post WITHOUT a photoAttachment
 *   - Assert every new_post_notification has postData.type === 'text'
 */

import { Daemon } from '../../src/models/Daemon';
import { TestMessageProvider } from '../../src/models/TestMessageProvider';
import { EmailAddress } from '../../src/models/EmailAddress';
import { SimpleMessage } from '../../src/models/SimpleMessage';
import { SimpleMessageWithMessageId } from '../../src/models/SimpleMessageWithMessageId';
import { FriendlymailMessageType } from '../../src/models/FriendlymailMessageType';
import { PhotoAttachment } from '../../src/models/PhotoAttachment';
import { ISocialNetwork } from '../../src/models/SocialNetwork';
import { decodeQuotedPrintable } from '../../src/utils/quotedPrintable';

const HOST_EMAIL = 'phil@test.com';
const FOLLOWER_EMAIL = 'kath@test.com';

function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getUser: jest.fn(),
        setUser: jest.fn()
    };
}

/**
 * Decode the X-friendlymail QP header and return the parsed meta object.
 * Returns null if the header is missing or not valid JSON.
 */
function parseXFriendlymail(xFriendlymail: string | undefined): Record<string, unknown> | null {
    if (!xFriendlymail) return null;
    try {
        return JSON.parse(decodeQuotedPrintable(xFriendlymail)) as Record<string, unknown>;
    } catch {
        return null;
    }
}

/**
 * Minimal synthetic JPEG bytes (valid enough to satisfy Buffer construction;
 * no real image processing is needed for this logic path).
 */
function makePhotoAttachment(): PhotoAttachment {
    return {
        data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
        contentType: 'image/jpeg',
        filename: 'photo.jpg'
    };
}

describe('Scenario: Post with photo attachment sets postData.type to image', () => {
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

    // ── Message factories ──────────────────────────────────────────────────────

    function adduserCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', '$ adduser');
    }

    function inviteAddfollowerCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            hostAddress,
            [hostAddress],
            'Fm',
            `$ invite --addfollower ${FOLLOWER_EMAIL}`
        );
    }

    /**
     * Post message WITH a photoAttachment.
     * Constructor param order: from, to, subject, body, date, xFriendlymail,
     * html, messageId, photoAttachment, fromName, xSimStep
     * photoAttachment is at index 8.
     */
    function createPhotoPostMessage(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            hostAddress,
            [hostAddress],
            'Fm',
            'Check out this photo',
            new Date(),
            undefined, // xFriendlymail
            undefined, // html
            undefined, // messageId (auto-generated)
            makePhotoAttachment()
        );
    }

    /**
     * Post message WITHOUT a photoAttachment — the contrast case.
     */
    function createTextPostMessage(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            hostAddress,
            [hostAddress],
            'Fm',
            'Just a text post'
        );
    }

    // ── Setup helpers ──────────────────────────────────────────────────────────

    async function step1_attachHost(): Promise<void> {
        await runDaemon(1); // sends welcome
    }

    async function step2_createAccount(): Promise<void> {
        await provider.loadMessage(adduserCommand());
        await runDaemon(1); // sends adduser reply
    }

    async function step3_inviteFollower(): Promise<void> {
        await provider.loadMessage(inviteAddfollowerCommand());
        // invite --addfollower sends two drafts: confirmation to host + invite to follower
        await runDaemon(2);
    }

    // ── Helper: find all new_post_notification drafts ──────────────────────────

    function findPostNotifications(): SimpleMessageWithMessageId[] {
        return provider.sentMessages.filter(
            (m: SimpleMessage) =>
                m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION)
        ) as SimpleMessageWithMessageId[];
    }

    function findPostNotificationTo(recipientEmail: string): SimpleMessageWithMessageId | undefined {
        return findPostNotifications().find(
            (m: SimpleMessageWithMessageId) =>
                m.to.some((a: EmailAddress) => a.toString() === recipientEmail)
        );
    }

    // ── Suite: photo post ──────────────────────────────────────────────────────

    describe('Photo post: host sends a post message with a photoAttachment', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_createAccount();
            await step3_inviteFollower();
            await provider.loadMessage(createPhotoPostMessage());
            // Two new_post_notification drafts: one to host, one to follower
            await runDaemon(2);
        });

        describe('new_post_notification sent to host', () => {
            let hostNotification: SimpleMessageWithMessageId | undefined;

            beforeEach(() => {
                hostNotification = findPostNotificationTo(HOST_EMAIL);
            });

            /**
             * Precondition: a notification to the host must exist.
             */
            it('should send a new_post_notification to the host', () => {
                expect(hostNotification).toBeDefined();
            });

            /**
             * JASON-014: postData.type in the X-friendlymail header must be 'image'
             * when the post message carries a photoAttachment.
             *
             * The processor at line 893 computes:
             *   const postType = postMessage.photoAttachment ? 'image' : 'text';
             * If the bug is in the processor (not only in the sim layer),
             * postData.type will be 'text' and this test will fail.
             *
             * This test MUST FAIL if the bug affects TestMessageProvider-based flows.
             */
            it('JASON-014: postData.type in X-friendlymail header should be "image" for the host notification', () => {
                expect(hostNotification).toBeDefined();
                const meta = parseXFriendlymail(hostNotification!.xFriendlymail);
                expect(meta).not.toBeNull();
                const postData = meta!['postData'] as Record<string, unknown> | undefined;
                expect(postData).toBeDefined();
                expect(postData!['type']).toBe('image');
            });
        });

        describe('new_post_notification sent to follower', () => {
            let followerNotification: SimpleMessageWithMessageId | undefined;

            beforeEach(() => {
                followerNotification = findPostNotificationTo(FOLLOWER_EMAIL);
            });

            /**
             * Precondition: a notification to the follower must exist.
             */
            it('should send a new_post_notification to the follower', () => {
                expect(followerNotification).toBeDefined();
            });

            /**
             * JASON-015: postData.type in the follower's notification must also be 'image'.
             *
             * createPostNotifications() sends the same postData to every recipient
             * (host and all followers) in a single loop. If the host notification
             * carries 'image', the follower notification must too. If not, the loop
             * is building different postData per recipient — a separate bug.
             *
             * This test MUST FAIL if the bug affects TestMessageProvider-based flows.
             */
            it('JASON-015: postData.type in X-friendlymail header should be "image" for the follower notification', () => {
                expect(followerNotification).toBeDefined();
                const meta = parseXFriendlymail(followerNotification!.xFriendlymail);
                expect(meta).not.toBeNull();
                const postData = meta!['postData'] as Record<string, unknown> | undefined;
                expect(postData).toBeDefined();
                expect(postData!['type']).toBe('image');
            });
        });

        describe('all new_post_notifications for a photo post', () => {
            /**
             * Regression guard: both recipient notifications must agree on type.
             * Ensures the postData object is not mutated between sends.
             */
            it('should emit exactly two new_post_notifications (host + follower)', () => {
                expect(findPostNotifications()).toHaveLength(2);
            });

            it('all new_post_notifications should have postData.type === "image"', () => {
                const notifications = findPostNotifications();
                expect(notifications).toHaveLength(2);
                for (const notification of notifications) {
                    const meta = parseXFriendlymail(notification.xFriendlymail);
                    expect(meta).not.toBeNull();
                    const postData = meta!['postData'] as Record<string, unknown> | undefined;
                    expect(postData).toBeDefined();
                    expect(postData!['type']).toBe('image');
                }
            });
        });
    });

    // ── Suite: text post (contrast) ────────────────────────────────────────────

    describe('Text post (contrast): host sends a post message WITHOUT a photoAttachment', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_createAccount();
            await step3_inviteFollower();
            await provider.loadMessage(createTextPostMessage());
            await runDaemon(2);
        });

        describe('all new_post_notifications for a text post', () => {
            /**
             * Baseline: a post without an attachment must produce postData.type === 'text'.
             * If this fails, the postType logic is broken for the normal text case.
             */
            it('should emit exactly two new_post_notifications (host + follower)', () => {
                expect(findPostNotifications()).toHaveLength(2);
            });

            it('all new_post_notifications should have postData.type === "text"', () => {
                const notifications = findPostNotifications();
                expect(notifications).toHaveLength(2);
                for (const notification of notifications) {
                    const meta = parseXFriendlymail(notification.xFriendlymail);
                    expect(meta).not.toBeNull();
                    const postData = meta!['postData'] as Record<string, unknown> | undefined;
                    expect(postData).toBeDefined();
                    expect(postData!['type']).toBe('text');
                }
            });

            it('host notification should have postData.type === "text"', () => {
                const hostNotification = findPostNotificationTo(HOST_EMAIL);
                expect(hostNotification).toBeDefined();
                const meta = parseXFriendlymail(hostNotification!.xFriendlymail);
                const postData = meta!['postData'] as Record<string, unknown> | undefined;
                expect(postData!['type']).toBe('text');
            });

            it('follower notification should have postData.type === "text"', () => {
                const followerNotification = findPostNotificationTo(FOLLOWER_EMAIL);
                expect(followerNotification).toBeDefined();
                const meta = parseXFriendlymail(followerNotification!.xFriendlymail);
                const postData = meta!['postData'] as Record<string, unknown> | undefined;
                expect(postData!['type']).toBe('text');
            });
        });
    });
});
