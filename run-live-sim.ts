#!/usr/bin/env node

/**
 * run-live-sim.ts
 *
 * Runs a .sim script against one or two real email accounts.
 *
 * Single-account mode (host only):
 *   All messages (including those from non-host/test addresses) are sent via the
 *   host SMTP account. Non-host addresses must use the default @test.com
 *   placeholders.
 *
 * Two-account mode (host + non-host):
 *   Messages from the configured non-host user are sent via the non-host SMTP
 *   account, so they arrive in the host INBOX through normal delivery. All other
 *   messages are sent via the host SMTP account. The non-host config covers
 *   exactly one real external account.
 *
 * Usage:
 *   npx tsx run-live-sim.ts --host-config <file> [--non-host-config <file>] <sim-file> [options]
 *
 * Options:
 *   --host-config <file>      Required. Key=value config for the host account.
 *   --non-host-config <file>  Optional. Key=value config for the non-host account.
 *   --test-config <file>      Test SMTP/IMAP login for the given config file and exit.
 *   --verbose                 Print a summary of each sent message after each step.
 *   --delay <ms>              Milliseconds to wait after each daemon run (default: 10000).
 *                             Increase if the mail server is slow to deliver.
 *   --send-delay <s>          Seconds to wait between sending each draft within a
 *                             daemon run (default: 0).
 *   --sim-send-delay <s>      Seconds to wait after the live-sim sends each message
 *                             before triggering the daemon run (default: 0). Use this to
 *                             rate-limit outbound messages to one per period.
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
 *   allow-self-signed=false      # optional
 *   non-host-email-1=alice@real.com   # optional — override fake test user email
 *   non-host-name-1=Alice Real        # optional — override fake test user name
 *
 * Non-host config file format (key=value):
 *   smtp-host=smtp.mail.me.com
 *   smtp-port=587
 *   smtp-secure=true
 *   smtp-user=alice@icloud.com
 *   smtp-pass=$ICLOUD_PASS
 *   name=Alice Real              # optional display name
 *   allow-self-signed=false      # optional
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
import { ImapFlow } from 'imapflow';
import * as nodemailer from 'nodemailer';
import { Daemon } from './src/models/Daemon';
import { EmailMailProvider } from './src/models/EmailMailProvider';
import { EmailAddress } from './src/models/EmailAddress.impl';
import { ISocialNetwork } from './src/models/SocialNetwork.interface';
import { User } from './src/models/User.impl';

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
    allowSelfSigned: boolean;
}

/** SMTP credentials for a single real non-host account used in two-account mode. */
interface NonHostConfig {
    /** Resolved email address — defaults to smtp-user if not set explicitly. */
    email: string;
    /** Display name — defaults to the local-part of the email. */
    name: string;
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
    allowSelfSigned: boolean;
}

// ── Config loading ─────────────────────────────────────────────────────────────

