/**
 * Scenario: The host sends an invite command to a non-host address
 *
 * Covers the happy path where a host with an existing account issues
 * "$ invite <email>". Two messages must be sent: a confirmation reply
 * to the host and an invitation message to the invitee.
 *
 * Background setup helpers (not explicit scenario steps):
 *   - setup_attachHost: runs the daemon for the first time to send the welcome message
 *   - setup_createAccount: sends an adduser command to create the host account
 */

import * as fs from 'fs';
import * as path from 'path';
import { Daemon } from '../../../src/models/Daemon';
import { TestMessageProvider } from '../../../src/models/TestMessageProvider';
import { EmailAddress } from '../../../src/models/EmailAddress';
import { ISimpleMessage } from '../../../src/models/SimpleMessage';
import { SimpleMessageWithMessageId } from '../../../src/models/SimpleMessageWithMessageId';
import { FriendlymailMessageType } from '../../../src/models/FriendlymailMessageType';
import { ISocialNetwork } from '../../../src/models/SocialNetwork';

const HOST_EMAIL = 'phil@test.com';
const INVITEE_EMAIL = 'kath@test.com';

function makeSocialNetwork(): jest.Mocked<ISocialNetwork> {
    return {
        getUser: jest.fn(),
        setUser: jest.fn()
    };
}

