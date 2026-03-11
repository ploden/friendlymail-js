import { MessageProcessor } from '../src/MessageProcessor';
import { EmailAddress } from '../src/models/EmailAddress';
import { Daemon } from '../src/models/Daemon';
import { TestMessageProvider } from '../src/models/TestMessageProvider';
import { SimpleMessageWithMessageId } from '../src/models/SimpleMessageWithMessageId';
import { ISocialNetwork } from '../src/models/SocialNetwork.interface';

const HOST_EMAIL = 'phil@test.com';

function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getUser: jest.fn(),
        setUser: jest.fn()
    };
}

describe('MessageProcessor Welcome Message X-friendlymail Header', () => {
    // Test that the sent welcome message contains the X-friendlymail header
    it('should include X-friendlymail header in sent welcome message', () => {
        // TODO: Implement test
    });

    // Test that the X-friendlymail header is present after sending the welcome message draft
    it('should have X-friendlymail header after sending welcome message draft', () => {
        // TODO: Implement test
    });

    // Test that the X-friendlymail header contains metadata
    it('should contain metadata in X-friendlymail header', () => {
        // TODO: Implement test
    });

    // Test that the X-friendlymail header metadata is a valid JSON string
    it('should have X-friendlymail header with valid JSON metadata', () => {
        // TODO: Implement test
    });

    // Test that the X-friendlymail header metadata is quoted-printable encoded
    it('should have X-friendlymail header with quoted-printable encoded metadata', () => {
        // TODO: Implement test
    });

    // Test that the X-friendlymail header metadata contains message type information
    it('should contain message type in X-friendlymail header metadata', () => {
        // TODO: Implement test
    });

    // Test that the X-friendlymail header metadata identifies the message as a welcome message
    it('should identify welcome message type in X-friendlymail header metadata', () => {
        // TODO: Implement test
    });

    // Test that the X-friendlymail header is not present in the draft before sending
    it('should not have X-friendlymail header in welcome message draft before sending', () => {
        // TODO: Implement test
    });

    // Test that the X-friendlymail header is only added when the message is sent
    it('should add X-friendlymail header only when welcome message is sent', () => {
        // TODO: Implement test
    });
});

/**
 * Bug: RFC 2047 double-encoding of the X-friendlymail header causes duplicate welcome messages.
 *
 * When nodemailer sends a message via SMTP it wraps the already-QP-encoded
 * X-friendlymail header value in an RFC 2047 encoded-word envelope:
 *
 *   =?UTF-8?Q?=7B=22messageType=22=3A=22welcome=22=7D?=
 *
 * mailparser returns this raw string for custom headers without RFC 2047 decoding.
 * The QP decoder cannot handle the RFC 2047 wrapper, so _welcomeMessageExists()
 * returns false and the daemon creates a duplicate welcome message on every run.
 *
 * MessageStore deduplicates by messageId, keeping the INBOX copy (fetched first,
 * RFC 2047-encoded) and discarding the Sent copy (raw QP, correctly encoded).
 * The result is that _welcomeMessageExists() always sees the RFC 2047-wrapped
 * value and never recognises it as a welcome message.
 */
describe('Bug: RFC 2047 double-encoding of X-friendlymail header causes duplicate welcome', () => {
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

    async function runDaemon(numDrafts = 1): Promise<void> {
        const runPromise = daemon.run();
        await jest.advanceTimersByTimeAsync((numDrafts + 2) * 1000);
        await runPromise;
    }

    it('should not send a duplicate welcome when an existing welcome has an RFC 2047-encoded X-friendlymail header', async () => {
        // Simulate an INBOX copy of a previously-sent welcome message whose
        // X-friendlymail header was wrapped in RFC 2047 by nodemailer during SMTP
        // delivery.  The raw QP value {"messageType":"welcome"} becomes:
        //   =?UTF-8?Q?=7B=22messageType=22=3A=22welcome=22=7D?=
        const rfc2047EncodedXFriendlymail =
            '=?UTF-8?Q?=7B=22messageType=22=3A=22welcome=22=7D?=';

        await provider.loadMessage(new SimpleMessageWithMessageId(
            hostAddress,
            [hostAddress],
            'Welcome to friendlymail!',
            'Welcome body',
            new Date(),
            rfc2047EncodedXFriendlymail,
            undefined,
            'existing-welcome-message-id@friendlymail'
        ));

        await runDaemon(1);

        // The daemon should recognise the existing welcome message and send nothing.
        // Currently this fails: the daemon cannot decode the RFC 2047-wrapped header
        // value, treats the welcome as missing, and sends a duplicate.
        expect(provider.sentMessages).toHaveLength(0);
    });
});
