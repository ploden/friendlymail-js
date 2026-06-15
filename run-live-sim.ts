#!/usr/bin/env node

/**
 * run-live-sim.ts
 *
 * Runs a .sim script against a single real email account (the "host").
 *
 * Each instance of this script is configured with ONE --host-config. When a
 * scenario involves multiple real participants, run one instance per participant,
 * each with its own --host-config. Each instance runs independently, processing
 * only messages relevant to its configured host.
 *
 * Non-host users in the sim file are identified by placeholders
 * (e.g. [non-host-email-1]) and can be overridden via --non-host-email-N CLI
 * args or equivalent entries in the host config file. No IMAP connection is
 * established for non-host users.
 *
 * Usage:
 *   npx tsx run-live-sim.ts --host-config <file> <sim-file> [options]
 *
 * Options:
 *   --host-config <file>          Required. Key=value config for the host account.
 *   --test-config <file>          Test SMTP/IMAP login for the given config file and exit.
 *   --verbose                     Print a summary of each sent message after each step.
 *   --delay <ms>                  Milliseconds to wait after each daemon run (default: 10000).
 *                                 Increase if the mail server is slow to deliver.
 *   --send-delay <s>              Seconds to wait between sending each draft within a
 *                                 daemon run (default: 0).
 *   --sim-send-delay <s>          Seconds to wait after the live-sim sends each message
 *                                 before triggering the daemon run (default: 0). Use this to
 *                                 rate-limit outbound messages to one per period.
 *   --role <role>                  Role this instance plays in a multi-participant sim.
 *                                 Valid values: host (default), non-host-user-1,
 *                                 non-host-user-2, ... non-host-user-N.
 *                                 When set to non-host-user-N, the host config's
 *                                 host-email and host-name are automatically injected
 *                                 as the non-host-email-N / non-host-name-N overrides
 *                                 (unless already explicitly provided).
 *   --non-host-email-N=<email>    Override the email for non-host user N (1-based).
 *   --non-host-name-N=<name>      Override the display name for non-host user N (1-based).
 *
 * Host config file format (key=value):
 *   host-email=you@gmail.com
 *   host-name=Your Name          # optional — used for [host-name] placeholder
 *   imap-host=imap.gmail.com
 *   imap-port=993
 *   imap-secure=true
 *   imap-user=you@gmail.com
 *   imap-pass=$GMAIL_PASS        # env-var references supported
 *   smtp-host=smtp.gmail.com
 *   smtp-port=465
 *   smtp-secure=true
 *   smtp-user=you@gmail.com
 *   smtp-pass=$GMAIL_PASS
 *   since=2026-03-23             # optional — default: today; limits IMAP fetch
 *   archive-folder=[Gmail]/All Mail  # optional — also fetch from this folder
 *   allow-self-signed=false      # optional
 *   non-host-email-1=alice@real.com   # optional — override non-host user 1 email
 *   non-host-name-1=Alice Real        # optional — override non-host user 1 name
 *
 * Sim file format: same as run-process-messages.ts script files.
 *   Supported commands: start, load <file>, send "mailto:...", run, q
 *   Blank lines and lines beginning with # are ignored.
 *
 * Recommendation: run purge-friendlymail.ts first to clear any existing
 * friendlymail messages from the account so old state does not interfere.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
import { Daemon } from './src/models/Daemon';
import { EmailMailProvider } from './src/models/EmailMailProvider';
import { LocalSimMailProvider } from './src/models/LocalSimMailProvider';
import { EmailAddress } from './src/models/EmailAddress.impl';
import { ISocialNetwork } from './src/models/SocialNetwork.interface';
import { User } from './src/models/User.impl';
import { FRIENDLYMAIL_EPOCH } from './src/constants';
import { SimpleMessageWithMessageId } from './src/models/SimpleMessageWithMessageId.impl';

// ── Test users — same list as SimMessageProvider ──────────────────────────────

const TEST_USERS: ReadonlyArray<{ name: string; email: string }> = [
    { name: 'Alice Johnson',  email: 'alice@test.com'  },
    { name: 'Bob Smith',      email: 'bob@test.com'    },
    { name: 'Carol Williams', email: 'carol@test.com'  },
    { name: 'Dave Brown',     email: 'dave@test.com'   },
    { name: 'Eve Davis',      email: 'eve@test.com'    },
    { name: 'Frank Miller',   email: 'frank@test.com'  },
    { name: 'Grace Wilson',   email: 'grace@test.com'  },
    { name: 'Henry Moore',    email: 'henry@test.com'  },
    { name: 'Iris Taylor',    email: 'iris@test.com'   },
    { name: 'Jack Anderson',  email: 'jack@test.com'   },
    { name: 'Kate Thomas',    email: 'kate@test.com'   },
    { name: 'Liam Jackson',   email: 'liam@test.com'   },
    { name: 'Mia White',      email: 'mia@test.com'    },
    { name: 'Noah Harris',    email: 'noah@test.com'   },
    { name: 'Olivia Martin',  email: 'olivia@test.com' },
    { name: 'Pete Garcia',    email: 'pete@test.com'   },
    { name: 'Quinn Martinez', email: 'quinn@test.com'  },
    { name: 'Rose Robinson',  email: 'rose@test.com'   },
    { name: 'Sam Clark',      email: 'sam@test.com'    },
    { name: 'Tina Lewis',     email: 'tina@test.com'   },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface Config {
    hostEmail: string;
    hostName: string;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    imapUser: string;
    imapPass: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
    sinceDate: Date;
    archiveFolder: string | undefined;
    allowSelfSigned: boolean;
}

// ── Config loading ─────────────────────────────────────────────────────────────

const BOOLEAN_OPTIONS = new Set([
    'imap-secure', 'smtp-secure', 'allow-self-signed', 'verbose', 'local',
]);

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

/** Convert a single "key=value" config entry to argv tokens. */
function configEntryToArgv(line: string): string[] {
    const eqIndex = line.indexOf('=');
    const key   = (eqIndex === -1 ? line : line.slice(0, eqIndex)).trim();
    const value = expandEnvVars((eqIndex === -1 ? '' : line.slice(eqIndex + 1)).trim());
    if (BOOLEAN_OPTIONS.has(key)) {
        return value.toLowerCase() !== 'false' ? [`--${key}`] : [];
    }
    return [`--${key}`, value];
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
        argv.push(...configEntryToArgv(line));
    }
    return argv;
}

