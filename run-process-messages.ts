#!/usr/bin/env node

/**
 * Command-line script to run MessageProcessor
 * 
 * Usage:
 *   npm run process -- --host-email <email> --host-name <name> [message-file...]
 *   npm run process -- --host-email ploden@gmail.com --host-name "Phil Loden" message1.txt message2.txt
 * 
 * Or with tsx directly:
 *   tsx run-process-messages.ts --host-email <email> --host-name <name> [message-file...]
 * 
 * Note: When using npm run, you must use -- to separate npm arguments from script arguments.
 * 
 * If no message files are provided, reads from stdin.
 * 
 * The script processes email messages and prints any draft messages that are created.
 * Note: The host-name parameter is currently accepted but not used (reserved for future use).
 */

import { MessageProcessor } from './src/MessageProcessor';
import { EmailMessage } from './EmailMessage';
import { EmailAddress } from './src/models/EmailAddress';
import { Mailbox } from './src/models/Mailbox';
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
        console.error('  If no message files are provided, reads from stdin');
        console.error('  Example: npm run process -- --host-email ploden@gmail.com --host-name "Phil Loden" message.txt');
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

function printDrafts(processor: MessageProcessor): void {
    const drafts = processor.getMessageDrafts();
    
    if (drafts.length === 0) {
        console.log('No draft messages created.');
    } else {
        console.log(`\nCreated ${drafts.length} draft message(s):\n`);
        drafts.forEach((draft, index) => {
            console.log(`--- Draft ${index + 1} ---`);
            console.log(`From: ${draft.from?.toString() || '(none)'}`);
            console.log(`To: ${draft.to.map(addr => addr.toString()).join(', ')}`);
            console.log(`Subject: ${draft.subject}`);
            console.log(`Body:`);
            console.log(draft.body);
            console.log(`Priority: ${draft.priority}`);
            console.log(`HTML: ${draft.isHtml}`);
            console.log(`Created: ${draft.createdAt.toISOString()}`);
            console.log(`Updated: ${draft.updatedAt.toISOString()}`);
            if (draft.attachments.length > 0) {
                console.log(`Attachments: ${draft.attachments.join(', ')}`);
            }
            console.log('');
        });
    }
}

function printSentMessages(processor: MessageProcessor): void {
    const sentMessages = processor.getSentMessages();
    
    if (sentMessages.length === 0) {
        console.log('No sent messages.');
    } else {
        console.log(`\n${sentMessages.length} sent message(s):\n`);
        sentMessages.forEach((message, index) => {
            console.log(`--- Sent ${index + 1} ---`);
            console.log(`From: ${message.from.toString()}`);
            console.log(`To: ${message.to.map(addr => addr.toString()).join(', ')}`);
            console.log(`Subject: ${message.subject}`);
            console.log(`Body:`);
            console.log(message.body);
            console.log(`Priority: ${message.priority}`);
            console.log(`HTML: ${message.isHtml}`);
            if (message.attachments.length > 0) {
                console.log(`Attachments: ${message.attachments.join(', ')}`);
            }
            console.log('');
        });
    }
}

