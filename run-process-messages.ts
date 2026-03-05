#!/usr/bin/env node

/**
 * Simulator for friendlymail using the Daemon.
 *
 * Usage:
 *   npm run process -- --host-email <email> --host-name <name> [options] [message-file...]
 *   npm run process -- --host-email phil@test.com --host-name "Phil L"
 *   npm run process -- --host-email phil@test.com --host-name "Phil L" --base-dir sim_messages
 *
 * Options:
 *   --base-dir <dir>  Load all .txt files from this directory and subdirectories
 *
 * Or with tsx directly:
 *   tsx run-process-messages.ts --host-email <email> --host-name <name> [options] [message-file...]
 *
 * Note: When using npm run, you must use -- to separate npm arguments from script arguments.
 *
 * If no message files are provided, the simulator enters interactive mode.
 * The Daemon is used to process messages and send drafts automatically.
 */

import { Daemon } from './src/models/Daemon';
import { SimMessageProvider } from './src/models/SimMessageProvider';
import { ISocialNetwork } from './src/models/SocialNetwork';
import { User } from './src/models/User';
import { EmailAddress } from './src/models/EmailAddress';
import { MessageDraft } from './src/models/MessageDraft';
import { SimpleMessageWithMessageId } from './src/models/SimpleMessageWithMessageId';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { decodeQuotedPrintable } from './src/utils/quotedPrintable';

const SIMULATOR_SENT_DIR = path.join(__dirname, 'simulator', 'sent');
const SIMULATOR_RECEIVED_DIR = path.join(__dirname, 'simulator', 'received');

/**
 * Parse command-line arguments.
 */
function parseArgs(): { hostEmail: string; hostName: string; messageFiles: string[]; baseDir: string | undefined } {
    const args = process.argv.slice(2);
    let hostEmail: string | undefined;
    let hostName: string | undefined;
    let baseDir: string | undefined;
    const messageFiles: string[] = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--host-email' && i + 1 < args.length) {
            hostEmail = args[++i];
        } else if (arg === '--host-name' && i + 1 < args.length) {
            hostName = args[++i];
        } else if (arg === '--base-dir' && i + 1 < args.length) {
            baseDir = args[++i];
        } else if (arg.startsWith('--')) {
            console.error(`Error: Unknown option: ${arg}`);
            process.exit(1);
        } else {
            messageFiles.push(arg);
        }
    }

    if (!hostEmail || !hostName) {
        console.error('Usage: npm run process -- --host-email <email> --host-name <name> [options] [message-file...]');
        console.error('  If no message files are provided, enters interactive mode');
        console.error('  Options:');
        console.error('    --base-dir <dir>  Load .txt files from this directory and subdirectories');
        console.error('  Example: npm run process -- --host-email phil@test.com --host-name "Phil L"');
        console.error('\nNote: When using npm run, use -- to separate npm arguments from script arguments.');
        process.exit(1);
    }

    return { hostEmail, hostName, messageFiles, baseDir };
}

/**
 * Recursively collect all .txt file paths under a directory.
 */
function getTxtFilesRecursive(dir: string): Array<{ display: string; absolute: string }> {
    const results: Array<{ display: string; absolute: string }> = [];
    function walk(current: string, relative: string) {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            const abs = path.join(current, entry.name);
            const rel = relative ? path.join(relative, entry.name) : entry.name;
            if (entry.isDirectory()) {
                walk(abs, rel);
            } else if (entry.isFile() && entry.name.endsWith('.txt')) {
                results.push({ display: rel, absolute: abs });
            }
        }
    }
    walk(dir, '');
    return results;
}

/**
 * Get list of .txt files in a directory (non-recursive).
 */
function getTxtFiles(baseDir?: string): Array<{ display: string; absolute: string }> {
    const dir = baseDir ?? __dirname;
    if (baseDir) {
        return getTxtFilesRecursive(dir);
    }
    try {
        const files = fs.readdirSync(dir);
        return files
            .filter(file => file.endsWith('.txt'))
            .filter(file => fs.statSync(path.join(dir, file)).isFile())
            .sort()
            .map(file => ({ display: file, absolute: path.join(dir, file) }));
    } catch {
        return [];
    }
}

/**
 * Print numbered list of .txt files.
 */
