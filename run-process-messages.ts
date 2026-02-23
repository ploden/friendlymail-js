#!/usr/bin/env node

/**
 * Simulator for friendlymail using the Daemon.
 *
 * Usage:
 *   npm run process -- --host-email <email> --host-name <name> [message-file...]
 *   npm run process -- --host-email phil@test.com --host-name "Phil L"
 *
 * Or with tsx directly:
 *   tsx run-process-messages.ts --host-email <email> --host-name <name> [message-file...]
 *
 * Note: When using npm run, you must use -- to separate npm arguments from script arguments.
 *
 * If no message files are provided, the simulator enters interactive mode.
 * The Daemon is used to process messages and send drafts automatically.
 */

import { Daemon } from './src/models/Daemon';
import { TestMessageProvider } from './src/models/TestMessageProvider';
import { ISocialNetwork } from './src/models/SocialNetwork';
import { Account } from './src/models/Account';
import { EmailAddress } from './src/models/EmailAddress';
import { MessageDraft } from './src/models/MessageDraft';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * Parse command-line arguments
 */
function parseArgs(): { hostEmail: string; hostName: string; messageFiles: string[] } {
    const args = process.argv.slice(2);
    let hostEmail: string | undefined;
    let hostName: string | undefined;
    const messageFiles: string[] = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--host-email' && i + 1 < args.length) {
            hostEmail = args[++i];
        } else if (arg === '--host-name' && i + 1 < args.length) {
            hostName = args[++i];
        } else if (arg.startsWith('--')) {
            console.error(`Error: Unknown option: ${arg}`);
            process.exit(1);
        } else {
            messageFiles.push(arg);
        }
    }

    if (!hostEmail || !hostName) {
        console.error('Usage: npm run process -- --host-email <email> --host-name <name> [message-file...]');
        console.error('  If no message files are provided, enters interactive mode');
        console.error('  Example: npm run process -- --host-email phil@test.com --host-name "Phil L"');
        console.error('\nNote: When using npm run, use -- to separate npm arguments from script arguments.');
        process.exit(1);
    }

    return { hostEmail, hostName, messageFiles };
}

/**
 * Get list of .txt files in the simulator directory
 */
function getTxtFiles(): string[] {
    const simulatorDir = __dirname;
    try {
        const files = fs.readdirSync(simulatorDir);
        return files
            .filter(file => file.endsWith('.txt'))
            .filter(file => {
                const filePath = path.join(simulatorDir, file);
                return fs.statSync(filePath).isFile();
            })
            .sort();
    } catch (error) {
        return [];
    }
}

/**
 * Print numbered list of .txt files
 */
