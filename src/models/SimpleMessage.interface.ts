import { EmailAddress } from './EmailAddress.impl';

/**
 * Interface for the most basic message type.
 * Includes attributes for From, To, Subject, message body, and Date.
 * Can also include an optional X-friendlymail value for the email header.
 * The from field is nullable to accommodate draft messages that have not yet
 * had a sender assigned.
 */
export interface ISimpleMessage {
    readonly from: EmailAddress | null;
    readonly to: EmailAddress[];
    readonly subject: string;
    readonly body: string;
    /** Optional HTML part of the message (text/html alternative to body). */
    readonly html?: string;
    readonly date: Date;
    readonly xFriendlymail?: string;
}
