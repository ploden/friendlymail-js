import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { TestMessageProvider } from '../src/models/TestMessageProvider';
import { EmailAddress } from '../src/models/EmailAddress';
import { MessageDraft } from '../src/models/MessageDraft';

const HOST_EMAIL = 'phil@test.com';
const HOST_NAME = 'Phil L';
const hostAddress = new EmailAddress(HOST_EMAIL);

/**
 * Helper: build a ready-to-send MessageDraft (from, to, subject, and body all set)
 */
function makeReadyDraft(): MessageDraft {
    return new MessageDraft(
        hostAddress,
        [new EmailAddress('kath@test.com')],
        'Test Subject',
        'Test body'
    );
}

/**
 * Helper: build an incomplete MessageDraft (from is null, so isReadyToSend() returns false)
 */
function makeUnreadyDraft(): MessageDraft {
    return new MessageDraft(null, [], '', '');
}

describe('TestMessageProvider', () => {
    describe('hostAddress', () => {
        it('should return the host address provided at construction', () => {
            const provider = new TestMessageProvider(hostAddress);
            expect(provider.hostAddress.equals(hostAddress)).toBe(true);
        });

        it('should reflect the address used at construction when a different address is given', () => {
            const other = new EmailAddress('other@test.com');
            const provider = new TestMessageProvider(other);
            expect(provider.hostAddress.equals(other)).toBe(true);
        });
    });

    describe('getMessages (IMessageReceiver)', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should return an array', async () => {
            const provider = new TestMessageProvider(hostAddress);
            const promise = provider.getMessages();
            await jest.advanceTimersByTimeAsync(1000);
            const messages = await promise;
            expect(Array.isArray(messages)).toBe(true);
        });

        it('should not resolve before 1 second has elapsed', async () => {
            const provider = new TestMessageProvider(hostAddress);
            let resolved = false;
            provider.getMessages().then(() => { resolved = true; });

            await jest.advanceTimersByTimeAsync(999);
            expect(resolved).toBe(false);
        });

        it('should resolve after 1 second has elapsed', async () => {
            const provider = new TestMessageProvider(hostAddress);
            let resolved = false;
            provider.getMessages().then(() => { resolved = true; });

            await jest.advanceTimersByTimeAsync(1000);
            expect(resolved).toBe(true);
        });

        it('should not return a message on subsequent calls after it has been returned once', async () => {
            const provider = new TestMessageProvider(hostAddress);
            const filePath = path.join(__dirname, 'test_data', 'create_command_help.txt');
            await provider.loadFromFile(filePath);

            const p1 = provider.getMessages();
            await jest.advanceTimersByTimeAsync(1000);
            const first = await p1;
            expect(first.length).toBe(1);

            const p2 = provider.getMessages();
            await jest.advanceTimersByTimeAsync(1000);
            const second = await p2;
            expect(second.length).toBe(0);
        });
    });

    describe('sendDraft (IMessageSender)', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should not resolve before 1 second has elapsed', async () => {
            const provider = new TestMessageProvider(hostAddress);
            let resolved = false;
            provider.sendDraft(makeReadyDraft()).then(() => { resolved = true; }).catch(() => {});

            await jest.advanceTimersByTimeAsync(999);
            expect(resolved).toBe(false);
        });

        it('should resolve after 1 second has elapsed for a ready draft', async () => {
            const provider = new TestMessageProvider(hostAddress);
            let resolved = false;
            provider.sendDraft(makeReadyDraft()).then(() => { resolved = true; });

            await jest.advanceTimersByTimeAsync(1000);
            expect(resolved).toBe(true);
        });

        it('should resolve without throwing for a ready draft', async () => {
            const provider = new TestMessageProvider(hostAddress);
            const promise = provider.sendDraft(makeReadyDraft());
            await jest.advanceTimersByTimeAsync(1000);
            await expect(promise).resolves.toBeUndefined();
        });

        it('should reject for an unready draft', async () => {
            const provider = new TestMessageProvider(hostAddress);
            const promise = provider.sendDraft(makeUnreadyDraft());
            // Attach handler before advancing to prevent unhandled rejection
            const assertion = expect(promise).rejects.toThrow();
            await jest.advanceTimersByTimeAsync(1000);
            await assertion;
        });
    });

    describe('loadFromFile (ITestMessageProvider)', () => {
        it('should make a loaded message available via getMessages', async () => {
            jest.useFakeTimers();
            const provider = new TestMessageProvider(hostAddress);
            const filePath = path.join(__dirname, 'test_data', 'create_command_help.txt');

            await provider.loadFromFile(filePath);

            const promise = provider.getMessages();
            await jest.advanceTimersByTimeAsync(1000);
            const messages = await promise;
            jest.useRealTimers();

            expect(messages.length).toBe(1);
        });

        it('should accumulate messages across multiple loadFromFile calls', async () => {
            jest.useFakeTimers();
            const provider = new TestMessageProvider(hostAddress);
            const filePath = path.join(__dirname, 'test_data', 'create_command_help.txt');

            await provider.loadFromFile(filePath);
            await provider.loadFromFile(filePath);

            const promise = provider.getMessages();
            await jest.advanceTimersByTimeAsync(1000);
            const messages = await promise;
            jest.useRealTimers();

            expect(messages.length).toBe(2);
        });

        it('should replace <host_address> placeholder with the host email address', async () => {
            jest.useFakeTimers();
            const provider = new TestMessageProvider(hostAddress);

            const tempPath = path.join(os.tmpdir(), `fm-test-${Date.now()}.txt`);
            const fixture = [
                `From: ${HOST_NAME} <${HOST_EMAIL}>`,
                'Subject: Fm',
                `To: ${HOST_NAME} <<host_address>>`,
                '',
                '$ help',
                ''
            ].join('\n');
            fs.writeFileSync(tempPath, fixture, 'utf8');

            try {
                await provider.loadFromFile(tempPath);

                const promise = provider.getMessages();
                await jest.advanceTimersByTimeAsync(1000);
                const messages = await promise;
                jest.useRealTimers();

                expect(messages.length).toBe(1);
                const toAddresses = messages[0].to.map(a => a.toString());
                expect(toAddresses).toContain(HOST_EMAIL);
            } finally {
                fs.unlinkSync(tempPath);
            }
        });
    });
});
