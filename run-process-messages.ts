#!/usr/bin/env node

/**
 * Command-line script to run ProcessMessages
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

import { ProcessMessages } from './src/ProcessMessages';
import { EmailMessage } from './EmailMessage';
import { EmailAddress } from './src/models/EmailAddress';
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

function printDrafts(processor: ProcessMessages): void {
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

async function processMessageFile(filePath: string, hostEmailAddress: EmailAddress, allMessages: EmailMessage[]): Promise<EmailMessage[]> {
    try {
        if (!fs.existsSync(filePath)) {
            console.error(`Warning: File not found: ${filePath}`);
            return allMessages;
        }
        const message = await EmailMessage.fromTextFile(filePath);
        const updatedMessages = [...allMessages, message];
        const processor = new ProcessMessages(hostEmailAddress, updatedMessages);
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

        // Create ProcessMessages instance with messages (messages are processed in constructor)
        const processor = new ProcessMessages(hostEmailAddress, messages);
        printDrafts(processor);
    } else {
        // Interactive mode: wait for input on stdin
        let allMessages: EmailMessage[] = [];
        const processor = new ProcessMessages(hostEmailAddress, allMessages);
        printDrafts(processor);

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
                const filePath = trimmed.substring(5).trim();
                if (filePath) {
                    allMessages = await processMessageFile(filePath, hostEmailAddress, allMessages);
                } else {
                    console.error('Error: No file path provided. Usage: load <message-file>');
                }
            } else if (trimmed.length > 0) {
                console.error(`Unknown command: ${trimmed}`);
                console.error('Commands:');
                console.error('  load <message-file>  - Load and process a message from a file');
                console.error('  q                   - Quit');
            }
            
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
