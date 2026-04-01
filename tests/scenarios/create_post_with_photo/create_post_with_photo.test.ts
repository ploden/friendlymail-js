/**
 * Scenario: The host creates a post with a photo attachment.
 *
 * Verifies that when the host sends a create-post message that carries a
 * PhotoAttachment, the daemon dispatches new-post notifications to the host
 * and each follower with the photo embedded, and that the postData in the
 * X-friendlymail header records the post type as "image".
 *
 * Also verifies that a plain text post (no photo) is unaffected by the
 * photo-post changes.
 */

import { Daemon } from '../../../src/models/Daemon';
import { TestMessageProvider } from '../../../src/models/TestMessageProvider';
import { EmailAddress } from '../../../src/models/EmailAddress';
import { ISimpleMessage, SimpleMessage } from '../../../src/models/SimpleMessage';
import { SimpleMessageWithMessageId } from '../../../src/models/SimpleMessageWithMessageId';
import { FriendlymailMessageType } from '../../../src/models/FriendlymailMessageType';
import { ISocialNetwork } from '../../../src/models/SocialNetwork';
import { PhotoAttachment } from '../../../src/models/PhotoAttachment';

const HOST_EMAIL = 'phil@test.com';
const FOLLOWER_EMAIL = 'kath@test.com';

function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getUser: jest.fn(),
        setUser: jest.fn()
    };
}

/** Minimal synthetic JPEG buffer — not a valid image but sufficient for unit tests. */
function makePhotoAttachment(filename = 'photo.jpg'): PhotoAttachment {
    return {
        data: Buffer.from('fake-jpeg-data'),
        contentType: 'image/jpeg',
        filename,
    };
}

describe('Scenario: Create post with photo', () => {
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
            hostAddress, [hostAddress], 'Fm',
            `$ invite --addfollower ${FOLLOWER_EMAIL}`
        );
    }

    function createPhotoPostMessage(body = '', photo = makePhotoAttachment()): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            hostAddress, [hostAddress], 'Fm', body,
            undefined, undefined, undefined, undefined, photo
        );
    }

    function createTextPostMessage(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', 'Hello, world');
    }

    // ── Step helpers ───────────────────────────────────────────────────────────

    async function step_attachHost(): Promise<void> {
        await runDaemon(1); // sends welcome
    }

    async function step_createAccount(): Promise<void> {
        await provider.loadMessage(adduserCommand());
        await runDaemon(1);
    }

    async function step_inviteFollower(): Promise<void> {
        await provider.loadMessage(inviteAddfollowerCommand());
        await runDaemon(1);
    }

    async function step_createPhotoPost(body = ''): Promise<void> {
        await provider.loadMessage(createPhotoPostMessage(body));
        await runDaemon(2); // sends notification to host + follower
    }

    async function step_createTextPost(): Promise<void> {
        await provider.loadMessage(createTextPostMessage());
        await runDaemon(2); // sends notification to host + follower
    }

    // ── Photo-only post (no text body) ─────────────────────────────────────────

    describe('Photo-only post (no text body)', () => {
        beforeEach(async () => {
            await step_attachHost();
            await step_createAccount();
            await step_inviteFollower();
            await step_createPhotoPost();
        });

        it('should send a new post notification to the host user', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification).toBeDefined();
        });

        it('should send a new post notification to the follower', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notification).toBeDefined();
        });

        it('should send exactly two post notifications', () => {
            const notifications = provider.sentMessages.filter(
                (m: SimpleMessage) => m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION)
            );
            expect(notifications).toHaveLength(2);
        });

        it('should send the host notification with fromName "Phil L (via friendlymail)"', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect((notification as ISimpleMessage).fromName).toBe('Phil L (via friendlymail)');
        });

        it('should send the follower notification with fromName "Phil L (via friendlymail)"', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect((notification as ISimpleMessage).fromName).toBe('Phil L (via friendlymail)');
        });

        it('should set the X-friendlymail header to new_post_notification on the host notification', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.xFriendlymail).toContain(FriendlymailMessageType.NEW_POST_NOTIFICATION);
        });

        it('should set the X-friendlymail header to new_post_notification on the follower notification', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notification!.xFriendlymail).toContain(FriendlymailMessageType.NEW_POST_NOTIFICATION);
        });

        it('should record post type as "image" in the X-friendlymail postData on the host notification', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.xFriendlymail).toContain('"type":"image"');
        });

        it('should record post type as "image" in the X-friendlymail postData on the follower notification', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notification!.xFriendlymail).toContain('"type":"image"');
        });

        it('should include "[Photo attached]" in the host notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.body).toContain('[Photo attached]');
        });

        it('should include "[Photo attached]" in the follower notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notification!.body).toContain('[Photo attached]');
        });

        it('should include "cid:post_photo" in the host notification HTML', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.html).toContain('cid:post_photo');
        });

        it('should include "cid:post_photo" in the follower notification HTML', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notification!.html).toContain('cid:post_photo');
        });

        it('should include the signature in the host notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.body).toContain('friendlymail, an open-source, email-based, alternative social network');
        });
    });

    // ── Photo post with text body ───────────────────────────────────────────────

    describe('Photo post with text body', () => {
        const POST_TEXT = 'Check out this photo!';

        beforeEach(async () => {
            await step_attachHost();
            await step_createAccount();
            await step_inviteFollower();
            await step_createPhotoPost(POST_TEXT);
        });

        it('should send the photo post notification with fromName "Phil L (via friendlymail)"', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect((notification as ISimpleMessage).fromName).toBe('Phil L (via friendlymail)');
        });

        it('should include the post text in the host notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.body).toContain(POST_TEXT);
        });

        it('should include "[Photo attached]" in the host notification body alongside the text', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.body).toContain('[Photo attached]');
        });

        it('should include "cid:post_photo" in the host notification HTML', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.html).toContain('cid:post_photo');
        });

        it('should record post type as "image" in the X-friendlymail postData', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.xFriendlymail).toContain('"type":"image"');
        });
    });

    // ── Text-only post regression ──────────────────────────────────────────────

    describe('Text-only post (no photo) — regression', () => {
        beforeEach(async () => {
            await step_attachHost();
            await step_createAccount();
            await step_inviteFollower();
            await step_createTextPost();
        });

        it('should send the text post notification with fromName "Phil L (via friendlymail)"', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect((notification as ISimpleMessage).fromName).toBe('Phil L (via friendlymail)');
        });

        it('should NOT include "[Photo attached]" in the host notification body', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.body).not.toContain('[Photo attached]');
        });

        it('should hide the photo row with display:none in the host notification HTML', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.html).toContain('display:none');
        });

        it('should record post type as "text" in the X-friendlymail postData', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
            );
            expect(notification!.xFriendlymail).toContain('"type":"text"');
        });

        it('should hide the photo row with display:none in the follower notification HTML', () => {
            const notification = provider.sentMessages.find(
                (m: SimpleMessage) =>
                    m.xFriendlymail?.includes(FriendlymailMessageType.NEW_POST_NOTIFICATION) &&
                    m.to.some((a: EmailAddress) => a.toString() === FOLLOWER_EMAIL)
            );
            expect(notification!.html).toContain('display:none');
        });
    });
});
