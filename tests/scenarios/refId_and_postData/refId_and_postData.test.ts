/**
 * Tests for:
 * - refId field on Post and Comment models
 * - postData in X-friendlymail header of post and comment notification messages
 * - refId format (2-digit year + incrementing uppercase hex counter)
 * - Round-trip: Post/Comment reconstructed from postData JSON matches original
 */

import { Daemon } from '../../../src/models/Daemon';
import { TestMessageProvider } from '../../../src/models/TestMessageProvider';
import { EmailAddress } from '../../../src/models/EmailAddress';
import { SimpleMessage } from '../../../src/models/SimpleMessage';
import { SimpleMessageWithMessageId } from '../../../src/models/SimpleMessageWithMessageId';
import { ISocialNetwork } from '../../../src/models/SocialNetwork';
import { Post } from '../../../src/models/Post';
import { Comment } from '../../../src/models/Comment';
import { User } from '../../../src/models/User';
import { decodeQuotedPrintable } from '../../../src/utils/quotedPrintable';

const HOST_EMAIL = 'phil@test.com';
const FOLLOWER_EMAIL = 'kath@test.com';
const FIRST_POST_BODY = 'Hello, world';
const SECOND_POST_BODY = 'Hello again, world';
const COMMENT_BODY = 'hello, universe!';
const FIRST_POST_MESSAGE_ID = '74206DB7-D586-4F7D-A203-5C5E1DAE7112@gmail.com';
const FIRST_POST_BASE64_ID = 'PDc0MjA2REI3LUQ1ODYtNEY3RC1BMjAzLTVDNUUxREFFNzExMkBnbWFpbC5jb20+';
const POST_NOTIFICATION_SUBJECT = 'friendlymail: New post from Phil L';

function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getUser: jest.fn(),
        setUser: jest.fn()
    };
}

/**
 * Decode an X-friendlymail QP-encoded header and return the metadata object.
 */
function decodeMeta(xFriendlymail: string): Record<string, unknown> {
    return JSON.parse(decodeQuotedPrintable(xFriendlymail));
}

/**
 * Extract and return the postData record from a decoded X-friendlymail header.
 */
function extractPostData(xFriendlymail: string): Record<string, unknown> {
    return decodeMeta(xFriendlymail).postData as Record<string, unknown>;
}