function parseArgs(): {
    config: Config;
    simFile: string;
    verbose: boolean;
    delayMs: number;
    sendDelayMs: number;
    simSendDelayMs: number;
    nonHostOverrides: Map<number, { email?: string; name?: string }>;
    role: string;
    localMode: boolean;
    dataDir: string;
    fmHostEmail: string | undefined;
} {
    const rawArgv = process.argv.slice(2);

    // Pre-scan for --host-config, --role, and the sim file (sole positional).
    // --key=value args are split on the first '=' so downstream regex matching works.
    let hostConfigPath: string | undefined;
    let simFilePath: string | undefined;
    let roleArg: string | undefined;
    const cliFlags: string[] = [];

    for (let i = 0; i < rawArgv.length; i++) {
        const arg = rawArgv[i];
        if (arg === '--host-config') {
            hostConfigPath = rawArgv[++i];
        } else if (arg === '--role') {
            roleArg = rawArgv[++i];
        } else if (arg.startsWith('--') && arg.includes('=')) {
            // Split --key=value into two tokens so switch/regex matching works uniformly.
            const eqPos = arg.indexOf('=');
            cliFlags.push(arg.slice(0, eqPos), arg.slice(eqPos + 1));
        } else if (arg.startsWith('--')) {
            if (BOOLEAN_OPTIONS.has(arg.slice(2))) {
                cliFlags.push(arg);
            } else {
                cliFlags.push(arg, rawArgv[++i]);
            }
        } else {
            simFilePath = arg;
        }
    }

    if (!hostConfigPath || !simFilePath) {
        console.error('Usage: npx tsx run-live-sim.ts --host-config <file> <sim-file> [options]');
        process.exit(1);
    }

    const NON_HOST_ROLE_RE = /^non-host-user-(\d+)$/;
    if (roleArg !== undefined && roleArg !== 'host' && !NON_HOST_ROLE_RE.test(roleArg)) {
        console.error(
            `Invalid --role value: "${roleArg}". ` +
            `Valid values are: host, non-host-user-1, non-host-user-2, ...`
        );
        process.exit(1);
    }

    // ── Host config ────────────────────────────────────────────────────────────

    const argv = [...loadConfigFile(hostConfigPath), ...cliFlags];

    let hostEmail = '';
    let hostName  = '';
    let imapHost = '', imapPort = 993, imapSecure = false, imapUser = '', imapPass = '';
    let smtpHost = '', smtpPort = 465, smtpSecure = false, smtpUser = '', smtpPass = '';
    let sinceStr = '';
    let archiveFolder: string | undefined;
    let allowSelfSigned = false;
    let verbose = false;
    let delayMs = 10000;
    let sendDelayMs = 0;
    let simSendDelayMs = 0;
    let localMode = false;
    let dataDir = './sim_data';
    let fmHostEmail: string | undefined;
    const nonHostOverrides = new Map<number, { email?: string; name?: string }>();

    for (let i = 0; i < argv.length; i++) {
        const arg  = argv[i];
        const next = argv[i + 1];
        switch (arg) {
            case '--host-email':        hostEmail       = next; i++; break;
            case '--host-name':         hostName        = next; i++; break;
            case '--imap-host':         imapHost        = next; i++; break;
            case '--imap-port':         imapPort        = parseInt(next, 10); i++; break;
            case '--imap-secure':       imapSecure      = true; break;
            case '--imap-user':         imapUser        = next; i++; break;
            case '--imap-pass':         imapPass        = next; i++; break;
            case '--smtp-host':         smtpHost        = next; i++; break;
            case '--smtp-port':         smtpPort        = parseInt(next, 10); i++; break;
            case '--smtp-secure':       smtpSecure      = true; break;
            case '--smtp-user':         smtpUser        = next; i++; break;
            case '--smtp-pass':         smtpPass        = next; i++; break;
            case '--since':             sinceStr        = next; i++; break;
            case '--archive-folder':    archiveFolder   = next; i++; break;
            case '--allow-self-signed': allowSelfSigned = true; break;
            case '--verbose':           verbose         = true; break;
            case '--delay':             delayMs         = parseInt(next, 10); i++; break;
            case '--send-delay':        sendDelayMs     = parseInt(next, 10) * 1000; i++; break;
            case '--sim-send-delay':    simSendDelayMs  = parseInt(next, 10) * 1000; i++; break;
            case '--local':             localMode       = true; break;
            case '--data-dir':          dataDir         = next; i++; break;
            case '--fm-host':           fmHostEmail     = next; i++; break;
            default:
                if (arg.startsWith('--')) {
                    const emailMatch    = arg.match(/^--non-host-email-(\d+)$/);
                    const nameMatch     = arg.match(/^--non-host-name-(\d+)$/);
                    const userFlagMatch = arg.match(/^--non-host-user-(\d+)$/);
                    if (emailMatch) {
                        const n = parseInt(emailMatch[1], 10);
                        const ov = nonHostOverrides.get(n) ?? {};
                        ov.email = next; i++;
                        nonHostOverrides.set(n, ov);
                    } else if (nameMatch) {
                        const n = parseInt(nameMatch[1], 10);
                        const ov = nonHostOverrides.get(n) ?? {};
                        ov.name = next; i++;
                        nonHostOverrides.set(n, ov);
                    } else if (userFlagMatch) {
                        // --non-host-user-N=<email> is a shorthand for --non-host-email-N=<email>
                        const n = parseInt(userFlagMatch[1], 10);
                        const ov = nonHostOverrides.get(n) ?? {};
                        ov.email = next; i++;
                        nonHostOverrides.set(n, ov);
                    }
                    // else silently ignore unrecognised keys (e.g. interval= from shared config).
                }
        }
    }

    const missing: string[] = [];
    if (!hostEmail) missing.push('host-email');
    if (!localMode) {
        if (!imapHost) missing.push('imap-host');
        if (!smtpHost) missing.push('smtp-host');
    }
    if (missing.length > 0) {
        console.error(`Missing required host config options: ${missing.join(', ')}`);
        process.exit(1);
    }

    if (!hostName) {
        const local = hostEmail.split('@')[0];
        hostName = local.charAt(0).toUpperCase() + local.slice(1);
    }

    // If --role non-host-user-N was given, inject host identity as that non-host slot
    // (only when the caller has not already explicitly provided those overrides).
    if (roleArg && roleArg !== 'host') {
        const roleMatch = roleArg.match(NON_HOST_ROLE_RE);
        if (roleMatch) {
            const n = parseInt(roleMatch[1], 10);
            const ov = nonHostOverrides.get(n) ?? {};
            if (ov.email === undefined) ov.email = hostEmail;
            if (ov.name  === undefined) ov.name  = hostName;
            nonHostOverrides.set(n, ov);
        }
    }

    const rawSinceDate = sinceStr
        ? new Date(sinceStr)
        : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
    const sinceDate = new Date(Math.max(rawSinceDate.getTime(), FRIENDLYMAIL_EPOCH.getTime()));

    return {
        config: {
            hostEmail,
            hostName,
            imapHost, imapPort, imapSecure,
            imapUser: imapUser || hostEmail,
            imapPass,
            smtpHost, smtpPort, smtpSecure,
            smtpUser: smtpUser || hostEmail,
            smtpPass,
            sinceDate,
            archiveFolder,
            allowSelfSigned,
        },
        simFile: simFilePath,
        verbose,
        delayMs,
        sendDelayMs,
        simSendDelayMs,
        nonHostOverrides,
        role: roleArg ?? 'host',
        localMode,
        dataDir: path.resolve(process.cwd(), dataDir),
        fmHostEmail,
    };
}

