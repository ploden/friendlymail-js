import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LocalSimMailProvider } from '../src/models/LocalSimMailProvider';
import { EmailAddress } from '../src/models/EmailAddress';
import { MessageDraft } from '../src/models/MessageDraft';
import { PhotoAttachment } from '../src/models/PhotoAttachment';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'fm-local-sim-test-'));
}

function makeProvider(dataDir: string): LocalSimMailProvider {
    return new LocalSimMailProvider('host@test.com', 'Host User', dataDir);
}

/** Minimal PhotoAttachment with distinct byte content so equality checks are unambiguous. */
function makePhotoAttachment(tag: string): PhotoAttachment {
    return {
        filename: `${tag}.jpg`,
        data: Buffer.from(`fake-image-bytes-${tag}`),
        contentType: 'image/jpeg',
    };
}

/**
 * Build a ready-to-send draft with the given optional attachments.
 * `isReadyToSend()` requires non-null from, non-empty to, subject, and body.
 */
function makeReadyDraft(options: {
    photoAttachment?: PhotoAttachment;
    profilePicAttachment?: PhotoAttachment;
} = {}): MessageDraft {
    return new MessageDraft(
        new EmailAddress('host@test.com'),
        [new EmailAddress('recipient@test.com')],
        'Test Subject',
        'Test body',
        {
            html: '<p>Test body</p>',
            photoAttachment: options.photoAttachment,
            profilePicAttachment: options.profilePicAttachment,
        }
    );
}

// ── JASON-017: sendDraft() drops photoAttachment ──────────────────────────────
// sendDraft() constructs SimpleMessageWithMessageId without forwarding
// draft.photoAttachment. The sent message returned by getMessages() therefore
// has photoAttachment === undefined regardless of what the draft carried.

describe('LocalSimMailProvider.sendDraft – JASON-017 attachment preservation', () => {
    let dataDir: string;

    beforeEach(() => {
        dataDir = makeTempDir();
    });

    afterEach(() => {
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    // ── photoAttachment (post_photo cid) ─────────────────────────────────────

    describe('photoAttachment (post_photo)', () => {
        it('sendDraft_withPhotoAttachment_sentMessagePreservesPhotoAttachmentFilename', async () => {
            // Bug: sendDraft constructs SimpleMessageWithMessageId without passing
            // draft.photoAttachment, so the field is always undefined on the sent message.
            const provider = makeProvider(dataDir);
            const photo = makePhotoAttachment('post_photo');
            const draft = makeReadyDraft({ photoAttachment: photo });

            await provider.sendDraft(draft);
            const messages = await provider.getMessages();

            expect(messages.length).toBeGreaterThanOrEqual(1);
            const sent = messages[messages.length - 1]; // most recent sent message
            // SHOULD FAIL against current code: photoAttachment is not threaded through
            expect(sent.photoAttachment).toBeDefined();
            expect(sent.photoAttachment!.filename).toBe(photo.filename);
        });

        it('sendDraft_withPhotoAttachment_sentMessagePreservesPhotoAttachmentData', async () => {
            // Bug: the raw image bytes are silently discarded by sendDraft.
            const provider = makeProvider(dataDir);
            const photo = makePhotoAttachment('post_photo_data');
            const draft = makeReadyDraft({ photoAttachment: photo });

            await provider.sendDraft(draft);
            const messages = await provider.getMessages();

            const sent = messages[messages.length - 1];
            // SHOULD FAIL against current code
            expect(sent.photoAttachment).toBeDefined();
            expect(sent.photoAttachment!.data).toEqual(photo.data);
        });

        it('sendDraft_withPhotoAttachment_sentMessagePreservesContentType', async () => {
            const provider = makeProvider(dataDir);
            const photo = makePhotoAttachment('post_photo_ct');
            const draft = makeReadyDraft({ photoAttachment: photo });

            await provider.sendDraft(draft);
            const messages = await provider.getMessages();

            const sent = messages[messages.length - 1];
            // SHOULD FAIL against current code
            expect(sent.photoAttachment).toBeDefined();
            expect(sent.photoAttachment!.contentType).toBe(photo.contentType);
        });

        it('sendDraft_withoutPhotoAttachment_sentMessageHasNoPhotoAttachment', async () => {
            // Baseline: no attachment on the draft → none on the sent message.
            // Expected to PASS (this is the degenerate happy-path; the bug only fires
            // when an attachment IS present and should be preserved).
            const provider = makeProvider(dataDir);
            const draft = makeReadyDraft();

            await provider.sendDraft(draft);
            const messages = await provider.getMessages();

            const sent = messages[messages.length - 1];
            expect(sent.photoAttachment).toBeUndefined();
        });
    });

    // ── profilePicAttachment (profile_pic cid) ───────────────────────────────

    describe('profilePicAttachment (profile_pic)', () => {
        it('sendDraft_withProfilePicAttachment_sentMessagePreservesProfilePicAttachmentFilename', async () => {
            // Bug: profilePicAttachment has NO field on SimpleMessageWithMessageId at all.
            // Even if sendDraft were fixed to pass photoAttachment, profilePicAttachment
            // would still need a separate field threaded through.
            // Cast to `any` to probe whether the field survives at all.
            const provider = makeProvider(dataDir);
            const profilePic = makePhotoAttachment('profile_pic');
            const draft = makeReadyDraft({ profilePicAttachment: profilePic });

            await provider.sendDraft(draft);
            const messages = await provider.getMessages();

            const sent = messages[messages.length - 1];
            // SHOULD FAIL against current code: no profilePicAttachment field exists on the message
            const sentAny = sent as any;
            expect(sentAny.profilePicAttachment).toBeDefined();
            expect(sentAny.profilePicAttachment.filename).toBe(profilePic.filename);
        });

        it('sendDraft_withProfilePicAttachment_sentMessagePreservesProfilePicAttachmentData', async () => {
            // Bug: profilePicAttachment bytes are completely unreachable after sendDraft.
            const provider = makeProvider(dataDir);
            const profilePic = makePhotoAttachment('profile_pic_data');
            const draft = makeReadyDraft({ profilePicAttachment: profilePic });

            await provider.sendDraft(draft);
            const messages = await provider.getMessages();

            const sent = messages[messages.length - 1];
            // SHOULD FAIL against current code
            const sentAny = sent as any;
            expect(sentAny.profilePicAttachment).toBeDefined();
            expect(sentAny.profilePicAttachment.data).toEqual(profilePic.data);
        });

        it('sendDraft_withBothAttachments_sentMessagePreservesBoth', async () => {
            // Bug: both attachment types are dropped simultaneously.
            // This test captures the full combined failure that breaks cid: references
            // in sent HTML (cid:post_photo AND cid:profile_pic both unresolvable).
            const provider = makeProvider(dataDir);
            const photo = makePhotoAttachment('post_photo_combined');
            const profilePic = makePhotoAttachment('profile_pic_combined');
            const draft = makeReadyDraft({ photoAttachment: photo, profilePicAttachment: profilePic });

            await provider.sendDraft(draft);
            const messages = await provider.getMessages();

            const sent = messages[messages.length - 1];
            const sentAny = sent as any;

            // SHOULD FAIL against current code for both assertions
            expect(sent.photoAttachment).toBeDefined();
            expect(sent.photoAttachment!.filename).toBe(photo.filename);

            expect(sentAny.profilePicAttachment).toBeDefined();
            expect(sentAny.profilePicAttachment.filename).toBe(profilePic.filename);
        });
    });
});
