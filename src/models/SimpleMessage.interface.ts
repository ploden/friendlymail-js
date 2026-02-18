import { EmailAddress } from './EmailAddress.impl';

/**
 * Interface for the most basic message type.
 * Includes attributes for From, To, Subject, message body, and Date.
 * Can also include an optional X-friendlymail value for the email header.
 */
export interface ISimpleMessage {
    readonly from: EmailAddress;
    readonly to: EmailAddress[];
    readonly subject: string;
    readonly body: string;
    readonly date: Date;
    readonly xFriendlymail?: string;
}
