/**
 * Encode a string using Quoted-Printable encoding
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
    
    // Soft line breaks: lines should not exceed 76 characters
    // Insert = followed by CRLF every 76 characters
    let result = '';
    let lineLength = 0;
    for (let i = 0; i < encoded.length; i++) {
        if (lineLength >= 75) {
            result += '=\r\n';
            lineLength = 0;
        }
        result += encoded[i];
        lineLength++;
    }
    
    return result;
}

/**
 * Decode a Quoted-Printable encoded string
 * @param input The Quoted-Printable encoded string
 * @returns The decoded string
 */
export function decodeQuotedPrintable(input: string): string {
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