// ── Placeholder substitution ──────────────────────────────────────────────────

function applyPlaceholders(
    content: string,
    hostEmail: string,
    hostName: string,
    nonHostOverrides: Map<number, { email?: string; name?: string }>,
    fmHostEmail?: string,
): string {
    // [host] always refers to the friendlymail service host, not necessarily
    // the current instance's own email. fmHostEmail overrides when set (used by
    // non-host instances so their messages are correctly addressed to the service).
    const effectiveHostEmail = fmHostEmail ?? hostEmail;
    const effectiveHostName  = fmHostEmail ? effectiveHostEmail.split('@')[0] : hostName;
    const hostFull = `${effectiveHostName} <${effectiveHostEmail}>`;
    let result = content
        .replace(/\[host\]/g,       hostFull)
        .replace(/\[host-name\]/g,  effectiveHostName)
        .replace(/\[host-email\]/g, `<${effectiveHostEmail}>`);
    for (let i = 0; i < TEST_USERS.length; i++) {
        const n = i + 1;
        const base = TEST_USERS[i];
        const ov   = nonHostOverrides.get(n) ?? {};
        const name  = ov.name  ?? base.name;
        const email = ov.email ?? base.email;
        result = result
            .replace(new RegExp(`\\[non-host-name-${n}\\]`,  'g'), name)
            .replace(new RegExp(`\\[non-host-email-${n}\\]`, 'g'), email)
            .replace(new RegExp(`\\[non-host-${n}\\]`,       'g'), `${name} <${email}>`);
    }
    return result;
}

