/**
 * JASON-019: new_post_notification HTML emits BOTH avatar elements when a profile
 * pic is set.
 *
 * The template `post_notification_microblog.html` always renders both:
 *   1. an <img src="cid:profile_pic"> (the real profile pic), and
 *   2. a fallback letter-avatar <table> containing the host initial.
 *
 * Visibility is toggled with inline `display:` styles driven by
 * `profile_pic_img_display` / `profile_pic_initial_display`.  Many email
 * clients (notably Outlook) do NOT honour `display:none` on <table> elements,
 * so the letter avatar renders alongside the real pic.
 *
 * Correct behaviour: only ONE avatar element must appear in the HTML.
 *   - Profile pic set   → <img> present, letter-avatar table ABSENT.
 *   - No profile pic    → letter-avatar table present, <img> absent (or empty src).
 *
 * Fallback-avatar anchor used in assertions:
 *   `line-height:40px` — appears exclusively in the host-avatar fallback <span>
 *   inside the letter-avatar <table> (line 33 of the template).  The comment
 *   avatar uses `line-height:28px`; no other element in the template uses 40px.
 *
 * Scenario A FAILS on current code: the fallback markup is still present in
 * the rendered HTML even when a profile pic is set (with `display:none` on the
 * wrapping table instead of being omitted).
 */

import { MessageProcessor } from '../src/MessageProcessor';
import { EmailAddress } from '../src/models/EmailAddress';
import { SimpleMessageWithMessageId } from '../src/models/SimpleMessageWithMessageId';
import { FriendlymailMessageType } from '../src/models/FriendlymailMessageType';
import { PhotoAttachment } from '../src/models/PhotoAttachment';

const HOST_EMAIL = 'host@example.com';
const HOST_DISPLAY_NAME = 'Host User';

/** Minimal 1×1 JPEG (valid JPEG marker sequence). */
const MINIMAL_JPEG = Buffer.from(
    'ffd8ffe000104a46494600010100000100010000ffdb004300' +
    '08060606070605080707070909080a0c140d0c0b0b0c191213' +
    '0f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30' +
    '3134343434141a3936383332393328333434320ffd9',
    'hex'
);

/** Substring present in the fallback letter-avatar <span> — unique to that element. */
const FALLBACK_AVATAR_ANCHOR = 'line-height:40px';

function makeProfilePicAttachment(): PhotoAttachment {
    return {
        filename: 'avatar.jpeg',
        data: MINIMAL_JPEG,
        contentType: 'image/jpeg',
    };
}

function makeHostAddress(): EmailAddress {
    return new EmailAddress(HOST_EMAIL);
}

/**
 * Build a MessageProcessor in the state: adduser → usermod --profile-pic →
 * create post.  Mirrors the real `adduser_set_profile_pic.sim` flow.
 *
 * photoEmbedMode is set to 'cid' so the profile pic src is the stable string
 * `cid:profile_pic` rather than a base64 blob.
 */
function buildProcessorWithProfilePicAndPost(): MessageProcessor {
    const hostAddress = makeHostAddress();

    // Step 1: host creates their account.
    const adduserMsg = new SimpleMessageWithMessageId(
        hostAddress,
        [hostAddress],
        'Fm',
        '$ adduser\n\nHost User',
        new Date()
    );

    // Step 2: host sets a profile pic via usermod.
    const usermodMsg = new SimpleMessageWithMessageId(
        hostAddress,
        [hostAddress],
        'Fm',
        '$ usermod --profile-pic',
        new Date(),
        undefined,  // xFriendlymail
        undefined,  // html
        undefined,  // messageId
        makeProfilePicAttachment()
    );

    // Step 3: host creates a post — triggers NEW_POST_NOTIFICATION drafts.
    const createPostMsg = new SimpleMessageWithMessageId(
        hostAddress,
        [hostAddress],
        'Fm',
        'Hello, notification world',
        new Date()
    );

    return new MessageProcessor(hostAddress, [adduserMsg, usermodMsg, createPostMsg], 'cid');
}

/**
 * Build a MessageProcessor in the state: adduser → create post (no profile pic).
 */
function buildProcessorWithoutProfilePicAndPost(): MessageProcessor {
    const hostAddress = makeHostAddress();

    const adduserMsg = new SimpleMessageWithMessageId(
        hostAddress,
        [hostAddress],
        'Fm',
        '$ adduser\n\nHost User',
        new Date()
    );

    const createPostMsg = new SimpleMessageWithMessageId(
        hostAddress,
        [hostAddress],
        'Fm',
        'Hello, notification world',
        new Date()
    );

    return new MessageProcessor(hostAddress, [adduserMsg, createPostMsg], 'cid');
}

/** Extract the NEW_POST_NOTIFICATION draft directed to the host. */
function getPostNotificationDraft(processor: MessageProcessor) {
    return processor.getMessageDrafts().find(
        d => d.messageType === FriendlymailMessageType.NEW_POST_NOTIFICATION
    );
}

// ── Scenario A: host HAS a profile pic ────────────────────────────────────────

describe('JASON-019 Scenario A — host has a profile pic', () => {
    let processor: MessageProcessor;

    beforeEach(() => {
        processor = buildProcessorWithProfilePicAndPost();
    });

    it('produces a NEW_POST_NOTIFICATION draft', () => {
        const draft = getPostNotificationDraft(processor);
        expect(draft).toBeDefined();
    });

    it('HTML contains the profile-pic <img> (cid:profile_pic)', () => {
        const draft = getPostNotificationDraft(processor);
        expect(draft).toBeDefined();
        expect(draft!.html).toContain('cid:profile_pic');
    });

    /**
     * FAILING TEST — exposes JASON-019.
     *
     * When a profile pic is set, the fallback letter-avatar table must be
     * ABSENT from the rendered HTML.  The current implementation emits it
     * with `display:none`, which is ignored by many email clients (Outlook).
     *
     * The assertion will fail because `line-height:40px` (the unique style
     * attribute of the fallback avatar span) IS present in the HTML — inside
     * the table that should have been omitted entirely.
     */
    it('HTML does NOT contain the fallback letter-avatar when a profile pic is set', () => {
        const draft = getPostNotificationDraft(processor);
        expect(draft).toBeDefined();

        // This assertion FAILS on current code: the fallback avatar markup
        // (identified by its unique `line-height:40px` style) is still
        // present in the rendered HTML, only hidden with `display:none`.
        expect(draft!.html).not.toContain(FALLBACK_AVATAR_ANCHOR);
    });
});

// ── Scenario B: host has NO profile pic ───────────────────────────────────────

describe('JASON-019 Scenario B — host has no profile pic', () => {
    let processor: MessageProcessor;

    beforeEach(() => {
        processor = buildProcessorWithoutProfilePicAndPost();
    });

    it('produces a NEW_POST_NOTIFICATION draft', () => {
        const draft = getPostNotificationDraft(processor);
        expect(draft).toBeDefined();
    });

    it('HTML contains the fallback letter-avatar when no profile pic is set', () => {
        const draft = getPostNotificationDraft(processor);
        expect(draft).toBeDefined();
        // The fallback avatar span (line-height:40px) must be present.
        expect(draft!.html).toContain(FALLBACK_AVATAR_ANCHOR);
    });

    it('HTML does NOT contain an active profile-pic <img> when no pic is set', () => {
        const draft = getPostNotificationDraft(processor);
        expect(draft).toBeDefined();
        // With no profile pic, `cid:profile_pic` must not appear in the HTML.
        // (The img src is left empty / absent; only the fallback table renders.)
        expect(draft!.html).not.toContain('cid:profile_pic');
    });
});
