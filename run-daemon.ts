#!/usr/bin/env node

/**
 * friendlymail daemon — connects to a live mail server via SMTP/IMAP and
 * processes friendlymail messages continuously, polling for new mail on a
 * fixed interval.
 *
 * Usage:
 *   npm run daemon -- --host-email <email> [options]
 *
 * Required:
 *   --host-email <email>      The friendlymail host address
 *
 * SMTP options (defaults target Mailpit on localhost):
 *   --smtp-host <host>        SMTP server host      (default: localhost)
 *   --smtp-port <port>        SMTP server port      (default: 1025)
 *   --smtp-secure             Use TLS for SMTP      (default: false)
 *   --smtp-user <user>        SMTP username         (default: "")
 *   --smtp-pass <pass>        SMTP password         (default: "")
 *
 * IMAP options (defaults target Mailpit on localhost):
 *   --imap-host <host>        IMAP server host      (default: localhost)
 *   --imap-port <port>        IMAP server port      (default: 1143)
 *   --imap-secure             Use TLS for IMAP      (default: false)
 *   --imap-user <user>        IMAP username         (default: host email)
 *   --imap-pass <pass>        IMAP password         (default: "")
 *
 * Other options:
 *   --config <path>           Path to a key=value config file (CLI args override file)
 *   --interval <seconds>      Poll interval in seconds (default: 10)
 *   --since <YYYY-MM-DD>      Only fetch IMAP messages on or after this date
 *   --allow-self-signed       Skip TLS certificate verification (for local dev)
 *   --verbose                 Log each fetched/sent message and cycle details
 *
 * Config file format (one option per line, # for comments):
 *   host-email=phil@example.com
 *   smtp-host=smtp.gmail.com
 *   smtp-secure=true
 *   verbose=true
 */

import * as fs from 'fs';
import { Daemon } from './src/models/Daemon';
import { EmailMailProvider } from './src/models/EmailMailProvider';
import { EmailAddress } from './src/models/EmailAddress.impl';
import { ISocialNetwork } from './src/models/SocialNetwork.interface';
import { User } from './src/models/User.impl';

interface Args {
    hostEmail: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    imapUser: string;
    imapPass: string;
    intervalSec: number;
    sinceDate: Date | undefined;
    allowSelfSigned: boolean;
    verbose: boolean;
}

/** Option names that act as boolean flags (no value argument on the CLI). */
const BOOLEAN_OPTIONS = new Set(['smtp-secure', 'imap-secure', 'allow-self-signed', 'verbose']);

/**
 * Parse a key=value config file and return a synthetic argv array.
 * Boolean options with value "true" become --flag entries.
 * Boolean options with value "false" are omitted.
 * Lines starting with # and blank lines are ignored.
 */
function loadConfigFile(filePath: string): string[] {
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Cannot read config file "${filePath}": ${msg}`);
        process.exit(1);
    }

    const syntheticArgv: string[] = [];
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const eqIndex = line.indexOf('=');
        const key   = (eqIndex === -1 ? line : line.slice(0, eqIndex)).trim();
        const value = (eqIndex === -1 ? ''  : line.slice(eqIndex + 1)).trim();

        if (BOOLEAN_OPTIONS.has(key)) {
            if (value.toLowerCase() !== 'false') syntheticArgv.push(`--${key}`);
        } else {
            syntheticArgv.push(`--${key}`, value);
        }
    }
    return syntheticArgv;
}

function parseArgs(): Args {
    // Pre-scan for --config and strip it from argv before the main parse loop.
    const rawArgv = process.argv.slice(2);
    let configArgv: string[] = [];
    const filteredArgv: string[] = [];
    for (let i = 0; i < rawArgv.length; i++) {
        if (rawArgv[i] === '--config' && i + 1 < rawArgv.length) {
            configArgv = loadConfigFile(rawArgv[i + 1]);
            i++;
        } else {
            filteredArgv.push(rawArgv[i]);
        }
    }

    // Config file entries come first so CLI args (filteredArgv) override them.
    const argv = [...configArgv, ...filteredArgv];
    let hostEmail: string | undefined;
    let smtpHost = 'localhost';
    let smtpPort = 1025;
    let smtpSecure = false;
    let smtpUser = '';
    let smtpPass = '';
    let imapHost = 'localhost';
    let imapPort = 1143;
    let imapSecure = false;
    let imapUser: string | undefined;
    let imapPass = '';
    let intervalSec = 10;
    let sinceDate: Date | undefined;
    let allowSelfSigned = false;
    let verbose = false;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case '--host-email':   hostEmail  = next; i++; break;
            case '--smtp-host':    smtpHost   = next; i++; break;
            case '--smtp-port':    smtpPort   = parseInt(next, 10); i++; break;
            case '--smtp-secure':  smtpSecure = true; break;
            case '--smtp-user':    smtpUser   = next; i++; break;
            case '--smtp-pass':    smtpPass   = next; i++; break;
            case '--imap-host':    imapHost   = next; i++; break;
            case '--imap-port':    imapPort   = parseInt(next, 10); i++; break;
            case '--imap-secure':  imapSecure = true; break;
            case '--imap-user':    imapUser   = next; i++; break;
            case '--imap-pass':    imapPass   = next; i++; break;
            case '--interval':          intervalSec    = parseInt(next, 10); i++; break;
            case '--since':             sinceDate      = new Date(next); i++; break;
            case '--allow-self-signed': allowSelfSigned = true; break;
            case '--verbose':           verbose = true; break;
            default:
                if (arg.startsWith('--')) {
                    console.error(`Unknown option: ${arg}`);
                    process.exit(1);
                }
        }
    }

    if (!hostEmail) {
        console.error('Usage: npm run daemon -- --host-email <email> [options]');
        console.error('Run with --help for full option list.');
        process.exit(1);
    }

    if (!EmailAddress.isValid(hostEmail)) {
        console.error(`Invalid host email address: ${hostEmail}`);
        process.exit(1);
    }

    return {
        hostEmail,
        smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass,
        imapHost, imapPort, imapSecure,
        imapUser: imapUser ?? hostEmail,
        imapPass,
        intervalSec,
        sinceDate,
        allowSelfSigned,
        verbose,
    };
}

async function main(): Promise<void> {
    const args = parseArgs();
    const hostAddress = EmailAddress.fromString(args.hostEmail)!;

    const provider = new EmailMailProvider(
        {
            host: args.smtpHost,
            port: args.smtpPort,
            secure: args.smtpSecure,
            auth: { user: args.smtpUser, pass: args.smtpPass },
            allowSelfSigned: args.allowSelfSigned,
        },
        {
            host: args.imapHost,
            port: args.imapPort,
            secure: args.imapSecure,
            auth: { user: args.imapUser, pass: args.imapPass },
            allowSelfSigned: args.allowSelfSigned,
            sinceDate: args.sinceDate,
        },
        args.verbose
    );

    let _user: User | null = null;
    const socialNetwork: ISocialNetwork = {
        getUser: () => _user!,
        setUser: (user: User) => { _user = user; },
    };

    const daemon = new Daemon(hostAddress, provider, provider, socialNetwork, args.verbose);

    console.log(`friendlymail daemon starting for ${args.hostEmail}`);
    console.log(`SMTP  ${args.smtpHost}:${args.smtpPort}  IMAP  ${args.imapHost}:${args.imapPort}`);
    console.log(`Polling every ${args.intervalSec}s. Press Ctrl+C to stop.\n`);

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    while (true) {
        try {
            await daemon.run();
        } catch (err) {
            console.error('Error during daemon run:', err);
        }
        await sleep(args.intervalSec * 1000);
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