const BOOLEAN_OPTIONS = new Set([
    'imap-secure', 'smtp-secure', 'allow-self-signed', 'verbose',
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
    nonHostConfig: NonHostConfig | null;
    simFile: string;
    verbose: boolean;
    delayMs: number;
    sendDelayMs: number;
    simSendDelayMs: number;
    nonHostOverrides: Map<number, { email?: string; name?: string }>;
} {
    const rawArgv = process.argv.slice(2);

    // Pre-scan for --host-config, --non-host-config, and the sim file (sole positional).
    let hostConfigPath: string | undefined;
    let nonHostConfigPath: string | undefined;
    let simFilePath: string | undefined;
    const cliFlags: string[] = [];

    for (let i = 0; i < rawArgv.length; i++) {
        const arg = rawArgv[i];
        if (arg === '--host-config') {
            hostConfigPath = rawArgv[++i];
        } else if (arg === '--non-host-config') {
            nonHostConfigPath = rawArgv[++i];
        } else if (arg.startsWith('--')) {
            cliFlags.push(arg);
        } else if (arg.includes('=')) {
            // Inline key=value override (same syntax as config file entries).
            cliFlags.push(...configEntryToArgv(arg));
        } else {
            simFilePath = arg;
        }
    }

    if (!hostConfigPath || !simFilePath) {
        console.error('Usage: npx tsx run-live-sim.ts --host-config <file> [--non-host-config <file>] <sim-file> [options]');
        process.exit(1);
    }

    // ── Host config ────────────────────────────────────────────────────────────

    const argv = [...loadConfigFile(hostConfigPath), ...cliFlags];

    let hostEmail = '';
    let hostName  = '';
    let imapHost = '', imapPort = 993, imapSecure = false, imapUser = '', imapPass = '';
    let smtpHost = '', smtpPort = 465, smtpSecure = false, smtpUser = '', smtpPass = '';
    let sinceStr = '';
    let allowSelfSigned = false;
    let verbose = false;
    let delayMs = 10000;
    let sendDelayMs = 0;
    let simSendDelayMs = 0;
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
            case '--allow-self-signed': allowSelfSigned = true; break;
            case '--verbose':           verbose         = true; break;
            case '--delay':             delayMs         = parseInt(next, 10); i++; break;
            case '--send-delay':        sendDelayMs     = parseInt(next, 10) * 1000; i++; break;
            case '--sim-send-delay':    simSendDelayMs  = parseInt(next, 10) * 1000; i++; break;
            default:
                if (arg.startsWith('--')) {
                    const emailMatch = arg.match(/^--non-host-email-(\d+)$/);
                    const nameMatch  = arg.match(/^--non-host-name-(\d+)$/);
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
                    }
                    // else silently ignore unrecognised keys (e.g. interval= from shared config).
                }
        }
    }

    const missing: string[] = [];
    if (!hostEmail) missing.push('host-email');
    if (!imapHost)  missing.push('imap-host');
    if (!smtpHost)  missing.push('smtp-host');
    if (missing.length > 0) {
        console.error(`Missing required host config options: ${missing.join(', ')}`);
        process.exit(1);
    }

    if (!hostName) {
        const local = hostEmail.split('@')[0];
        hostName = local.charAt(0).toUpperCase() + local.slice(1);
    }

    const sinceDate = sinceStr
        ? new Date(sinceStr)
        : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();

    // ── Non-host config (optional) ─────────────────────────────────────────────

    let nonHostConfig: NonHostConfig | null = null;

    if (nonHostConfigPath) {
        const nhArgv = loadConfigFile(nonHostConfigPath);

        let nhName = '', nhEmail = '';
        let nhSmtpHost = '', nhSmtpPort = 587, nhSmtpSecure = false;
        let nhSmtpUser = '', nhSmtpPass = '';
        let nhAllowSelfSigned = false;

        for (let i = 0; i < nhArgv.length; i++) {
            const arg  = nhArgv[i];
            const next = nhArgv[i + 1];
            switch (arg) {
                case '--name':            nhName           = next; i++; break;
                case '--smtp-host':       nhSmtpHost       = next; i++; break;
                case '--smtp-port':       nhSmtpPort       = parseInt(next, 10); i++; break;
                case '--smtp-secure':     nhSmtpSecure     = true; break;
                case '--smtp-user':       nhSmtpUser       = next; i++; break;
                case '--smtp-pass':       nhSmtpPass       = next; i++; break;
                case '--allow-self-signed': nhAllowSelfSigned = true; break;
                // Silently ignore unrecognised keys.
            }
        }

        const nhMissing: string[] = [];
        if (!nhSmtpHost) nhMissing.push('smtp-host');
        if (!nhSmtpUser) nhMissing.push('smtp-user');
        if (nhMissing.length > 0) {
            console.error(`Missing required non-host config options: ${nhMissing.join(', ')}`);
            process.exit(1);
        }

        nhEmail = nhEmail || nhSmtpUser;
        if (!nhName) {
            const local = nhEmail.split('@')[0];
            nhName = local.charAt(0).toUpperCase() + local.slice(1);
        }

        nonHostConfig = {
            email: nhEmail,
            name:  nhName,
            smtpHost: nhSmtpHost,
            smtpPort: nhSmtpPort,
            smtpSecure: nhSmtpSecure,
            smtpUser: nhSmtpUser,
            smtpPass: nhSmtpPass,
            allowSelfSigned: nhAllowSelfSigned,
        };
    }

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
            allowSelfSigned,
        },
        nonHostConfig,
        simFile: simFilePath,
        verbose,
        delayMs,
        sendDelayMs,
        simSendDelayMs,
        nonHostOverrides,
    };
}

// ── Placeholder substitution ──────────────────────────────────────────────────

