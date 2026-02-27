import { EmailAddress } from './EmailAddress.impl';
import { ISimpleMessage } from './SimpleMessage.interface';

/**
 * Interface for a received message that carries a unique message identifier.
 * Extends ISimpleMessage and narrows the from field to non-null, since a
 * received message always has a sender.
 */
export interface ISimpleMessageWithMessageId extends ISimpleMessage {
    /** Unique identifier for this message. Generated automatically if not supplied. */
    readonly messageId: string;
    /** The sender of this message. Always present on a received message. */
    readonly from: EmailAddress;
}
