#!/usr/bin/env node

/**
 * purge-friendlymail.ts
 *
 * Deletes all friendlymail-related messages from every folder in an IMAP
 * account (inbox, sent, archive, trash, etc.).
 *
 * A message is considered a friendlymail message if:
 *   • It has an X-friendlymail header (all daemon-sent messages), OR
 *   • Its subject is a friendlymail command subject:
 *       "Fm", "fm", "📻", "Fm Like …", "Fm Comment …"
 *
 * Usage:
 *   tsx purge-friendlymail.ts <config-file> [--dry-run] [--verbose]
 *
 * Options:
 *   --dry-run    Show what would be deleted without actually deleting anything.
 *   --verbose    Print each matching message as it is found.
 *
 * Config file format (key=value, one per line; # for comments):
 *   imap-host=imap.gmail.com
 *   imap-port=993
 *   imap-secure=true
 *   imap-user=you@gmail.com
 *   imap-pass=your-app-password
 *   allow-self-signed=false    # optional, default false
 *
 * Gmail note:
 *   Gmail moves deleted messages to [Gmail]/Trash instead of immediately
 *   expunging them. Run the script a second time (or empty your Trash
 *   manually) to permanently remove them.
 *   [Gmail]/All Mail and [Gmail]/Archive are always attempted explicitly to
 *   ensure archived messages are purged even if the mailbox listing omits them.
 */

import * as fs from 'fs';
import { ImapFlow } from 'imapflow';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Config {
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    imapUser: string;
    imapPass: string;
    allowSelfSigned: boolean;
}

// ── Config loading ─────────────────────────────────────────────────────────────

const BOOLEAN_OPTIONS = new Set(['imap-secure', 'allow-self-signed', 'verbose', 'dry-run']);

/**
 * Expand $VAR or ${VAR} references in a config value using process.env.
 * Throws if a referenced variable is not set.
 */
function expandEnvVars(value: string): string {
    return value.replace(
        /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
        (_match, braced: string | undefined, bare: string | undefined) => {
            const name = braced ?? bare!;
            const resolved = process.env[name];
            if (resolved === undefined) {
                console.error(`Config error: environment variable $${name} is not set`);
                process.exit(1);
            }
            return resolved;
        }
    );
}

