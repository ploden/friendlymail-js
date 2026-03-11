/**
 * Encode a string using Quoted-Printable encoding for use in email headers.
 * Soft line breaks are intentionally omitted: this function is used exclusively
 * for the X-friendlymail header value, where inserting =\r\n would be encoded
 * by nodemailer's RFC 2047 pass and corrupt the value on decode.
 * @param input The string to encode
 * @returns The Quoted-Printable encoded string
 */
export function encodeQuotedPrintable(input: string): string {
    let encoded = '';
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        const code = char.charCodeAt(0);

        // Printable ASCII characters (33-60, 62-126) except = (61)
        if (code >= 33 && code <= 60 || code >= 62 && code <= 126) {
            encoded += char;
        }
        // Space (32) - can be printed as-is or encoded
        else if (code === 32) {
            encoded += char;
        }
        // Tab (9)
        else if (code === 9) {
            encoded += '=09';
        }
        // Equals sign (61) must be encoded
        else if (code === 61) {
            encoded += '=3D';
        }
        // All other characters encoded as =XX
        else {
            const hex = code.toString(16).toUpperCase().padStart(2, '0');
            encoded += `=${hex}`;
        }
    }

    return encoded;
}

/**
 * Decode a Quoted-Printable encoded string.
 * Also handles RFC 2047 encoded-word format produced by SMTP clients such as
 * nodemailer when transmitting custom headers. Both single encoded-words
 * (=?charset?Q?...?=) and multi-part sequences of encoded-words separated by
 * whitespace are supported — all parts are concatenated before QP decoding.
 * In RFC 2047 QP, underscores represent spaces and are converted accordingly.
 * @param input The Quoted-Printable (or RFC 2047 QP encoded-word) string
 * @returns The decoded string
 */
export function decodeQuotedPrintable(input: string): string {
    // Unwrap RFC 2047 encoded-word(s): =?charset?Q?encoded-text?=
    // nodemailer may split long header values across multiple encoded-words
    // separated by whitespace. Collect all Q-encoded parts and concatenate
    // them, then fall through to normal QP decoding.
    const rfc2047WordRe = /=\?[^?]+\?Q\?([^?]*)\?=/gi;
    const parts: string[] = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    let hasRfc2047 = false;

    while ((match = rfc2047WordRe.exec(input)) !== null) {
        hasRfc2047 = true;
        parts.push(match[1].replace(/_/g, ' '));
        lastIndex = rfc2047WordRe.lastIndex;
    }

    if (hasRfc2047) {
        input = parts.join('');
    }

    // Remove soft line breaks (= followed by CRLF or LF)
    let cleaned = input.replace(/=\r\n/g, '').replace(/=\n/g, '');

    let decoded = '';
    let i = 0;

    while (i < cleaned.length) {
        if (cleaned[i] === '=' && i + 2 < cleaned.length) {
            const hex = cleaned.substring(i + 1, i + 3);
            const code = parseInt(hex, 16);
            if (!isNaN(code)) {
                decoded += String.fromCharCode(code);
                i += 3;
            } else {
                // Invalid hex, keep the = as-is
                decoded += cleaned[i];
                i++;
            }
        } else {
            decoded += cleaned[i];
            i++;
        }
    }

    return decoded;
}
