/**
 * Represents a valid email address with validation and parsing capabilities.
 */
export class EmailAddress {
    private readonly localPart: string;
    private readonly domain: string;

    /**
     * Creates a new EmailAddress instance.
     * @param email The email address string to validate and parse
     * @throws Error if the email address is invalid
     */
    constructor(email: string) {
        if (!EmailAddress.isValid(email)) {
            throw new Error(`Invalid email address: ${email}`);
        }
        const [localPart, domain] = email.toLowerCase().split('@');
        this.localPart = localPart;
        this.domain = domain;
    }

    /**
     * Validates an email address string.
     * @param email The email address to validate
     * @returns true if the address is valid, false otherwise
     */
    static isValid(email: string): boolean {
        if (!email || typeof email !== 'string') return false;

        // RFC 5322 compliant email regex
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        return emailRegex.test(email);
    }

    /**
     * Creates an EmailAddress instance from a string if valid.
     * @param email The email address string
     * @returns EmailAddress instance or null if invalid
     */
    static fromString(email: string): EmailAddress | null {
        try {
            return new EmailAddress(email);
        } catch {
            return null;
        }
    }

    /**
     * Extracts an email address from a string that might include a display name.
     * @param displayString String in format "Display Name <email@example.com>" or just "email@example.com"
     * @returns EmailAddress instance or null if no valid email is found
     */
    static fromDisplayString(displayString: string): EmailAddress | null {
        // Match formats like:
        // - "Name" <email@example.com>
        // - Name <email@example.com>
        // - <email@example.com>
        // - email@example.com
        // - Name <email@example.com> (comment)
        const match = displayString.match(/^(?:(?:"[^"]*"|[^<]*?)\s*<)?([^@\s>]+@[^\s>]+)>?(?:\s*\([^)]*\))?$/);
        if (!match) {
            return null;
        }
        return EmailAddress.fromString(match[1]);
    }

    /**
     * Gets the local part of the email address (before @).
     */
    getLocalPart(): string {
        return this.localPart;
    }

    /**
     * Gets the domain part of the email address (after @).
     */
    getDomain(): string {
        return this.domain;
    }

    /**
     * Returns the full email address.
     */
    toString(): string {
        return `${this.localPart}@${this.domain}`;
    }

    /**
     * Checks if two email addresses are equal (case-insensitive).
     */
    equals(other: EmailAddress): boolean {
        return this.toString() === other.toString();
    }
} 