// ── Message file parsing ───────────────────────────────────────────────────────

interface ParsedSimMessage {
    from: string;
    to: string;
    subject: string;
    body: string;
    attachmentPath: string | undefined;
}

function parseSimMessageFile(
    filePath: string,
    hostEmail: string,
    hostName: string,
    nonHostOverrides: Map<number, { email?: string; name?: string }>,
    fmHostEmail?: string,
): ParsedSimMessage {
    const raw = fs.readFileSync(filePath, 'utf8');
    const content = applyPlaceholders(raw, hostEmail, hostName, nonHostOverrides, fmHostEmail);
    const lines = content.split('\n');

    let from = '', to = '', subject = '';
    let attachmentPath: string | undefined;
    let inBody = false;
    let body = '';
    let currentHeader = '';
    let currentValue = '';

    const applyHeader = (h: string, v: string) => {
        switch (h.toLowerCase()) {
            case 'from':       from = v; break;
            case 'to':         to   = v; break;
            case 'subject':    subject = v; break;
            case 'attachment': attachmentPath = v; break;
            // Date and Message-ID are ignored — we use current time and generate a fresh ID.
        }
    };

    for (const line of lines) {
        if (!inBody) {
            if (line.trim() === '') {
                if (currentHeader) applyHeader(currentHeader, currentValue);
                currentHeader = '';
                currentValue = '';
                inBody = true;
                continue;
            }
            if ((line.startsWith(' ') || line.startsWith('\t')) && currentHeader) {
                currentValue += ' ' + line.trim();
                continue;
            }
            if (currentHeader) applyHeader(currentHeader, currentValue);
            const match = line.match(/^([^:]+):\s*(.*)$/);
            if (match) {
                currentHeader = match[1].trim();
                currentValue  = match[2].trim();
            } else {
                currentHeader = '';
                currentValue  = '';
            }
        } else {
            if (body === '' && line.trim() === '') continue;
            body += line + '\n';
        }
    }
    if (!inBody && currentHeader) applyHeader(currentHeader, currentValue);
    body = body.trim();

    if (!from || !to || !subject) {
        throw new Error(`Missing required header(s) in ${filePath} (from="${from}" to="${to}" subject="${subject}")`);
    }

    return { from, to, subject, body, attachmentPath };
}

function parseMailtoUrl(url: string, hostEmail: string, hostName: string): ParsedSimMessage | null {
    if (!url.startsWith('mailto:')) return null;
    const rest = url.slice('mailto:'.length);
    const qIndex = rest.indexOf('?');
    const to = qIndex === -1 ? rest : rest.slice(0, qIndex);
    if (!to) return null;
    const params = new URLSearchParams(qIndex === -1 ? '' : rest.slice(qIndex + 1));
    return {
        from:           `${hostName} <${hostEmail}>`,
        to,
        subject:        params.get('subject') ?? '',
        body:           params.get('body') ?? '',
        attachmentPath: undefined,
    };
}

// ── RFC 2822 message builder ───────────────────────────────────────────────────