async function processMessageFile(filePath: string, hostEmailAddress: EmailAddress, allMessages: EmailMessage[]): Promise<EmailMessage[]> {
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`Warning: File not found: ${filePath}`);
            return allMessages;
        }
        const message = await EmailMessage.fromTextFile(filePath);
        const updatedMessages = [...allMessages, message];
        const mailbox = new Mailbox(hostEmailAddress, updatedMessages, [], []);
        const processor = new MessageProcessor(mailbox);
        printDrafts(processor);
        return updatedMessages;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error reading file ${filePath}: ${errorMessage}`);
        return allMessages;
    }
}

async function main() {
    const { hostEmail, hostName, messageFiles } = parseArgs();

    // Validate host email
    if (!EmailAddress.isValid(hostEmail)) {
        console.error(`Error: Invalid host email address: ${hostEmail}`);
        process.exit(1);
    }

    const hostEmailAddress = EmailAddress.fromString(hostEmail);
    if (!hostEmailAddress) {
        console.error(`Error: Failed to parse host email address: ${hostEmail}`);
        process.exit(1);
    }

    // Read messages from files if provided
    const messages: EmailMessage[] = [];

    if (messageFiles.length > 0) {
        // Read from files
        for (const filePath of messageFiles) {
            try {
                if (!fs.existsSync(filePath)) {
                    console.error(`Warning: File not found: ${filePath}`);
                    continue;
                }
                const message = await EmailMessage.fromTextFile(filePath);
                messages.push(message);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Error reading file ${filePath}: ${errorMessage}`);
            }
        }

        // Create MessageProcessor instance with messages (messages are processed in constructor)
        const mailbox = new Mailbox(hostEmailAddress, messages, [], []);
        const processor = new MessageProcessor(mailbox);
        printDrafts(processor);
    } else {
        // Interactive mode: wait for input on stdin
        let allMessages: EmailMessage[] = [];
        const mailbox = new Mailbox(hostEmailAddress, allMessages, [], []);
        const processor = new MessageProcessor(mailbox);
        printDrafts(processor);

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
                if (fileArg) {
                    let filePath: string;
                    
                    // Check if it's a numbered reference like $2
                    const numberMatch = fileArg.match(/^\$(\d+)$/);
                    if (numberMatch) {
                        const fileIndex = parseInt(numberMatch[1], 10) - 1;
                        if (fileIndex >= 0 && fileIndex < txtFiles.length) {
                            filePath = path.join(__dirname, txtFiles[fileIndex]);
                            allMessages = await processMessageFile(filePath, hostEmailAddress, allMessages);
                        } else {
                            console.error(`Error: Invalid file number. Available files are 1-${txtFiles.length}`);
                        }
                    } else {
                        filePath = fileArg;
                        allMessages = await processMessageFile(filePath, hostEmailAddress, allMessages);
                    }
                } else {
                    console.error('Error: No file path provided. Usage: load <message-file> or load $N');
                }
            } else if (trimmed.startsWith('send ')) {
                const sendArg = trimmed.substring(5).trim();
                const numberMatch = sendArg.match(/^\$(\d+)$/);
                if (numberMatch) {
                    const draftIndex = parseInt(numberMatch[1], 10) - 1;
                    const drafts = processor.getMessageDrafts();
                    if (draftIndex >= 0 && draftIndex < drafts.length) {
                        const sentMessage = processor.sendDraft(draftIndex);
                        if (sentMessage) {
                            console.log(`\nSent draft ${draftIndex + 1}:`);
                            console.log(`From: ${sentMessage.from.toString()}`);
                            console.log(`To: ${sentMessage.to.map(addr => addr.toString()).join(', ')}`);
                            console.log(`Subject: ${sentMessage.subject}`);
                            console.log(`Body:`);
                            console.log(sentMessage.body);
                            console.log('');
                        } else {
                            console.error(`Error: Draft ${draftIndex + 1} is not ready to send (missing required fields)`);
                        }
                    } else {
                        console.error(`Error: Invalid draft number. Available drafts are 1-${drafts.length}`);
                    }
                } else {
                    console.error('Error: Invalid send command. Usage: send $N (where N is the draft number)');
                }
            } else if (trimmed.startsWith('show ')) {
                const showArg = trimmed.substring(5).trim();
                if (showArg === '--drafts') {
                    printDrafts(processor);
                } else if (showArg === '--sent') {
                    printSentMessages(processor);
                } else {
                    console.error('Error: Invalid show command. Usage: show --drafts or show --sent');
                }
            } else if (trimmed.length > 0) {
                console.error(`Unknown command: ${trimmed}`);
                console.error('Commands:');
                console.error('  load <message-file>  - Load and process a message from a file');
                console.error('  load $N              - Load file by number from the list above');
                console.error('  send $N              - Send draft message by number');
                console.error('  show --drafts        - List draft messages');
                console.error('  show --sent          - List sent messages');
                console.error('  q                   - Quit');
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