describe('Scenario: The host sends an invite command to a non-host address', () => {
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

    /**
     * Run one daemon cycle. Each cycle =
     *   getMessages (1s) + numDrafts × sendDraft (1s each) + getMessages (1s).
     */
    async function runDaemon(numDrafts = 1): Promise<void> {
        const runPromise = daemon.run();
        await jest.advanceTimersByTimeAsync((numDrafts + 2) * 1000);
        await runPromise;
    }

    // ── Message factories ──────────────────────────────────────────────────────

    function hostAdduserCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(hostAddress, [hostAddress], 'Fm', '$ adduser');
    }

    function hostInviteCommand(): SimpleMessageWithMessageId {
        return new SimpleMessageWithMessageId(
            hostAddress, [hostAddress], 'Fm',
            `$ invite ${INVITEE_EMAIL}`
        );
    }

    // ── Background setup helpers ───────────────────────────────────────────────

    async function setup_attachHost(): Promise<void> {
        await runDaemon(1); // sends welcome → sentMessages: 1
    }

    async function setup_createAccount(): Promise<void> {
        await provider.loadMessage(hostAdduserCommand());
        await runDaemon(1); // sends adduser reply → sentMessages: 2
    }

    // ── Scenario step ──────────────────────────────────────────────────────────

    async function step_hostSendsInvite(): Promise<void> {
        await provider.loadMessage(hostInviteCommand());
        await runDaemon(2); // sends: invite confirmation to host + invite to invitee → sentMessages: 4
    }

    // ── Tests ──────────────────────────────────────────────────────────────────

    describe('Step: The host sends an invite command after account exists', () => {
        beforeEach(async () => {
            await setup_attachHost();
            await setup_createAccount();
            await step_hostSendsInvite();
        });

        it('should send exactly four messages total', () => {
            expect(provider.sentMessages).toHaveLength(4);
        });

        describe('invite confirmation reply (sent to host)', () => {
            let confirmationMsg: SimpleMessageWithMessageId;

            beforeEach(() => {
                // The confirmation is the message addressed to the host with INVITE type
                confirmationMsg = provider.sentMessages.find((m: SimpleMessageWithMessageId) =>
                    m.to.some((a: EmailAddress) => a.toString() === HOST_EMAIL) &&
                    m.xFriendlymail?.includes(FriendlymailMessageType.INVITE)
                )!;
            });

            it('should send an invite confirmation to the host', () => {
                expect(confirmationMsg).toBeDefined();
            });

            it('should send the confirmation from the host address', () => {
                expect(confirmationMsg.from.toString()).toBe(HOST_EMAIL);
            });

            it('should send the confirmation with fromName "friendlymail"', () => {
                expect((confirmationMsg as ISimpleMessage).fromName).toBe('friendlymail');
            });

            it('should set the X-friendlymail header to the invite type', () => {
                expect(confirmationMsg.xFriendlymail).toContain(FriendlymailMessageType.INVITE);
            });

            it('should include "Invitation sent" in the confirmation body', () => {
                expect(confirmationMsg.body).toContain('Invitation sent');
            });

            it('should include the invitee address in the confirmation body', () => {
                expect(confirmationMsg.body).toContain(INVITEE_EMAIL);
            });

            it('should include the signature in the confirmation body', () => {
                expect(confirmationMsg.body)
                    .toContain('friendlymail, an open-source, email-based, alternative social network');
            });
        });

        describe('invite message (sent to invitee)', () => {
            let inviteMsg: SimpleMessageWithMessageId;

            beforeEach(() => {
                // The invite message is the message addressed to the invitee
                inviteMsg = provider.sentMessages.find((m: SimpleMessageWithMessageId) =>
                    m.to.some((a: EmailAddress) => a.toString() === INVITEE_EMAIL)
                )!;
            });

            it('should send an invite message to the invitee', () => {
                expect(inviteMsg).toBeDefined();
            });

            it('should send the invite message from the host address', () => {
                expect(inviteMsg.from.toString()).toBe(HOST_EMAIL);
            });

            it('should include a follow link in the invite body', () => {
                expect(inviteMsg.body).toContain(`mailto:${HOST_EMAIL}`);
                expect(inviteMsg.body).toContain('follow');
            });

            it('should include the signature in the invite body', () => {
                expect(inviteMsg.body)
                    .toContain('friendlymail, an open-source, email-based, alternative social network');
            });
        });
    });

    // ── Output: write sent message files ───────────────────────────────────────

    afterAll(async () => {
        jest.useFakeTimers();

        const localHost = new EmailAddress(HOST_EMAIL);
        const localProvider = new TestMessageProvider(localHost);
        const localDaemon = new Daemon(localHost, localProvider, localProvider, makeSocialNetwork());

        async function localRun(numDrafts = 1): Promise<void> {
            const p = localDaemon.run();
            await jest.advanceTimersByTimeAsync((numDrafts + 2) * 1000);
            await p;
        }

        function formatMessage(message: SimpleMessageWithMessageId): string {
            const lines: string[] = [];
            const msg = message as ISimpleMessage;
            if (msg.fromName) {
                lines.push(`From: ${msg.fromName} <${message.from.toString()}>`);
            } else {
                lines.push(`From: ${message.from.toString()}`);
            }
            lines.push(`To: ${message.to.map((a: EmailAddress) => a.toString()).join(', ')}`);
            lines.push(`Subject: ${message.subject}`);
            lines.push(`Date: ${message.date.toUTCString()}`);
            if (message.xFriendlymail !== undefined) {
                lines.push(`X-friendlymail: ${message.xFriendlymail}`);
            }
            lines.push('');
            lines.push(message.body);
            return lines.join('\n');
        }

        // setup_attachHost
        await localRun(1);
        // setup_createAccount
        await localProvider.loadMessage(new SimpleMessageWithMessageId(localHost, [localHost], 'Fm', '$ adduser'));
        await localRun(1);
        // step: host sends invite
        await localProvider.loadMessage(new SimpleMessageWithMessageId(localHost, [localHost], 'Fm', `$ invite ${INVITEE_EMAIL}`));
        await localRun(2);

        jest.useRealTimers();

        const sentDir = path.join(__dirname, 'sent');
        fs.mkdirSync(sentDir, { recursive: true });

        localProvider.sentMessages.forEach((message: SimpleMessageWithMessageId, index: number) => {
            fs.writeFileSync(path.join(sentDir, `${index + 1}.txt`), formatMessage(message));
            if (message.html) {
                fs.writeFileSync(path.join(sentDir, `${index + 1}.html`), message.html);
            }
        });
    });
});
