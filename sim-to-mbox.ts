#!/usr/bin/env node

/**
 * sim-to-mbox.ts
 *
 * Converts sim_data output into mbox files importable by Thunderbird.
 *
 * sim_data layout:
 *   sim_data/{user}/{Folder}/NNNN.txt   — email headers + plain text body
 *   sim_data/{user}/{Folder}/NNNN.html  — HTML body for the same message (optional)
 *
 * Output:
 *   thunderbird_import/{user}/{Folder}  — mbox file (one per folder)
 *
 * To import into Thunderbird:
 *   1. Install "ImportExportTools NG" addon
 *   2. Right-click any folder → ImportExportTools NG → Import mbox file
 *   3. Select the mbox file for each folder
 *
 * Usage:
 *   npx tsx sim-to-mbox.ts [--sim-data <dir>] [--output <dir>]
 */

import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
function argVal(flag: string, fallback: string): string {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const SIM_DATA_DIR = argVal('--sim-data', path.join(__dirname, 'sim_data'));
const OUTPUT_DIR = argVal('--output', path.join(__dirname, 'thunderbird_import'));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractEmail(headerVal: string): string {
  const m = headerVal.match(/<([^>]+)>/);
  if (m) return m[1];
  return headerVal.trim();
}

function toMboxDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date().toUTCString().replace(/,/, '');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${pad(d.getUTCDate())} `
       + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${d.getUTCFullYear()}`;
}

// Escape bare "From " at start of lines (mbox quoting rule)
function quoteFromLines(text: string): string {
  return text.replace(/^From /gm, '>From ');
}

// Parse an email file into headers (preserving original case) and body
function parseEmail(content: string): { headerLines: string[]; body: string } {
  const nlChar = content.includes('\r\n') ? '\r\n' : '\n';
  const sepIdx = content.indexOf(nlChar + nlChar);
  if (sepIdx < 0) return { headerLines: content.split(nlChar), body: '' };
  const headerBlock = content.substring(0, sepIdx);
  const body = content.substring(sepIdx + nlChar.length * 2);
  // Unfold multi-line headers then re-split into individual header lines
  const unfolded = headerBlock.replace(/\r?\n([ \t])/g, ' ');
  return { headerLines: unfolded.split(/\r?\n/), body };
}

function getHeader(headerLines: string[], name: string): string {
  const lower = name.toLowerCase();
  const line = headerLines.find(l => l.toLowerCase().startsWith(lower + ':'));
  return line ? line.substring(line.indexOf(':') + 1).trim() : '';
}

// ---------------------------------------------------------------------------
// Build a single mbox message string
// ---------------------------------------------------------------------------

function buildMboxMessage(txtContent: string, htmlContent: string | null): string {
  const { headerLines, body: textBody } = parseEmail(txtContent);

  const fromVal = getHeader(headerLines, 'From');
  const fromEmail = extractEmail(fromVal) || 'unknown@unknown';
  const dateVal = getHeader(headerLines, 'Date');
  const mboxFromLine = `From ${fromEmail} ${toMboxDate(dateVal)}`;

  const lines: string[] = [mboxFromLine];

  if (htmlContent) {
    const boundary = `_boundary_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;

    // Emit original headers, stripping any existing Content-Type / MIME-Version
    const skipHeaders = new Set(['content-type', 'mime-version', 'content-transfer-encoding']);
    for (const h of headerLines) {
      const lower = h.toLowerCase();
      if (skipHeaders.has(lower.split(':')[0])) continue;
      lines.push(h);
    }
    lines.push('MIME-Version: 1.0');
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');

    // Plain text part
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('');
    lines.push(quoteFromLines(textBody.replace(/\r\n/g, '\n')));
    lines.push('');

    // HTML part
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('');
    lines.push(quoteFromLines(htmlContent.replace(/\r\n/g, '\n')));
    lines.push('');

    lines.push(`--${boundary}--`);
  } else {
    // Plain text only — emit headers as-is, add MIME if missing
    const hasMime = headerLines.some(h => h.toLowerCase().startsWith('mime-version:'));
    const hasContentType = headerLines.some(h => h.toLowerCase().startsWith('content-type:'));
    for (const h of headerLines) lines.push(h);
    if (!hasMime) lines.push('MIME-Version: 1.0');
    if (!hasContentType) lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('');
    lines.push(quoteFromLines(textBody.replace(/\r\n/g, '\n')));
  }

  // mbox message separator: blank line after each message
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Process one folder → mbox string
// ---------------------------------------------------------------------------

function processFolder(folderPath: string): string {
  const files = fs.readdirSync(folderPath).sort();

  const messageNums = new Set<string>();
  for (const f of files) {
    const m = f.match(/^(\d+)\.(txt|html)$/i);
    if (m) messageNums.add(m[1]);
  }

  const mboxParts: string[] = [];
  for (const num of Array.from(messageNums).sort()) {
    const txtPath = path.join(folderPath, `${num}.txt`);
    const htmlPath = path.join(folderPath, `${num}.html`);
    if (!fs.existsSync(txtPath)) continue;

    const txtContent = fs.readFileSync(txtPath, 'utf-8');
    const htmlContent = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf-8') : null;
    mboxParts.push(buildMboxMessage(txtContent, htmlContent));
  }

  return mboxParts.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!fs.existsSync(SIM_DATA_DIR)) {
  console.error(`sim_data directory not found: ${SIM_DATA_DIR}`);
  process.exit(1);
}

if (fs.existsSync(OUTPUT_DIR)) {
  fs.rmSync(OUTPUT_DIR, { recursive: true });
}
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const users = fs.readdirSync(SIM_DATA_DIR).filter(u =>
  fs.statSync(path.join(SIM_DATA_DIR, u)).isDirectory()
);

for (const user of users) {
  const userPath = path.join(SIM_DATA_DIR, user);
  const userOutputDir = path.join(OUTPUT_DIR, user);
  fs.mkdirSync(userOutputDir, { recursive: true });

  const folders = fs.readdirSync(userPath).filter(f =>
    fs.statSync(path.join(userPath, f)).isDirectory()
  );

  for (const folder of folders) {
    const folderPath = path.join(userPath, folder);
    process.stdout.write(`Processing ${user}/${folder}...`);
    const mboxContent = processFolder(folderPath);
    const outPath = path.join(userOutputDir, folder);
    fs.writeFileSync(outPath, mboxContent, 'utf-8');
    const count = (mboxContent.match(/^From .+ \d{4}$/gm) || []).length;
    console.log(` ${count} message(s) → ${outPath}`);
  }
}

console.log(`\nDone. Import files are in: ${OUTPUT_DIR}`);
console.log('');
console.log('To import into Thunderbird:');
console.log('  1. Install the "ImportExportTools NG" addon in Thunderbird');
console.log('  2. Right-click any folder → ImportExportTools NG → Import mbox file');
console.log('  3. Select the appropriate mbox file for each folder');