function applyPlaceholders(
    content: string,
    hostEmail: string,
    hostName: string,
    nonHostOverrides: Map<number, { email?: string; name?: string }>,
): string {
    const hostFull = `${hostName} <${hostEmail}>`;
    let result = content
        .replace(/\[host\]/g,       hostFull)
        .replace(/\[host-name\]/g,  hostName)
        .replace(/\[host-email\]/g, `<${hostEmail}>`);
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
): ParsedSimMessage {
    const raw = fs.readFileSync(filePath, 'utf8');
    const content = applyPlaceholders(raw, hostEmail, hostName, nonHostOverrides);
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
    const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@live-sim>`;
    const date  = new Date().toUTCString();

    if (!msg.attachmentPath) {
        // Plain text message.
        const raw = [
            `From: ${msg.from}`,
            `To: ${msg.to}`,
            `Subject: ${msg.subject}`,
            `Date: ${date}`,
            `Message-ID: ${msgId}`,
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

// ── Non-host SMTP send ────────────────────────────────────────────────────────

/** Send a sim message FROM the non-host account via its real SMTP server. */
async function sendFromNonHostSmtp(
    rawMessage: Buffer,
    nonHostConfig: NonHostConfig,
    hostEmail: string,
): Promise<void> {
    const transporter = nodemailer.createTransport({
        host:   nonHostConfig.smtpHost,
        port:   nonHostConfig.smtpPort,
        secure: nonHostConfig.smtpSecure,
        auth:   { user: nonHostConfig.smtpUser, pass: nonHostConfig.smtpPass },
        tls:    { rejectUnauthorized: !nonHostConfig.allowSelfSigned },
    });
    await transporter.sendMail({
        envelope: { from: nonHostConfig.smtpUser, to: hostEmail },
        raw: rawMessage,
    });
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

/** Extract the bare email address from a "Name <email>" or "email" string. */
function extractEmailAddress(from: string): string | null {
    const bracketed = from.match(/<([^>]+)>/);
    if (bracketed) return bracketed[1].trim().toLowerCase();
    const bare = from.trim();
    return bare.includes('@') ? bare.toLowerCase() : null;
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

    const { config, nonHostConfig, simFile, verbose, delayMs, sendDelayMs, simSendDelayMs, nonHostOverrides } = parseArgs();

    if (!fs.existsSync(simFile)) {
        console.error(`Sim file not found: ${simFile}`);
        process.exit(1);
    }

    console.log(`friendlymail live sim`);
    console.log(`  host:      ${config.hostEmail}`);
    console.log(`  IMAP:      ${config.imapHost}:${config.imapPort}`);
    console.log(`  SMTP:      ${config.smtpHost}:${config.smtpPort}`);
    if (nonHostConfig) {
        console.log(`  non-host:  ${nonHostConfig.email}`);
        console.log(`  NH SMTP:   ${nonHostConfig.smtpHost}:${nonHostConfig.smtpPort}`);
    }
    console.log(`  since:     ${config.sinceDate.toISOString().slice(0, 10)}`);
    console.log(`  sim:       ${simFile}`);
    console.log('');

    const hostAddress = EmailAddress.fromString(config.hostEmail)!;
    const provider = new EmailMailProvider(
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

    const lines = fs.readFileSync(simFile, 'utf8').split('\n');
    let started = false;
    let stepNum = 0;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        stepNum++;
        console.log(`[step ${stepNum}] ${trimmed}`);

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
                parsedMsg = parseSimMessageFile(filePath, config.hostEmail, config.hostName, nonHostOverrides);
            } catch (err) {
                console.error(`  error parsing message file: ${(err as Error).message}`);
                continue;
            }

            if (parsedMsg.attachmentPath) {
                console.log(`  sending with attachment: ${parsedMsg.attachmentPath}`);
            }

            const raw = buildRfc2822(parsedMsg, filePath);
            const fromEmail = extractEmailAddress(parsedMsg.from);
            const useNonHostSmtp =
                nonHostConfig &&
                fromEmail &&
                fromEmail === nonHostConfig.email.toLowerCase();

            if (useNonHostSmtp) {
                await sendFromNonHostSmtp(raw, nonHostConfig!, config.hostEmail);
                console.log(`  sent via non-host SMTP: from="${parsedMsg.from}"  subject="${parsedMsg.subject}"`);
            } else {
                await sendViaHostSmtp(raw, config);
                console.log(`  sent via host SMTP: from="${parsedMsg.from}"  subject="${parsedMsg.subject}"`);
            }

            if (simSendDelayMs > 0) await sleep(simSendDelayMs);
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

            const raw = buildRfc2822(parsedMsg, null);
            await sendViaHostSmtp(raw, config);
            console.log(`  sent via host SMTP: from="${parsedMsg.from}"  subject="${parsedMsg.subject}"`);

            if (simSendDelayMs > 0) await sleep(simSendDelayMs);
            await daemon.run();
            started = true;
            if (delayMs > 0) await sleep(delayMs);

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
