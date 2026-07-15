/**
 * SimOutputFidelity.test.ts
 *
 * Three confirmed-bug test suites, each expected to FAIL against current production code.
 *
 * JASON-021 — LocalSimMailProvider.sendDraft() drops the fromName field.
 * JASON-022 — adduser_response templates contain a "Hello, world" placeholder body.
 * JASON-023 — MessageProcessor timestamps are rendered without an explicit timezone.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { LocalSimMailProvider } from '../src/models/LocalSimMailProvider';
import { EmailAddress } from '../src/models/EmailAddress';
import { MessageDraft } from '../src/models/MessageDraft';

import { MessageProcessor } from '../src/MessageProcessor';
import { SimpleMessageWithMessageId } from '../src/models/SimpleMessageWithMessageId';
import { FriendlymailMessageType } from '../src/models/FriendlymailMessageType';

// ─────────────────────────────────────────────────────────────────────────────
// JASON-021 — sendDraft() drops fromName
// ─────────────────────────────────────────────────────────────────────────────
//
// LocalSimMailProvider.sendDraft() constructs SimpleMessageWithMessageId and
// passes `undefined` as the fromName parameter (position 10) even when the
// draft carries a fromName.  The sent message's fromName is therefore always
// undefined and _writeMessage() emits a bare `From: <email>` header.

describe('JASON-021 — sendDraft preserves fromName on the sent message', () => {
    let dataDir: string;

    beforeEach(() => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-jason021-'));
    });

    afterEach(() => {
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    /**
     * FAILS on current code: sendDraft omits draft.fromName when constructing
     * the outbound SimpleMessageWithMessageId, so sent.fromName is undefined.
     */
    it('sendDraft_withFromName_sentMessageFromNameEqualsOriginalFromName', async () => {
        const provider = new LocalSimMailProvider('host@test.com', 'Host User', dataDir);

        const draft = new MessageDraft(
            new EmailAddress('host@test.com'),
            [new EmailAddress('recipient@test.com')],
            'Fm',
            'Hello from daemon',
            {
                html: '<p>Hello from daemon</p>',
                fromName: 'friendlymail',
            }
        );

        expect(draft.fromName).toBe('friendlymail');

        await provider.sendDraft(draft);
        const messages = await provider.getMessages();

        expect(messages.length).toBeGreaterThanOrEqual(1);
        const sent = messages[messages.length - 1];

        // FAILS on current code — sendDraft passes undefined for fromName.
        expect(sent.fromName).toBe('friendlymail');
    });

    /**
     * Baseline: a draft with NO fromName should yield a sent message with
     * fromName undefined.  Expected to PASS (confirms the provider round-trips
     * the undefined case, not that it silently drops all values).
     */
    it('sendDraft_withoutFromName_sentMessageFromNameIsUndefined', async () => {
        const provider = new LocalSimMailProvider('host@test.com', 'Host User', dataDir);

        const draft = new MessageDraft(
            new EmailAddress('host@test.com'),
            [new EmailAddress('recipient@test.com')],
            'Fm',
            'No display name',
            { html: '<p>No display name</p>' }
        );

        expect(draft.fromName).toBeUndefined();

        await provider.sendDraft(draft);
        const messages = await provider.getMessages();
        const sent = messages[messages.length - 1];

        expect(sent.fromName).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// JASON-022 — adduser_response templates contain "Hello, world" placeholder
// ─────────────────────────────────────────────────────────────────────────────
//
// The "Create post" mailto CTA in both the plain-text and HTML templates
// pre-fills the message body with `Hello%2C%20world` (URL-encoded "Hello, world").
// A user must manually delete this placeholder before composing their first post.

describe('JASON-022 — adduser_response templates do not contain Hello world placeholder', () => {
    const TEXT_TEMPLATE = path.resolve(
        __dirname,
        '../src/templates/text/adduser_response.txt'
    );
    const HTML_TEMPLATE = path.resolve(
        __dirname,
        '../src/templates/html/adduser_template.html'
    );

    /**
     * FAILS on current code: adduser_response.txt line 7 contains
     * `Hello%2C%20world` in the Create post mailto link.
     */
    it('adduser_response_txt_doesNotContain_HelloWorldUrlEncoded', () => {
        const content = fs.readFileSync(TEXT_TEMPLATE, 'utf8');
        // FAILS — current template has Hello%2C%20world on line 7
        expect(content).not.toContain('Hello%2C%20world');
    });

    /**
     * FAILS on current code: adduser_template.html line 66 contains
     * `Hello%2C%20world` in the Create post anchor href.
     */
    it('adduser_template_html_doesNotContain_HelloWorldUrlEncoded', () => {
        const content = fs.readFileSync(HTML_TEMPLATE, 'utf8');
        // FAILS — current template has Hello%2C%20world on line 66
        expect(content).not.toContain('Hello%2C%20world');
    });

    /**
     * Belt-and-suspenders: neither template should contain the literal
     * un-encoded form either (in case a future refactor decodes it).
     */
    it('adduser_response_txt_doesNotContain_HelloWorldLiteral', () => {
        const content = fs.readFileSync(TEXT_TEMPLATE, 'utf8');
        expect(content).not.toContain('Hello, world');
    });

    it('adduser_template_html_doesNotContain_HelloWorldLiteral', () => {
        const content = fs.readFileSync(HTML_TEMPLATE, 'utf8');
        expect(content).not.toContain('Hello, world');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// JASON-023 — timestamps rendered without explicit timezone are non-deterministic
// ─────────────────────────────────────────────────────────────────────────────
//
// MessageProcessor.impl.ts builds created_at strings with toLocaleString()
// and NO timeZone option (lines ~682, 912, 1082, 1084).  The displayed time
// therefore depends on the server's local timezone.
//
// Strategy: drive the processor with a post dated 2026-06-17T20:31:00Z.
// Compute the UTC rendering (what a correct implementation must produce) and
// the local rendering (what current code produces) at runtime.  Assert the
// HTML contains the UTC form.  Skip if the machine happens to be UTC (the bug
// is invisible there — both values are identical).
//
// This is machine-independent: on any non-UTC machine the UTC and local strings
// differ, the assertion fails, and the output clearly shows what was found vs
// what was expected.

const POST_DATE_UTC = new Date('2026-06-17T20:31:00Z');

// UTC time string for the fixture date: "8:31 PM"
const EXPECTED_UTC_TIME = POST_DATE_UTC.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
});

// Local (server) time string for the fixture date using the same format
// that current production code uses (no timeZone option).
const SERVER_LOCAL_TIME = POST_DATE_UTC.toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
});

// True when the machine is already UTC — the bug is invisible in that env.
const MACHINE_IS_UTC = (EXPECTED_UTC_TIME === SERVER_LOCAL_TIME);

/**
 * Bootstrap a MessageProcessor in the sequence: adduser → create-post.
 * The create-post message carries a controlled date whose UTC hour (20:31)
 * differs from any non-UTC local time to make the timezone bug visible.
 */
function buildProcessorWithKnownPostDate(): MessageProcessor {
    const hostAddress = new EmailAddress('host@example.com');

    // Step 1: adduser establishes the host account.
    const adduserMsg = new SimpleMessageWithMessageId(
        hostAddress,
        [hostAddress],
        'Fm',
        '$ adduser\n\nHost User',
        new Date()
    );

    // Step 2: create-post with a tightly controlled date.
    const createPostMsg = new SimpleMessageWithMessageId(
        hostAddress,
        [hostAddress],
        'Fm',
        'Timestamp fidelity test post',
        POST_DATE_UTC   // <— the controlled date under test
    );

    return new MessageProcessor(hostAddress, [adduserMsg, createPostMsg], 'cid');
}

/** Extract the NEW_POST_NOTIFICATION draft directed to the host. */
function getPostNotificationDraft(processor: MessageProcessor) {
    return processor.getMessageDrafts().find(
        d => d.messageType === FriendlymailMessageType.NEW_POST_NOTIFICATION
    );
}

describe('JASON-023 — new_post_notification timestamp rendered in UTC', () => {
    let processor: MessageProcessor;

    beforeEach(() => {
        processor = buildProcessorWithKnownPostDate();
    });

    it('produces a NEW_POST_NOTIFICATION draft for the controlled post', () => {
        // Sanity guard — if this fails, the harness is broken, not the bug.
        const draft = getPostNotificationDraft(processor);
        expect(draft).toBeDefined();
    });

    /**
     * FAILS on current code on any non-UTC machine.
     *
     * POST_DATE_UTC is 2026-06-17T20:31:00Z.
     * In UTC that is "8:31 PM".  On this machine (MDT, UTC-6) it renders "2:31 PM".
     *
     * Current code calls toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })
     * with NO timeZone option, so the output is machine-local.  The correct fix
     * adds timeZone: 'UTC' so the output is stable across deployments.
     *
     * The assertion requires the UTC rendering ("8:31 PM").
     * Current code produces the local rendering ("2:31 PM" on MDT), so it fails.
     *
     * The test is skipped when the machine IS UTC (bug invisible — UTC == local).
     */
    it('new_post_notification_html_timestampReflectsUTCTime_not_serverLocalTime', () => {
        if (MACHINE_IS_UTC) {
            // Cannot distinguish correct from incorrect behaviour on a UTC machine.
            // Mark as a known gap rather than a false pass.
            console.warn(
                'JASON-023: skipped — machine timezone is UTC; ' +
                'UTC and local renderings are identical, bug is not detectable.'
            );
            return;
        }

        const draft = getPostNotificationDraft(processor);
        expect(draft).toBeDefined();

        const html = draft!.html ?? '';

        // UTC rendering: "8:31 PM" — what the correct implementation must produce.
        // Local rendering: "2:31 PM" (MDT) — what current code actually puts in the HTML.
        //
        // FAILS on current code: html contains SERVER_LOCAL_TIME, not EXPECTED_UTC_TIME.
        expect(html).toContain(EXPECTED_UTC_TIME);
    });

    /**
     * Complementary: the server-local time must NOT appear once the fix lands.
     * FAILS on current code — the local time IS present in the rendered HTML.
     * Also skipped on UTC machines for the same reason as the primary test.
     */
    it('new_post_notification_html_doesNotContain_serverLocalTime', () => {
        if (MACHINE_IS_UTC) {
            console.warn(
                'JASON-023: skipped — machine timezone is UTC; ' +
                'UTC and local renderings are identical, bug is not detectable.'
            );
            return;
        }

        const draft = getPostNotificationDraft(processor);
        expect(draft).toBeDefined();

        const html = draft!.html ?? '';

        // Current code embeds the server-local time (e.g. "2:31 PM" on MDT).
        // Once fixed to use timeZone: 'UTC', this local string must be absent.
        // FAILS on current code: the local time IS present.
        expect(html).not.toContain(SERVER_LOCAL_TIME);
    });
});