function buildRfc2822(msg: ParsedSimMessage, filePath: string | null): Buffer {
    const fromDomain = msg.from.includes('@') ? msg.from.split('@').pop() : 'live-sim';
    const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${fromDomain}>`;
    const date  = new Date().toUTCString();

    if (!msg.attachmentPath) {
        // Plain text message.
        const raw = [
            `From: ${msg.from}`,
            `To: ${msg.to}`,
            `Subject: ${msg.subject}`,
            `Date: ${date}`,
            `Message-ID: ${msgId}`,
            `MIME-Version: 1.0`,
            `Content-Type: text/plain; charset=utf-8`,
            '',
            msg.body,
        ].join('\r\n');
        return Buffer.from(raw);
    }

    // Multipart message with photo attachment.
    const sourceDir = filePath ? path.dirname(filePath) : process.cwd();
    const fullPath  = path.resolve(sourceDir, msg.attachmentPath);
    const ext = path.extname(msg.attachmentPath).toLowerCase();
    const contentTypeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.png': 'image/png',  '.gif':  'image/gif',
        '.webp': 'image/webp',
    };
    const attachContentType = contentTypeMap[ext];
    if (!attachContentType) {
        throw new Error(`Unsupported attachment type '${ext}' in ${msg.attachmentPath}`);
    }
    const attachData   = fs.readFileSync(fullPath);
    const attachBase64 = attachData.toString('base64');
    const filename     = path.basename(msg.attachmentPath);
    const boundary     = `live-sim-boundary-${Date.now()}`;

    const raw = [
        `From: ${msg.from}`,
        `To: ${msg.to}`,
        `Subject: ${msg.subject}`,
        `Date: ${date}`,
        `Message-ID: ${msgId}`,
        `MIME-Version: 1.0`,
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        `Content-Type: text/plain; charset=utf-8`,
        '',
        msg.body,
        '',
        `--${boundary}`,
        `Content-Type: ${attachContentType}`,
        `Content-Disposition: attachment; filename="${filename}"`,
        `Content-Transfer-Encoding: base64`,
        '',
        attachBase64,
        '',
        `--${boundary}--`,
    ].join('\r\n');
    return Buffer.from(raw);
}

// ── Host SMTP send ────────────────────────────────────────────────────────────

/** Send a sim message via the host SMTP server. */
async function sendViaHostSmtp(rawMessage: Buffer, config: Config): Promise<void> {
    const transporter = nodemailer.createTransport({
        host:   config.smtpHost,
        port:   config.smtpPort,
        secure: config.smtpSecure,
        auth:   { user: config.smtpUser, pass: config.smtpPass },
        tls:    { rejectUnauthorized: !config.allowSelfSigned },
    });
    await transporter.sendMail({
        envelope: { from: config.smtpUser, to: config.hostEmail },
        raw: rawMessage,
    });
}

// ── Config test ───────────────────────────────────────────────────────────────

/**
 * Parse a config file and test its SMTP and IMAP credentials.
 * Works for both host configs (SMTP + IMAP) and non-host configs (SMTP only).
 */
async function runTestConfig(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
        console.error(`Config file not found: ${filePath}`);
        process.exit(1);
    }

    const argv = loadConfigFile(filePath);

    let smtpHost = '', smtpPort = 587, smtpSecure = false, smtpUser = '', smtpPass = '';
    let imapHost = '', imapPort = 993, imapSecure = false, imapUser = '', imapPass = '';
    let allowSelfSigned = false;

    for (let i = 0; i < argv.length; i++) {
        const arg  = argv[i];
        const next = argv[i + 1];
        switch (arg) {
            case '--smtp-host':         smtpHost        = next; i++; break;
            case '--smtp-port':         smtpPort        = parseInt(next, 10); i++; break;
            case '--smtp-secure':       smtpSecure      = true; break;
            case '--smtp-user':         smtpUser        = next; i++; break;
            case '--smtp-pass':         smtpPass        = next; i++; break;
            case '--imap-host':         imapHost        = next; i++; break;
            case '--imap-port':         imapPort        = parseInt(next, 10); i++; break;
            case '--imap-secure':       imapSecure      = true; break;
            case '--imap-user':         imapUser        = next; i++; break;
            case '--imap-pass':         imapPass        = next; i++; break;
            case '--allow-self-signed': allowSelfSigned = true; break;
        }
    }

    console.log(`Testing config: ${filePath}\n`);
    let anyFailed = false;

    // Test SMTP
    if (smtpHost) {
        process.stdout.write(`  SMTP  ${smtpUser}@${smtpHost}:${smtpPort} (secure=${smtpSecure}) … `);
        try {
            const transporter = nodemailer.createTransport({
                host:   smtpHost,
                port:   smtpPort,
                secure: smtpSecure,
                auth:   { user: smtpUser, pass: smtpPass },
                tls:    { rejectUnauthorized: !allowSelfSigned },
            });
            await transporter.verify();
            console.log('OK');
        } catch (err) {
            console.log(`FAIL: ${(err as Error).message}`);
            anyFailed = true;
        }
    } else {
        console.log('  SMTP  (no smtp-host configured)');
    }

    // Test IMAP
    if (imapHost) {
        const user = imapUser || smtpUser;
        process.stdout.write(`  IMAP  ${user}@${imapHost}:${imapPort} (secure=${imapSecure}) … `);
        const client = new ImapFlow({
            host:   imapHost,
            port:   imapPort,
            secure: imapSecure,
            auth:   { user, pass: imapPass },
            logger: false,
            tls:    { rejectUnauthorized: !allowSelfSigned },
        });
        try {
            await client.connect();
            await client.logout();
            console.log('OK');
        } catch (err) {
            console.log(`FAIL: ${(err as Error).message}`);
            anyFailed = true;
            try { client.close(); } catch { /* ignore */ }
        }
    } else {
        console.log('  IMAP  (no imap-host configured)');
    }

    process.exit(anyFailed ? 1 : 0);
}

// ── Local-mode helpers ────────────────────────────────────────────────────────

/** Build a SimpleMessageWithMessageId from a ParsedSimMessage and a step number. */
function buildSimMessage(
    msg: ParsedSimMessage,
    stepNum: number,
): SimpleMessageWithMessageId {
    const fromAddr = EmailAddress.fromDisplayString(msg.from);
    if (!fromAddr) throw new Error(`Invalid From address: "${msg.from}"`);
    const toAddrs = msg.to.split(',')
        .map(e => EmailAddress.fromDisplayString(e.trim()))
        .filter((a): a is EmailAddress => a !== null);
    if (toAddrs.length === 0) throw new Error(`Invalid To address: "${msg.to}"`);

    const fromNameMatch = msg.from.match(/^(.+?)\s*<[^>]+>$/);
    const fromName = fromNameMatch ? fromNameMatch[1].replace(/^"|"$/g, '').trim() : undefined;

    return new SimpleMessageWithMessageId(
        fromAddr,
        toAddrs,
        msg.subject,
        msg.body,
        new Date(),
        undefined,
        undefined,
        `<${crypto.randomUUID()}@local-sim>`,
        undefined,
        fromName,
        String(stepNum)
    );
}

function extractSimRoles(simFile: string): string[] {
    const roles = new Set<string>(['host']);
    for (const line of fs.readFileSync(simFile, 'utf8').split('\n')) {
        const m = line.trim().match(/^if-role\s+(.+)$/);
        if (m) roles.add(m[1].trim());
    }
    return [...roles];
}

function presencePath(dataDir: string, role: string): string {
    return path.join(dataDir, `.sim-present-${role}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main(): Promise<void> {
    // --test-config is handled before full arg parsing (no sim file required).
    const testConfigIndex = process.argv.indexOf('--test-config');
    if (testConfigIndex !== -1) {
        const testConfigPath = process.argv[testConfigIndex + 1];
        if (!testConfigPath || testConfigPath.startsWith('--')) {
            console.error('--test-config requires a file path argument');
            process.exit(1);
        }
        await runTestConfig(testConfigPath);
        return;
    }

    const { config, simFile, verbose, delayMs, sendDelayMs, simSendDelayMs, nonHostOverrides, role, localMode, dataDir, fmHostEmail } = parseArgs();

    if (!fs.existsSync(simFile)) {
        console.error(`Sim file not found: ${simFile}`);
        process.exit(1);
    }

    console.log(`friendlymail live sim`);
    console.log(`  host:      ${config.hostEmail}`);
    if (localMode) {
        console.log(`  local:     ${dataDir}`);
    } else {
        console.log(`  IMAP:      ${config.imapHost}:${config.imapPort}`);
        console.log(`  SMTP:      ${config.smtpHost}:${config.smtpPort}`);
        console.log(`  since:     ${config.sinceDate.toISOString().slice(0, 10)}`);
    }
    console.log(`  sim:       ${simFile}`);
    console.log(`  role:      ${role}`);
    console.log('');

    const hostAddress = EmailAddress.fromString(config.hostEmail)!;

    // ── Provider setup ─────────────────────────────────────────────────────────

    let localProvider: LocalSimMailProvider | null = null;
    let peerPresenceFiles: string[] = [];

    if (localMode) {
        const PEER_WAIT_MS = 30_000;
        const allRoles = extractSimRoles(simFile);
        const peerRoles = allRoles.filter(r => r !== role);
        peerPresenceFiles = peerRoles.map(r => presencePath(dataDir, r));

        if (role === 'host') {
            // Host clears the data dir first, then creates its provider and writes its
            // presence file so non-host instances know it is safe to create their own dirs.
            if (fs.existsSync(dataDir)) {
                fs.rmSync(dataDir, { recursive: true, force: true });
            }
        } else {
            // Non-host instances wait for the host's presence file before creating
            // their LocalSimMailProvider so the host's rmSync cannot race with mkdirSync.
            const hostPresence = presencePath(dataDir, 'host');
            const waitDeadline = Date.now() + PEER_WAIT_MS;
            while (!fs.existsSync(hostPresence) && Date.now() < waitDeadline) {
                await sleep(200);
            }
            if (!fs.existsSync(hostPresence)) {
                console.error('  timed out waiting for host instance to start');
                process.exit(1);
            }
        }

        localProvider = new LocalSimMailProvider(config.hostEmail, config.hostName, dataDir);

        // Write a presence file so other instances know this role is running.
        // Left on disk after exit — the host clears the entire dataDir on the next run.
        const ownPresenceFile = presencePath(dataDir, role);
        fs.writeFileSync(ownPresenceFile, String(process.pid));

        if (peerRoles.length > 0) {
            const peerDeadline = Date.now() + PEER_WAIT_MS;
            console.log(`  waiting for peer instance(s) to start: ${peerRoles.join(', ')}`);
            while (Date.now() < peerDeadline) {
                if (peerPresenceFiles.every(p => fs.existsSync(p))) break;
                await sleep(500);
            }
            const missingPeers = peerRoles.filter(r => !fs.existsSync(presencePath(dataDir, r)));
            if (missingPeers.length > 0) {
                console.error(`  timed out waiting for peer instance(s) to start: ${missingPeers.join(', ')}`);
                process.exit(1);
            }
            console.log(`  all peer instances ready\n`);
        }
    }

    const provider = localMode
        ? localProvider!
        : new EmailMailProvider(
            {
                host: config.smtpHost, port: config.smtpPort,
                secure: config.smtpSecure,
                auth: { user: config.smtpUser, pass: config.smtpPass },
                allowSelfSigned: config.allowSelfSigned,
            },
            {
                host: config.imapHost, port: config.imapPort,
                secure: config.imapSecure,
                auth: { user: config.imapUser, pass: config.imapPass },
                allowSelfSigned: config.allowSelfSigned,
                sinceDate: config.sinceDate,
                archiveFolder: config.archiveFolder,
            },
            verbose
        );

    let _user: User | null = null;
    const socialNetwork: ISocialNetwork = {
        getUser: () => _user!,
        setUser: (user: User) => { _user = user; },
    };

    const daemon = new Daemon(
        hostAddress, provider, provider, socialNetwork,
        verbose, 'cid',
        () => provider.hostDisplayName ?? config.hostName,
        sendDelayMs
    );

    const WAIT_FOR_INBOUND_POLL_MS  = 5_000;
    const WAIT_FOR_INBOUND_TIMEOUT_MS = 5 * 60_000;

    /**
     * Wait for an inbound message matching stepFilter.
     * In local mode, delegates to LocalSimMailProvider.waitForInbound() (filesystem polling).
     * In email mode, polls IMAP using a temporary provider scoped to now.
     */
    async function waitForInbound(stepFilter: number): Promise<void> {
        if (localMode) {
            await localProvider!.waitForInbound(stepFilter, peerPresenceFiles);
            return;
        }

        const sinceDate = new Date();
        const deadline  = sinceDate.getTime() + WAIT_FOR_INBOUND_TIMEOUT_MS;
        const desc = `step=${stepFilter}`;

        console.log(`  waiting for inbound: ${desc}`);

        // Build a temporary provider that only looks at mail since now.
        const pollProvider = new EmailMailProvider(
            {
                host: config.smtpHost, port: config.smtpPort,
                secure: config.smtpSecure,
                auth: { user: config.smtpUser, pass: config.smtpPass },
                allowSelfSigned: config.allowSelfSigned,
            },
            {
                host: config.imapHost, port: config.imapPort,
                secure: config.imapSecure,
                auth: { user: config.imapUser, pass: config.imapPass },
                allowSelfSigned: config.allowSelfSigned,
                sinceDate,
                archiveFolder: config.archiveFolder,
            },
            false
        );

        while (Date.now() < deadline) {
            await sleep(WAIT_FOR_INBOUND_POLL_MS);

            let messages: SimpleMessageWithMessageId[];
            try {
                messages = await pollProvider.getMessages();
            } catch (err) {
                console.log(`  wait-for-inbound: poll error (${(err as Error).message}) — retrying…`);
                continue;
            }

            for (const msg of messages) {
                if (msg.xSimStep !== String(stepFilter)) continue;
                console.log(`  wait-for-inbound: matched  step=${stepFilter}  from="${msg.from}"  subject="${msg.subject}"`);
                return;
            }
        }

        console.error(`  wait-for-inbound: timed out after ${WAIT_FOR_INBOUND_TIMEOUT_MS / 1000}s waiting for ${desc}`);
        process.exit(1);
    }

    const lines = fs.readFileSync(simFile, 'utf8').split('\n');
    let started = false;
    let stepNum = 0;
    // Role gating: when non-null, we are inside an if-role block for a different role.
    let skippingRole: string | null = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Handle if-role / end-role before the step counter so skipped lines
        // do not consume step numbers.
        if (trimmed.startsWith('if-role ')) {
            const blockRole = trimmed.slice(8).trim();
            if (blockRole !== role) {
                skippingRole = blockRole;
            }
            continue;
        }
        if (trimmed === 'end-role') {
            skippingRole = null;
            continue;
        }
        if (skippingRole !== null) continue;

        // Coordination-only commands do not consume a step number.
        const isCoordCmd = trimmed.startsWith('wait-for-inbound') || trimmed.startsWith('wait-for-message');
        if (!isCoordCmd) stepNum++;
        console.log(`[step ${isCoordCmd ? '-' : stepNum}] ${trimmed}`);

        if (trimmed === 'q') break;

        if (trimmed === 'start' || trimmed === 'run' || trimmed === 'send') {
            await daemon.run();
            started = true;
            if (delayMs > 0) await sleep(delayMs);

        } else if (trimmed.startsWith('load ')) {
            const fileArg = trimmed.slice(5).trim();
            if (!fileArg) { console.error('  error: no file specified'); continue; }

            let filePath = fileArg;
            if (!path.isAbsolute(filePath)) filePath = path.resolve(process.cwd(), filePath);
            if (!fs.existsSync(filePath)) {
                console.error(`  error: file not found: ${filePath}`);
                continue;
            }

            let parsedMsg: ParsedSimMessage;
            try {
                parsedMsg = parseSimMessageFile(filePath, config.hostEmail, config.hostName, nonHostOverrides, fmHostEmail);
            } catch (err) {
                console.error(`  error parsing message file: ${(err as Error).message}`);
                continue;
            }

            if (localMode) {
                if (parsedMsg.attachmentPath) {
                    console.log(`  warning: attachments not supported in local mode — skipping attachment`);
                }
                const simMsg = buildSimMessage(parsedMsg, stepNum);
                localProvider!.writeToOwnInbox(simMsg);
                // Also deliver to each recipient's inbox so peer wait-for-inbound can detect it.
                for (const recipient of simMsg.to) {
                    const recipientEmail = recipient.toString();
                    if (recipientEmail !== config.hostEmail) {
                        localProvider!.writeToInbox(simMsg, recipientEmail);
                    }
                }
                console.log(`  loaded to inbox: from="${parsedMsg.from}"  subject="${parsedMsg.subject}"`);
            } else {
                if (parsedMsg.attachmentPath) {
                    console.log(`  sending with attachment: ${parsedMsg.attachmentPath}`);
                }
                const rawBase = buildRfc2822(parsedMsg, filePath);
                const simStepHeader = Buffer.from(`X-Sim-Step: ${stepNum}\r\n`);
                const raw = Buffer.concat([simStepHeader, rawBase]);
                await sendViaHostSmtp(raw, config);
                console.log(`  sent via host SMTP: from="${parsedMsg.from}"  subject="${parsedMsg.subject}"`);
                if (simSendDelayMs > 0) await sleep(simSendDelayMs);
            }

            await daemon.run();
            started = true;
            if (delayMs > 0) await sleep(delayMs);

        } else if (trimmed.startsWith('send ')) {
            const arg = trimmed.slice(5).trim().replace(/^["']|["']$/g, '');
            const parsedMsg = parseMailtoUrl(arg, config.hostEmail, config.hostName);
            if (!parsedMsg) {
                console.error(`  error: invalid mailto URL: ${arg}`);
                continue;
            }

            if (localMode) {
                const simMsg = buildSimMessage(parsedMsg, stepNum);
                localProvider!.writeToOwnInbox(simMsg);
                console.log(`  loaded to inbox: from="${parsedMsg.from}"  subject="${parsedMsg.subject}"`);
            } else {
                const raw = buildRfc2822(parsedMsg, null);
                await sendViaHostSmtp(raw, config);
                console.log(`  sent via host SMTP: from="${parsedMsg.from}"  subject="${parsedMsg.subject}"`);
                if (simSendDelayMs > 0) await sleep(simSendDelayMs);
            }

            await daemon.run();
            started = true;
            if (delayMs > 0) await sleep(delayMs);

        } else if (trimmed.startsWith('wait-for-inbound')) {
            const rest = trimmed.slice('wait-for-inbound'.length).trim();
            const stepMatch = rest.match(/(?:^|\s)step=(\d+)/);
            if (!stepMatch) {
                console.error(`  error: wait-for-inbound requires step=<N> (e.g. wait-for-inbound step=3)`);
                continue;
            }
            await waitForInbound(parseInt(stepMatch[1], 10));

        } else if (trimmed.startsWith('wait-for-message')) {
            if (!localMode || !localProvider) {
                console.error(`  error: wait-for-message is only supported in --local mode`);
                continue;
            }
            const rest = trimmed.slice('wait-for-message'.length).trim();
            const typeMatch = rest.match(/(?:^|\s)type=(\S+)/);
            if (!typeMatch) {
                console.error(`  error: wait-for-message requires type=<messageType> (e.g. wait-for-message type=invite)`);
                continue;
            }
            await localProvider.waitForMessage(typeMatch[1]);

        } else {
            console.error(`  unknown command: ${trimmed}`);
        }
    }

    void started; // suppress unused-variable warning if sim has no start command
    console.log('\nSim complete.');
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
