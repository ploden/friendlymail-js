import { EmailAddress } from './EmailAddress.impl';
import { SimpleMessage } from './SimpleMessage';
import { IEmailMessage } from './EmailMessage.interface';

/**
 * Represents an email message received via IMAP.
 * Extends SimpleMessage with the Message-ID and In-Reply-To headers
 * needed for email threading and deduplication.
 */
export class EmailMessage extends SimpleMessage implements IEmailMessage {
    private _messageId?: string;
    private _inReplyTo?: string;

    constructor(
        from: EmailAddress,
        to: EmailAddress[],
        subject: string,
        body: string,
        date: Date = new Date(),
        xFriendlymail?: string,
        messageId?: string,
        inReplyTo?: string
    ) {
        super(from, to, subject, body, date, xFriendlymail);
        this._messageId = messageId;
        this._inReplyTo = inReplyTo;
    }

    get messageId(): string | undefined {
        return this._messageId;
    }

    get inReplyTo(): string | undefined {
        return this._inReplyTo;
    }
}