describe('refId and postData in notification messages', () => {
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
        const p = daemon.run();
        await jest.advanceTimersByTimeAsync((numDrafts + 2) * 1000);
        await p;
    }

    // ── Scenario step helpers ──────────────────────────────────────────────────

    async function step1_attachHost(): Promise<void> {
        await runDaemon(1);
    }

    async function step2_sendHelp(): Promise<void> {
        await provider.loadMessage(
            new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', '$ help')
        );
        await runDaemon(1);
    }

    async function step3_createAccount(): Promise<void> {
        await provider.loadMessage(
            new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', '$ adduser')
        );
        await runDaemon(1);
    }

    async function step4_inviteFollower(): Promise<void> {
        await provider.loadMessage(
            new SimpleMessageWithMessageId(
                hostAddress, [hostAddress], 'Fm',
                `$ invite --addfollower ${FOLLOWER_EMAIL}`
            )
        );
        await runDaemon(1);
    }

    async function step5_createFirstPost(): Promise<void> {
        await provider.loadMessage(
            new SimpleMessageWithMessageId(
                hostAddress, [hostAddress], 'Fm',
                FIRST_POST_BODY, undefined, undefined, undefined, FIRST_POST_MESSAGE_ID
            )
        );
        await runDaemon(2); // sends host notification + follower notification
    }

    async function step6_likePost(): Promise<void> {
        await provider.loadMessage(
            new SimpleMessageWithMessageId(
                followerAddress, [hostAddress],
                `Fm Like ❤️:${FIRST_POST_BASE64_ID}`,
                '❤️'
            )
        );
        await runDaemon(1);
    }

    async function step7_commentOnPost(): Promise<void> {
        await provider.loadMessage(
            new SimpleMessageWithMessageId(
                followerAddress, [hostAddress],
                `Fm Comment 💬:${FIRST_POST_BASE64_ID}`,
                COMMENT_BODY
            )
        );
        await runDaemon(1);
    }

    async function step8_createSecondPost(): Promise<void> {
        await provider.loadMessage(
            new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', SECOND_POST_BODY)
        );
        await runDaemon(2);
    }

    // ── Finders ────────────────────────────────────────────────────────────────

    function findPostNotification(toEmail: string): SimpleMessageWithMessageId {
        return provider.sentMessages.find(
            (m: SimpleMessage) =>
                m.subject === POST_NOTIFICATION_SUBJECT &&
                m.to.some((a: EmailAddress) => a.toString() === toEmail)
        ) as SimpleMessageWithMessageId;
    }

    function findAllPostNotifications(toEmail: string): SimpleMessageWithMessageId[] {
        return provider.sentMessages.filter(
            (m: SimpleMessage) =>
                m.subject === POST_NOTIFICATION_SUBJECT &&
                m.to.some((a: EmailAddress) => a.toString() === toEmail)
        ) as SimpleMessageWithMessageId[];
    }

    function findCommentNotification(): SimpleMessageWithMessageId {
        return provider.sentMessages.find(
            (m: SimpleMessage) =>
                m.subject.includes('New comment from') &&
                m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL)
        ) as SimpleMessageWithMessageId;
    }

    // ── Post model: refId field ────────────────────────────────────────────────

    describe('Post model refId field', () => {
        it('defaults to empty string when no refId option is provided', () => {
            const author = new User('Phil L', new EmailAddress(HOST_EMAIL));
            const post = new Post(author, 'test content', 'text');
            expect(post.refId).toBe('');
        });

        it('stores the refId passed in constructor options', () => {
            const author = new User('Phil L', new EmailAddress(HOST_EMAIL));
            const post = new Post(author, 'test content', 'text', { refId: '261' });
            expect(post.refId).toBe('261');
        });

        it('stores a multi-character hex refId', () => {
            const author = new User('Phil L', new EmailAddress(HOST_EMAIL));
            const post = new Post(author, 'test content', 'text', { refId: '26C8' });
            expect(post.refId).toBe('26C8');
        });

        it('refId is independent of post id (which is auto-generated)', () => {
            const author = new User('Phil L', new EmailAddress(HOST_EMAIL));
            const post = new Post(author, 'test content', 'text', { refId: '261' });
            expect(post.id).not.toBe('261');
            expect(post.refId).toBe('261');
        });
    });

    // ── Comment model: refId field ─────────────────────────────────────────────

    describe('Comment model refId field', () => {
        it('defaults to empty string when no refId argument is provided', () => {
            const author = new User('Kath L', new EmailAddress(FOLLOWER_EMAIL));
            const comment = new Comment(author, 'test comment', 'some-post-id');
            expect(comment.refId).toBe('');
        });

        it('stores the refId passed as the fourth constructor argument', () => {
            const author = new User('Kath L', new EmailAddress(FOLLOWER_EMAIL));
            const comment = new Comment(author, 'test comment', 'some-post-id', '261');
            expect(comment.refId).toBe('261');
        });

        it('stores a multi-character hex refId', () => {
            const author = new User('Kath L', new EmailAddress(FOLLOWER_EMAIL));
            const comment = new Comment(author, 'test comment', 'some-post-id', '26C8');
            expect(comment.refId).toBe('26C8');
        });

        it('refId is accessible via the IPost interface since IComment extends IPost', () => {
            const author = new User('Kath L', new EmailAddress(FOLLOWER_EMAIL));
            const comment = new Comment(author, 'test comment', 'some-post-id', '26A');
            // Cast to IPost — refId must be present because IComment extends IPost
            const asIPost = comment as Post;
            expect(asIPost.refId).toBe('26A');
        });
    });

    // ── Post notification: postData in X-friendlymail ─────────────────────────

    describe('Post notification X-friendlymail postData', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
            await step3_createAccount();
            await step4_inviteFollower();
            await step5_createFirstPost();
        });

        it('host post notification has xFriendlymail header', () => {
            expect(findPostNotification(HOST_EMAIL).xFriendlymail).toBeDefined();
        });

        it('follower post notification has xFriendlymail header', () => {
            expect(findPostNotification(FOLLOWER_EMAIL).xFriendlymail).toBeDefined();
        });

        it('host post notification xFriendlymail includes postData', () => {
            const meta = decodeMeta(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(meta.postData).toBeDefined();
        });

        it('follower post notification xFriendlymail includes postData', () => {
            const meta = decodeMeta(findPostNotification(FOLLOWER_EMAIL).xFriendlymail!);
            expect(meta.postData).toBeDefined();
        });

        it('postData contains an id field', () => {
            const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(typeof postData.id).toBe('string');
            expect((postData.id as string).length).toBeGreaterThan(0);
        });

        it('postData contains a refId field', () => {
            const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(postData.refId).toBeDefined();
        });

        it('postData refId matches format: 2-digit year followed by uppercase hex digits', () => {
            const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(String(postData.refId)).toMatch(/^\d{2}[0-9A-F]+$/);
        });

        it('postData refId starts with the 2-digit current year', () => {
            const expectedYear = String(new Date().getFullYear()).slice(-2);
            const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(String(postData.refId).startsWith(expectedYear)).toBe(true);
        });

        it('postData refId for the first post has hex counter 1', () => {
            const expectedYear = String(new Date().getFullYear()).slice(-2);
            const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(postData.refId).toBe(`${expectedYear}1`);
        });

        it('postData author matches host email', () => {
            const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(postData.author).toBe(HOST_EMAIL);
        });

        it('postData content matches the original post body', () => {
            const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(postData.content).toBe(FIRST_POST_BODY);
        });

        it('postData type is text', () => {
            const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(postData.type).toBe('text');
        });

        it('postData privacy is public', () => {
            const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(postData.privacy).toBe('public');
        });

        it('postData contains createdAt as a parseable ISO date string', () => {
            const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(postData.createdAt).toBeDefined();
            const parsed = new Date(postData.createdAt as string);
            expect(parsed.toString()).not.toBe('Invalid Date');
        });

        it('host and follower notifications carry identical postData', () => {
            const hostPostData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            const followerPostData = extractPostData(findPostNotification(FOLLOWER_EMAIL).xFriendlymail!);
            expect(hostPostData).toEqual(followerPostData);
        });

        it('postData does not contain inReplyTo (posts are not replies)', () => {
            const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
            expect(postData.inReplyTo).toBeUndefined();
        });

        // ── Post round-trip from postData JSON ─────────────────────────────────

        describe('Post round-trip: reconstructed from postData JSON', () => {
            it('reconstructed Post has matching refId', () => {
                const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
                const author = new User('Phil L', new EmailAddress(postData.author as string));
                const reconstructed = new Post(
                    author,
                    postData.content as string,
                    postData.type as 'text',
                    { refId: postData.refId as string }
                );
                expect(reconstructed.refId).toBe(postData.refId);
            });

            it('reconstructed Post has matching content', () => {
                const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
                const author = new User('Phil L', new EmailAddress(postData.author as string));
                const reconstructed = new Post(
                    author,
                    postData.content as string,
                    postData.type as 'text',
                    { refId: postData.refId as string }
                );
                expect(reconstructed.content).toBe(FIRST_POST_BODY);
            });

            it('reconstructed Post has matching author email', () => {
                const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
                const author = new User('Phil L', new EmailAddress(postData.author as string));
                const reconstructed = new Post(
                    author,
                    postData.content as string,
                    postData.type as 'text',
                    { refId: postData.refId as string }
                );
                expect(reconstructed.author.email.toString()).toBe(HOST_EMAIL);
            });

            it('reconstructed Post has matching type', () => {
                const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
                const author = new User('Phil L', new EmailAddress(postData.author as string));
                const reconstructed = new Post(
                    author,
                    postData.content as string,
                    postData.type as 'text',
                    { refId: postData.refId as string }
                );
                expect(reconstructed.type).toBe('text');
            });

            it('reconstructed Post has matching privacy', () => {
                const postData = extractPostData(findPostNotification(HOST_EMAIL).xFriendlymail!);
                const author = new User('Phil L', new EmailAddress(postData.author as string));
                const reconstructed = new Post(
                    author,
                    postData.content as string,
                    postData.type as 'text',
                    { refId: postData.refId as string, privacy: postData.privacy as 'public' }
                );
                expect(reconstructed.privacy).toBe('public');
            });
        });
    });

    // ── Post refId counter increments across posts ─────────────────────────────

    describe('Post notification refId counter increments with each new post', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
            await step3_createAccount();
            await step4_inviteFollower();
            await step5_createFirstPost();
            await step6_likePost();
            await step7_commentOnPost();
            await step8_createSecondPost();
        });

        it('first post host notification refId counter is 1', () => {
            const expectedYear = String(new Date().getFullYear()).slice(-2);
            const notifications = findAllPostNotifications(HOST_EMAIL);
            const postData = extractPostData(notifications[0].xFriendlymail!);
            expect(postData.refId).toBe(`${expectedYear}1`);
        });

        it('second post host notification refId counter is 2', () => {
            const expectedYear = String(new Date().getFullYear()).slice(-2);
            const notifications = findAllPostNotifications(HOST_EMAIL);
            const postData = extractPostData(notifications[1].xFriendlymail!);
            expect(postData.refId).toBe(`${expectedYear}2`);
        });

        it('first post follower notification refId counter is 1', () => {
            const expectedYear = String(new Date().getFullYear()).slice(-2);
            const notifications = findAllPostNotifications(FOLLOWER_EMAIL);
            const postData = extractPostData(notifications[0].xFriendlymail!);
            expect(postData.refId).toBe(`${expectedYear}1`);
        });

        it('second post follower notification refId counter is 2', () => {
            const expectedYear = String(new Date().getFullYear()).slice(-2);
            const notifications = findAllPostNotifications(FOLLOWER_EMAIL);
            const postData = extractPostData(notifications[1].xFriendlymail!);
            expect(postData.refId).toBe(`${expectedYear}2`);
        });

        it('first and second post refIds differ', () => {
            const notifications = findAllPostNotifications(HOST_EMAIL);
            const firstRefId = extractPostData(notifications[0].xFriendlymail!).refId;
            const secondRefId = extractPostData(notifications[1].xFriendlymail!).refId;
            expect(firstRefId).not.toBe(secondRefId);
        });
    });

    // ── Comment notification: postData in X-friendlymail ──────────────────────

    describe('Comment notification X-friendlymail postData', () => {
        beforeEach(async () => {
            await step1_attachHost();
            await step2_sendHelp();
            await step3_createAccount();
            await step4_inviteFollower();
            await step5_createFirstPost();
            await step6_likePost();
            await step7_commentOnPost();
        });

        it('comment notification has xFriendlymail header', () => {
            expect(findCommentNotification().xFriendlymail).toBeDefined();
        });

        it('comment notification xFriendlymail includes postData', () => {
            const meta = decodeMeta(findCommentNotification().xFriendlymail!);
            expect(meta.postData).toBeDefined();
        });

        it('comment postData contains an id field', () => {
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(typeof postData.id).toBe('string');
            expect((postData.id as string).length).toBeGreaterThan(0);
        });

        it('comment postData contains a refId field', () => {
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(postData.refId).toBeDefined();
        });

        it('comment postData refId matches format: 2-digit year followed by uppercase hex digits', () => {
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(String(postData.refId)).toMatch(/^\d{2}[0-9A-F]+$/);
        });

        it('comment postData refId starts with the 2-digit current year', () => {
            const expectedYear = String(new Date().getFullYear()).slice(-2);
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(String(postData.refId).startsWith(expectedYear)).toBe(true);
        });

        it('comment postData refId for the first comment has hex counter 1', () => {
            const expectedYear = String(new Date().getFullYear()).slice(-2);
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(postData.refId).toBe(`${expectedYear}1`);
        });

        it('comment postData author matches the commenter email', () => {
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(postData.author).toBe(FOLLOWER_EMAIL);
        });

        it('comment postData content matches the original comment body', () => {
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(postData.content).toBe(COMMENT_BODY);
        });

        it('comment postData type is text', () => {
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(postData.type).toBe('text');
        });

        it('comment postData privacy is public', () => {
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(postData.privacy).toBe('public');
        });

        it('comment postData contains an inReplyTo field', () => {
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(postData.inReplyTo).toBeDefined();
        });

        it('comment postData inReplyTo matches the original post message ID', () => {
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(postData.inReplyTo).toBe(FIRST_POST_MESSAGE_ID);
        });

        it('comment postData contains createdAt as a parseable ISO date string', () => {
            const postData = extractPostData(findCommentNotification().xFriendlymail!);
            expect(postData.createdAt).toBeDefined();
            const parsed = new Date(postData.createdAt as string);
            expect(parsed.toString()).not.toBe('Invalid Date');
        });

        // ── Comment round-trip from postData JSON ──────────────────────────────

        describe('Comment round-trip: reconstructed from postData JSON', () => {
            it('reconstructed Comment has matching refId', () => {
                const postData = extractPostData(findCommentNotification().xFriendlymail!);
                const author = new User('Kath L', new EmailAddress(postData.author as string));
                const reconstructed = new Comment(
                    author,
                    postData.content as string,
                    postData.inReplyTo as string,
                    postData.refId as string
                );
                expect(reconstructed.refId).toBe(postData.refId);
            });

            it('reconstructed Comment has matching content', () => {
                const postData = extractPostData(findCommentNotification().xFriendlymail!);
                const author = new User('Kath L', new EmailAddress(postData.author as string));
                const reconstructed = new Comment(
                    author,
                    postData.content as string,
                    postData.inReplyTo as string,
                    postData.refId as string
                );
                expect(reconstructed.content).toBe(COMMENT_BODY);
            });

            it('reconstructed Comment inReplyTo matches the original post message ID', () => {
                const postData = extractPostData(findCommentNotification().xFriendlymail!);
                const author = new User('Kath L', new EmailAddress(postData.author as string));
                const reconstructed = new Comment(
                    author,
                    postData.content as string,
                    postData.inReplyTo as string,
                    postData.refId as string
                );
                expect(reconstructed.inReplyTo).toBe(FIRST_POST_MESSAGE_ID);
            });

            it('reconstructed Comment has matching author email', () => {
                const postData = extractPostData(findCommentNotification().xFriendlymail!);
                const author = new User('Kath L', new EmailAddress(postData.author as string));
                const reconstructed = new Comment(
                    author,
                    postData.content as string,
                    postData.inReplyTo as string,
                    postData.refId as string
                );
                expect(reconstructed.author.email.toString()).toBe(FOLLOWER_EMAIL);
            });

            it('reconstructed Comment type is text', () => {
                const postData = extractPostData(findCommentNotification().xFriendlymail!);
                const author = new User('Kath L', new EmailAddress(postData.author as string));
                const reconstructed = new Comment(
                    author,
                    postData.content as string,
                    postData.inReplyTo as string,
                    postData.refId as string
                );
                expect(reconstructed.type).toBe('text');
            });
        });
    });
});
