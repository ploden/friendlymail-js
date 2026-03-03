import { ISimpleMessage } from './SimpleMessage.interface';

/**
 * Interface for an email message received via IMAP.
 * Extends ISimpleMessage with email-specific headers needed for threading and deduplication.
 */
export interface IEmailMessage extends ISimpleMessage {
    /** The value of the Message-ID header, used for threading and deduplication. */
    readonly messageId?: string;
    /** The value of the In-Reply-To header, referencing the Message-ID of the parent message. */
    readonly inReplyTo?: string;
}