function loadConfigFile(filePath: string): string[] {
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Cannot read config file "${filePath}": ${msg}`);
        process.exit(1);
    }

    const argv: string[] = [];
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;

        const eqIndex = line.indexOf('=');
        const key   = (eqIndex === -1 ? line : line.slice(0, eqIndex)).trim();
        const value = expandEnvVars((eqIndex === -1 ? '' : line.slice(eqIndex + 1)).trim());

        if (BOOLEAN_OPTIONS.has(key)) {
            if (value.toLowerCase() !== 'false') argv.push(`--${key}`);
        } else {
            argv.push(`--${key}`, value);
        }
    }
    return argv;
}

function parseArgs(): { config: Config; dryRun: boolean; verbose: boolean } {
    const rawArgv = process.argv.slice(2);

    // First positional argument is the config file path.
    let configFilePath: string | undefined;
    const cliFlags: string[] = [];
    for (const arg of rawArgv) {
        if (!arg.startsWith('--') && configFilePath === undefined) {
            configFilePath = arg;
        } else {
            cliFlags.push(arg);
        }
    }

    if (!configFilePath) {
        console.error('Usage: tsx purge-friendlymail.ts <config-file> [--dry-run] [--verbose]');
        process.exit(1);
    }

    // Config file entries come first; CLI flags override them.
    const argv = [...loadConfigFile(configFilePath), ...cliFlags];

    let imapHost = '';
    let imapPort = 993;
    let imapSecure = false;
    let imapUser = '';
    let imapPass = '';
    let allowSelfSigned = false;
    let dryRun = false;
    let verbose = false;

    for (let i = 0; i < argv.length; i++) {
        const arg  = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case '--imap-host':        imapHost        = next; i++; break;
            case '--imap-port':        imapPort        = parseInt(next, 10); i++; break;
            case '--imap-secure':      imapSecure      = true; break;
            case '--imap-user':        imapUser        = next; i++; break;
            case '--imap-pass':        imapPass        = next; i++; break;
            case '--allow-self-signed': allowSelfSigned = true; break;
            case '--dry-run':          dryRun          = true; break;
            case '--verbose':          verbose         = true; break;
            default:
                if (arg.startsWith('--')) {
                    // Silently ignore unrecognised options (e.g. smtp-* from a shared config).
                }
        }
    }

    const missing: string[] = [];
    if (!imapHost) missing.push('imap-host');
    if (!imapUser) missing.push('imap-user');
    if (missing.length > 0) {
        console.error(`Missing required config options: ${missing.join(', ')}`);
        process.exit(1);
    }

    return {
        config: { imapHost, imapPort, imapSecure, imapUser, imapPass, allowSelfSigned },
        dryRun,
        verbose,
    };
}

// ── Friendlymail message detection ────────────────────────────────────────────

/** Returns true for subjects that identify a user-sent friendlymail command message. */
function isFriendlymailSubject(subject: string): boolean {
    return subject === 'Fm'
        || subject === 'fm'
        || subject === '📻'
        || subject.startsWith('Fm Like')
        || subject.startsWith('Fm Comment');
}

/**
 * Returns true if the path is a Gmail "All Mail" virtual folder.
 * Gmail does not honour EXPUNGE on All Mail; messages must be moved to Trash first.
 */
function isAllMailPath(path: string): boolean {
    return path === '[Gmail]/All Mail' || path === '[Google Mail]/All Mail';
}

// ── IMAP helpers ──────────────────────────────────────────────────────────────

function makeClient(config: Config): ImapFlow {
    return new ImapFlow({
        host:   config.imapHost,
        port:   config.imapPort,
        secure: config.imapSecure,
        auth:   { user: config.imapUser, pass: config.imapPass },
        logger: false,
        tls:    { rejectUnauthorized: !config.allowSelfSigned },
    });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function purgeMailbox(
    client: ImapFlow,
    path: string,
    dryRun: boolean,
    verbose: boolean,
    trashPath?: string,
): Promise<number> {
    let lock;
    try {
        lock = await client.getMailboxLock(path);
    } catch {
        // Some virtual folders (e.g. [Gmail]/Important) cannot be opened.
        return 0;
    }

    let deleteCount = 0;

    try {
        // Pass 1 — messages with an X-friendlymail header.
        const headerUids: number[] = await (async () => {
            const result = await client.search(
                { header: { 'x-friendlymail': '' } },
                { uid: true }
            );
            return result === false ? [] : result;
        })();

        // Pass 2 — messages whose subject identifies a user command ("Fm" prefix).
        // We fetch envelopes to verify the subject exactly, since IMAP SEARCH
        // SUBJECT matches any message whose subject *contains* the search term.
        const subjectUids: number[] = [];
        const candidateResult = await client.search({ subject: 'Fm' }, { uid: true });
        const candidateUids: number[] = candidateResult === false ? [] : candidateResult;

        if (candidateUids.length > 0) {
            for await (const msg of client.fetch(
                candidateUids.join(','),
                { envelope: true },
                { uid: true }
            )) {
                if (isFriendlymailSubject(msg.envelope?.subject ?? '')) {
                    subjectUids.push(msg.uid);
                }
            }
        }

        // Pass 3 — messages whose subject contains "friendlymail" (welcome,
        // invite-to-follow, etc.) confirmed by the presence of X-friendlymail header.
        const friendlymailSubjectResult = await client.search({ subject: 'friendlymail' }, { uid: true });
        const friendlymailCandidates: number[] = friendlymailSubjectResult === false ? [] : friendlymailSubjectResult;

        if (friendlymailCandidates.length > 0) {
            for await (const msg of client.fetch(
                friendlymailCandidates.join(','),
                { headers: ['x-friendlymail'] },
                { uid: true }
            )) {
                if (msg.headers && msg.headers.length > 0) {
                    subjectUids.push(msg.uid);
                }
            }
        }

        // Pass 4 — messages whose sender name contains "friendlymail", confirmed
        // by the presence of the X-friendlymail header.
        const friendlymailFromResult = await client.search({ from: 'friendlymail' }, { uid: true });
        const friendlymailFromCandidates: number[] = friendlymailFromResult === false ? [] : friendlymailFromResult;

        if (friendlymailFromCandidates.length > 0) {
            for await (const msg of client.fetch(
                friendlymailFromCandidates.join(','),
                { headers: ['x-friendlymail'] },
                { uid: true }
            )) {
                if (msg.headers && msg.headers.length > 0) {
                    subjectUids.push(msg.uid);
                }
            }
        }

        // Combine and deduplicate.
        const seen = new Set<number>();
        const allUids: number[] = [];
        for (const uid of [...headerUids, ...subjectUids]) {
            if (!seen.has(uid)) { seen.add(uid); allUids.push(uid); }
        }
        if (allUids.length === 0) return 0;

        // Gmail does not honour EXPUNGE on [Gmail]/All Mail directly.
        // Move to Trash first; the subsequent Trash pass will permanently delete.
        const useMove = !!trashPath && isAllMailPath(path);

        if (verbose || dryRun) {
            // Fetch envelopes for reporting.
            for await (const msg of client.fetch(
                allUids.join(','),
                { envelope: true },
                { uid: true }
            )) {
                const action = dryRun ? '[dry-run]' : (useMove ? '[move-to-trash]' : '[delete]');
                console.log(`  ${action} uid=${msg.uid}  subject="${msg.envelope?.subject ?? ''}"  date=${msg.envelope?.date?.toISOString().slice(0, 10) ?? '?'}`);
            }
        }

        if (!dryRun) {
            if (useMove) {
                await client.messageMove(allUids.join(','), trashPath!, { uid: true });
            } else {
                // messageDelete moves to Trash (Gmail) or sets \Deleted + expunges (standard IMAP).
                await client.messageDelete(allUids.join(','), { uid: true });
            }
        }

        deleteCount = allUids.length;
    } finally {
        lock.release();
    }

    return deleteCount;
}

async function main(): Promise<void> {
    const { config, dryRun, verbose } = parseArgs();

    if (dryRun) {
        console.log('DRY RUN — no messages will be deleted.\n');
    }

    console.log(`Connecting to ${config.imapHost}:${config.imapPort} as ${config.imapUser}…`);
    const client = makeClient(config);
    await client.connect();
    console.log('Connected.\n');

    // List all mailboxes.
    const mailboxes = await client.list();
    console.log(`Found ${mailboxes.length} mailbox(es).\n`);

    // Locate the Trash folder (needed for the Gmail All Mail workaround).
    const trashMailbox = mailboxes.find(m => m.flags?.has('\\Trash'));
    const trashPath = trashMailbox?.path;

    let totalDeleted = 0;
    const processedPaths = new Set<string>();

    for (const mailbox of mailboxes) {
        // Skip mailboxes flagged as non-selectable (containers, not real folders).
        if (mailbox.flags?.has('\\Noselect')) continue;

        process.stdout.write(`${mailbox.path} … `);
        const count = await purgeMailbox(client, mailbox.path, dryRun, verbose, trashPath);
        processedPaths.add(mailbox.path);

        if (count > 0) {
            console.log(`${dryRun ? 'found' : 'deleted'} ${count} message(s)`);
            totalDeleted += count;
        } else {
            console.log('none');
        }
    }

    // Explicitly attempt Gmail archive folders in case they were absent from the
    // mailbox list or silently skipped due to a lock failure above.
    const gmailArchivePaths = ['[Gmail]/All Mail', '[Gmail]/Archive'];
    for (const archivePath of gmailArchivePaths) {
        if (processedPaths.has(archivePath)) continue;
        process.stdout.write(`${archivePath} … `);
        const count = await purgeMailbox(client, archivePath, dryRun, verbose, trashPath);
        if (count > 0) {
            console.log(`${dryRun ? 'found' : 'deleted'} ${count} message(s)`);
            totalDeleted += count;
        } else {
            console.log('none');
        }
    }

    await client.logout();

    console.log(`\n${'─'.repeat(50)}`);
    if (dryRun) {
        console.log(`Total friendlymail messages found: ${totalDeleted}`);
        console.log('Re-run without --dry-run to delete them.');
    } else {
        console.log(`Total friendlymail messages deleted: ${totalDeleted}`);
        if (totalDeleted > 0) {
            console.log('\nNote: on Gmail, deleted messages are moved to [Gmail]/Trash.');
            console.log('Run this script again (or empty your Trash) to permanently remove them.');
        }
    }
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
