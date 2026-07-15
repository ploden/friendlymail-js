/**
 * JASON-018: usermod_profile_pic_response.txt plain-text body omits the stored filename.
 *
 * When the host sends `$ usermod --profile-pic` with an image attachment,
 * _createUsermodProfilePicDraft() calls _loadTemplate('text',
 * 'usermod_profile_pic_response.txt', { signature }) — it only passes `signature`
 * as a template variable.  The filename of the stored ProfilePic is never
 * interpolated into the text body.  A text-mode user therefore receives no
 * confirmation of WHICH image was accepted.
 *
 * Requirement: the plain-text body MUST contain the stored profile pic filename.
 */

import { MessageProcessor } from '../src/MessageProcessor';
import { EmailAddress } from '../src/models/EmailAddress';
import { SimpleMessageWithMessageId } from '../src/models/SimpleMessageWithMessageId';
import { FriendlymailMessageType } from '../src/models/FriendlymailMessageType';
import { PhotoAttachment } from '../src/models/PhotoAttachment';

const HOST_EMAIL = 'host@example.com';
const PROFILE_PIC_FILENAME = 'linus.jpeg';

/** Minimal 1×1 JPEG bytes (valid JPEG marker sequence). */
const MINIMAL_JPEG = Buffer.from(
    'ffd8ffe000104a46494600010100000100010000ffdb004300' +
    '08060606070605080707070909080a0c140d0c0b0b0c191213' +
    '0f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30' +
    '3134343434141a3936383332393328333434320ffd9',
    'hex'
);

/** Build a PhotoAttachment with the known filename. */
function makeProfilePicAttachment(): PhotoAttachment {
    return {
        filename: PROFILE_PIC_FILENAME,
        data: MINIMAL_JPEG,
        contentType: 'image/jpeg',
    };
}

/**
 * Bootstrap a MessageProcessor that already has a host account, then feed it
 * a `$ usermod --profile-pic` message carrying the photo attachment.
 *
 * The processor constructor processes all receivedMessages in order, so we
 * pass [adduser, usermod] in a single constructor call.  The adduser message
 * creates the host account; the usermod message then stores the pic and
 * generates the confirmation draft.
 */
function buildProcessorWithUsermod(): MessageProcessor {
    const hostAddress = new EmailAddress(HOST_EMAIL);

    // Message 1: host creates their account via `$ adduser`.
    const adduserMsg = new SimpleMessageWithMessageId(
        hostAddress,
        [hostAddress],
        'Fm',
        '$ adduser\n\nHost User',
        new Date()
    );

    // Message 2: host sends `$ usermod --profile-pic` with a photo attachment.
    const usermodMsg = new SimpleMessageWithMessageId(
        hostAddress,
        [hostAddress],
        'Fm',
        '$ usermod --profile-pic',
        new Date(),
        undefined,   // xFriendlymail
        undefined,   // html
        undefined,   // messageId (auto-generated)
        makeProfilePicAttachment()  // photoAttachment
    );

    return new MessageProcessor(hostAddress, [adduserMsg, usermodMsg]);
}

describe('JASON-018: usermod --profile-pic confirmation includes stored filename', () => {
    let processor: MessageProcessor;

    beforeEach(() => {
        processor = buildProcessorWithUsermod();
    });

    it('produces a USERMOD_RESPONSE draft', () => {
        const drafts = processor.getMessageDrafts();
        const usermodDraft = drafts.find(
            d => d.messageType === FriendlymailMessageType.USERMOD_RESPONSE
        );
        // Sanity check: a response draft must exist before we can inspect its body.
        expect(usermodDraft).toBeDefined();
    });

    /**
     * FAILING TEST — exposes JASON-018.
     *
     * The plain-text body passes only `signature` to _loadTemplate(), so
     * `{{ filename }}` (or any filename interpolation) is never present in
     * usermod_profile_pic_response.txt.  The filename 'linus.jpeg' will not
     * appear in the body until both the template and the draft builder are fixed.
     */
    it('plain-text body of USERMOD_RESPONSE contains the stored profile pic filename', () => {
        const drafts = processor.getMessageDrafts();
        const usermodDraft = drafts.find(
            d => d.messageType === FriendlymailMessageType.USERMOD_RESPONSE
        );

        // Guard: if no draft exists the test fails with a clear message.
        expect(usermodDraft).toBeDefined();

        // The critical assertion: the filename must appear in the plain-text body.
        // This FAILS on current code because _createUsermodProfilePicDraft() does
        // not pass `filename` to _loadTemplate() and the template contains no
        // {{ filename }} placeholder.
        expect(usermodDraft!.body).toContain(PROFILE_PIC_FILENAME);
    });
});