function printTxtFiles(txtFiles: string[]): void {
    if (txtFiles.length === 0) {
        return;
    }
    console.log('\nAvailable .txt files:');
    txtFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file}`);
    });
    console.log('');
}

/**
 * Print a single draft message
 */
function printDraft(draft: MessageDraft, index: number): void {
    console.log(`--- Draft ${index + 1} ---`);
    console.log(`From: ${draft.from?.toString() || '(none)'}`);
    console.log(`To: ${draft.to.map(addr => addr.toString()).join(', ')}`);
    console.log(`Subject: ${draft.subject}`);
    console.log(`Body:`);
    console.log(draft.body);
    if (draft.attachments.length > 0) {
        console.log(`Attachments: ${draft.attachments.join(', ')}`);
    }
    console.log('');
}

/**
 * Print all pending drafts from the daemon's current message processor
 */
function printDrafts(daemon: Daemon): void {
    const drafts = daemon.messageProcessor.getMessageDrafts();

    if (drafts.length === 0) {
        console.log('Drafts: (none)');
    } else {
        console.log(`\nDrafts (${drafts.length}):\n`);
        drafts.forEach((draft, index) => printDraft(draft, index));
    }
}

/**
 * Print sent messages from the provider starting at sentOffset
 */
function printSentMessages(provider: TestMessageProvider, sentOffset: number): void {
    const sentMessages = provider.sentMessages.slice(sentOffset);

    if (sentMessages.length === 0) {
        console.log('Sent: (none)');
    } else {
        console.log(`\nSent (${sentMessages.length}):\n`);
        sentMessages.forEach((message, index) => {
            console.log(`--- Sent ${sentOffset + index + 1} ---`);
            console.log(`From: ${message.from.toString()}`);
            console.log(`To: ${message.to.map(addr => addr.toString()).join(', ')}`);
            console.log(`Subject: ${message.subject}`);
            console.log(`Body:`);
            console.log(message.body);
            if (message.attachments.length > 0) {
                console.log(`Attachments: ${message.attachments.join(', ')}`);
            }
            console.log('');
        });
    }
}

/**
 * Run the daemon and print any messages sent during the run
 */
async function runDaemon(daemon: Daemon, provider: TestMessageProvider): Promise<void> {
    const sentOffset = provider.sentMessages.length;
    await daemon.run();
    printSentMessages(provider, sentOffset);
}

async function main() {
    const { hostEmail, hostName, messageFiles } = parseArgs();

    if (!EmailAddress.isValid(hostEmail)) {
        console.error(`Error: Invalid host email address: ${hostEmail}`);
        process.exit(1);
    }

    const hostEmailAddress = EmailAddress.fromString(hostEmail)!;

    // TestMessageProvider acts as both sender and receiver for the Daemon
    const provider = new TestMessageProvider(hostEmailAddress);

    // Minimal ISocialNetwork implementation; updated by the Daemon as accounts are created
    let _account: Account | null = null;
    const socialNetwork: ISocialNetwork = {
        getAccount: () => _account!,
        setAccount: (account: Account) => { _account = account; }
    };

    const daemon = new Daemon(hostEmailAddress, provider, provider, socialNetwork);

    if (messageFiles.length > 0) {
        // Non-interactive: load files, run the daemon once, show results
        for (const filePath of messageFiles) {
            if (!fs.existsSync(filePath)) {
                console.error(`Warning: File not found: ${filePath}`);
                continue;
            }
            await provider.loadFromFile(filePath);
        }
        await runDaemon(daemon, provider);
    } else {
        // Interactive mode
        // Initial run with empty store; the Daemon creates and sends the welcome message
        await runDaemon(daemon, provider);

        const txtFiles = getTxtFiles();
        printTxtFiles(txtFiles);

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: '> '
        });

        rl.prompt();

        rl.on('line', async (line: string) => {
            const trimmed = line.trim();

            if (trimmed === 'q') {
                rl.close();
                return;
            }

            if (trimmed.startsWith('load ')) {
                const fileArg = trimmed.substring(5).trim();
                if (!fileArg) {
                    console.error('Error: No file path provided. Usage: load <file> or load $N');
                } else {
                    let filePath: string;
                    const numberMatch = fileArg.match(/^\$(\d+)$/);
                    if (numberMatch) {
                        const fileIndex = parseInt(numberMatch[1], 10) - 1;
                        if (fileIndex >= 0 && fileIndex < txtFiles.length) {
                            filePath = path.join(__dirname, txtFiles[fileIndex]);
                        } else {
                            console.error(`Error: Invalid file number. Available files are 1-${txtFiles.length}`);
                            rl.prompt();
                            return;
                        }
                    } else {
                        filePath = fileArg;
                    }

                    if (!fs.existsSync(filePath)) {
                        console.error(`Error: File not found: ${filePath}`);
                    } else {
                        await provider.loadFromFile(filePath);
                        await runDaemon(daemon, provider);
                    }
                }
            } else if (trimmed === 'run' || trimmed.startsWith('send')) {
                // 'run' and 'send' both trigger a daemon cycle
                await runDaemon(daemon, provider);
            } else if (trimmed.startsWith('show ')) {
                const showArg = trimmed.substring(5).trim();
                if (showArg === '--drafts') {
                    printDrafts(daemon);
                } else if (showArg === '--sent') {
                    printSentMessages(provider, 0);
                } else {
                    console.error('Error: Invalid show command. Usage: show --drafts or show --sent');
                }
            } else if (trimmed.length > 0) {
                console.error(`Unknown command: ${trimmed}`);
                console.error('Commands:');
                console.error('  load <file>   - Load a message file and run the daemon');
                console.error('  load $N       - Load file by number from the list above');
                console.error('  run           - Run the daemon (process and send pending messages)');
                console.error('  send          - Alias for run');
                console.error('  show --drafts - List pending draft messages');
                console.error('  show --sent   - List all sent messages');
                console.error('  q             - Quit');
            }

            printTxtFiles(txtFiles);
            rl.prompt();
        });

        rl.on('close', () => {
            process.exit(0);
        });
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
