import { EmailAddress } from './EmailAddress.impl';
import { SimpleMessageWithMessageId } from './SimpleMessageWithMessageId.impl';
import { IEmailMessage } from './EmailMessage.interface';

/**
 * Represents an email message received via IMAP.
 * Extends SimpleMessageWithMessageId with the In-Reply-To header
 * needed for email threading.
 */
export class EmailMessage extends SimpleMessageWithMessageId implements IEmailMessage {
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
        super(from, to, subject, body, date, xFriendlymail, undefined, messageId);
        this._inReplyTo = inReplyTo;
    }

    get inReplyTo(): string | undefined {
        return this._inReplyTo;
    }
}
