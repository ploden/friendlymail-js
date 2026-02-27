import { EmailAddress } from './EmailAddress.impl';
import { SimpleMessage } from './SimpleMessage.impl';
import { ISimpleMessageWithMessageId } from './SimpleMessageWithMessageId.interface';

/**
 * A SimpleMessage that carries a unique message identifier.
 * Used for received messages, which always have a sender and a message ID.
 * Narrows the from field to EmailAddress (non-null).
 */
export class SimpleMessageWithMessageId extends SimpleMessage implements ISimpleMessageWithMessageId {
    private _messageId: string;

    constructor(
        from: EmailAddress,
        to: EmailAddress[],
        subject: string,
        body: string,
        date: Date = new Date(),
        xFriendlymail?: string,
        html?: string,
        messageId: string = crypto.randomUUID()
    ) {
        super(from, to, subject, body, date, xFriendlymail, html);
        this._messageId = messageId;
    }

    /** Unique identifier for this message. Generated automatically if not supplied. */
    get messageId(): string {
        return this._messageId;
    }

    /** The sender of this message. Always present on a received message. */
    override get from(): EmailAddress {
        return this._from as EmailAddress;
    }
}
