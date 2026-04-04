import { IMailProvider } from './MailProvider.interface';

/**
 * Configuration for an SMTP server used to send outgoing email.
 */
export interface SmtpConfig {
    host: string;
    port: number;
    /** Use TLS for the initial connection (port 465). Set false for STARTTLS (port 587) or plaintext (port 25). */
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
    /** Skip TLS certificate verification. Use for local dev with self-signed certs. */
    allowSelfSigned?: boolean;
}

/**
 * Configuration for an IMAP server used to receive incoming email.
 */
export interface ImapConfig {
    host: string;
    port: number;
    /** Use TLS for the initial connection (port 993). Set false for STARTTLS (port 143). */
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
    /** Skip TLS certificate verification. Use for local dev with self-signed certs. */
    allowSelfSigned?: boolean;
    /** Only fetch messages on or after this date. When omitted, all messages are fetched. */
    sinceDate?: Date;
    /**
     * When set, getMessages() also fetches from this folder (e.g. '[Gmail]/All Mail')
     * so messages archived by a Gmail filter are still processed by the daemon.
     * sendDraft() will also IMAP-APPEND any draft addressed to the IMAP user directly
     * to INBOX, ensuring it is visible even if a Gmail filter would otherwise archive it.
     */
    archiveFolder?: string;
}

/**
 * Interface for a MailProvider that sends via SMTP and receives via IMAP.
 */
export interface IEmailMailProvider extends IMailProvider {
    readonly smtpConfig: SmtpConfig;
    readonly imapConfig: ImapConfig;
}