function printTxtFiles(txtFiles: Array<{ display: string; absolute: string }>): void {
    if (txtFiles.length === 0) return;
    console.log('\nAvailable .txt files:');
    txtFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.display}`);
    });
    console.log('');
}

/**
 * Print a single draft message.
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
 * Print all pending drafts from the daemon's current message processor.
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
 * Print sent messages from the provider starting at sentOffset.
 */
function printSentMessages(provider: SimMessageProvider, sentOffset: number): void {
    const sentMessages = provider.sentMessages.slice(sentOffset);
    if (sentMessages.length === 0) {
        console.log('Sent: (none)');
    } else {
        console.log(`\nSent (${sentMessages.length}):\n`);
        sentMessages.forEach((message: SimpleMessageWithMessageId, index: number) => {
            console.log(`--- Sent ${sentOffset + index + 1} ---`);
            console.log(`From: ${message.from.toString()}`);
            console.log(`To: ${message.to.map(addr => addr.toString()).join(', ')}`);
            console.log(`Subject: ${message.subject}`);
            if (message.xFriendlymail !== undefined) {
                try {
                    const decoded = JSON.parse(decodeQuotedPrintable(message.xFriendlymail));
                    console.log(`X-friendlymail:\n${JSON.stringify(decoded, null, 2)}`);
                } catch {
                    console.log(`X-friendlymail: ${message.xFriendlymail}`);
                }
            }
            console.log(`Body:`);
            console.log(message.body);
            console.log('');
        });
    }
}

/**
 * Run the daemon and print any messages sent during the run.
 */
async function runDaemon(daemon: Daemon, provider: SimMessageProvider): Promise<void> {
    const sentOffset = provider.sentMessages.length;
    await daemon.run();
    printSentMessages(provider, sentOffset);
}

async function main() {
    const { hostEmail, hostName, messageFiles, baseDir } = parseArgs();

    if (!EmailAddress.isValid(hostEmail)) {
        console.error(`Error: Invalid host email address: ${hostEmail}`);
        process.exit(1);
    }

    const hostEmailAddress = EmailAddress.fromString(hostEmail)!;

    const provider = new SimMessageProvider(hostEmailAddress, hostName, SIMULATOR_SENT_DIR, SIMULATOR_RECEIVED_DIR);

    let _user: User | null = null;
    const socialNetwork: ISocialNetwork = {
        getUser: () => _user!,
        setUser: (user: User) => { _user = user; }
    };

    if (baseDir && (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory())) {
        console.error(`Error: --base-dir is not a valid directory: ${baseDir}`);
        process.exit(1);
    }

    provider.clearDirs();

    const daemon = new Daemon(hostEmailAddress, provider, provider, socialNetwork);

    if (messageFiles.length > 0) {
        // Non-interactive: load explicit files, run the daemon once, show results
        for (const filePath of messageFiles) {
            if (!fs.existsSync(filePath)) {
                console.error(`Warning: File not found: ${filePath}`);
                continue;
            }
            await provider.loadFile(filePath);
        }
        await runDaemon(daemon, provider);
    } else {
        // Interactive mode
        const txtFiles = getTxtFiles(baseDir);

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: '> '
        });

        // resolveLoad is a helper used below to parse a "load <arg>" command
        // and return the resolved file path, or null on error.
        const resolveLoadArg = (fileArg: string): string | null => {
            const numberMatch = fileArg.match(/^\$(\d+)$/);
            if (numberMatch) {
                const fileIndex = parseInt(numberMatch[1], 10) - 1;
                if (fileIndex >= 0 && fileIndex < txtFiles.length) {
                    return txtFiles[fileIndex].absolute;
                }
                console.error(`Error: Invalid file number. Available files are 1-${txtFiles.length}`);
                return null;
            }
            return fileArg;
        };

        // Pre-start phase: allow loading messages before the first daemon run.
        console.log('Load messages before starting, or type "start" to run the daemon.');
        printTxtFiles(txtFiles);
        rl.prompt();

        let started = false;

        rl.on('line', async (line: string) => {
            const trimmed = line.trim();

            if (trimmed === 'q') {
                rl.close();
                return;
            }

            if (!started) {
                // Pre-start: accept load and start only.
                if (trimmed === 'start') {
                    started = true;
                    await runDaemon(daemon, provider);
                } else if (trimmed.startsWith('load ')) {
                    const fileArg = trimmed.substring(5).trim();
                    if (!fileArg) {
                        console.error('Error: No file path provided. Usage: load <file> or load $N');
                    } else {
                        const filePath = resolveLoadArg(fileArg);
                        if (filePath !== null) {
                            if (!fs.existsSync(filePath)) {
                                console.error(`Error: File not found: ${filePath}`);
                            } else {
                                await provider.loadFile(filePath);
                            }
                        }
                    }
                } else if (trimmed.length > 0) {
                    console.error('Type "load <file>" or "load $N" to queue messages, or "start" to run the daemon.');
                }
            } else {
                // Post-start: full command set.
                if (trimmed.startsWith('load ')) {
                    const fileArg = trimmed.substring(5).trim();
                    if (!fileArg) {
                        console.error('Error: No file path provided. Usage: load <file> or load $N');
                    } else {
                        const filePath = resolveLoadArg(fileArg);
                        if (filePath !== null) {
                            if (!fs.existsSync(filePath)) {
                                console.error(`Error: File not found: ${filePath}`);
                            } else {
                                await provider.loadFile(filePath);
                                await runDaemon(daemon, provider);
                            }
                        }
                    }
                } else if (trimmed === 'run' || trimmed === 'send' || trimmed === 'start') {
                    await runDaemon(daemon, provider);
                } else if (trimmed.startsWith('send ')) {
                    const arg = trimmed.slice(5).trim().replace(/^["']|["']$/g, '');
                    try {
                        await provider.loadFromMailto(arg);
                        await runDaemon(daemon, provider);
                    } catch (err) {
                        console.error(`Error: ${(err as Error).message}`);
                    }
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
                    console.error('  start         - Run the daemon (process and send pending messages)');
                    console.error('  send "mailto:<email>?subject=<s>&body=<b>" - Send a message from the host');
                    console.error('  send          - Run the daemon');
                    console.error('  run           - Alias for send');
                    console.error('  load <file>   - Load a message file and run the daemon');
                    console.error('  load $N       - Load file by number from the list above');
                    console.error('  show --drafts - List pending draft messages');
                    console.error('  show --sent   - List all sent messages');
                    console.error('  q             - Quit');
                }
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
