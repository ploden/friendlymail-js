import { EmailAddress } from './EmailAddress.impl';
import { ISimpleMessage } from './SimpleMessage.interface';

/**
 * Implementation of the most basic message type.
 * Includes attributes for From, To, Subject, message body, and Date.
 * Can also include an optional X-friendlymail value for the email header.
 */
export class SimpleMessage implements ISimpleMessage {
    private _from: EmailAddress;
    private _to: EmailAddress[];
    private _subject: string;
    private _body: string;
    private _date: Date;
    private _xFriendlymail?: string;

    constructor(
        from: EmailAddress,
        to: EmailAddress[],
        subject: string,
        body: string,
        date: Date = new Date(),
        xFriendlymail?: string
    ) {
        this._from = from;
        this._to = [...to];
        this._subject = subject;
        this._body = body;
        this._date = date;
        this._xFriendlymail = xFriendlymail;
    }

    get from(): EmailAddress {
        return this._from;
    }

    get to(): EmailAddress[] {
        return [...this._to];
    }

    get subject(): string {
        return this._subject;
    }

    get body(): string {
        return this._body;
    }

    get date(): Date {
        return new Date(this._date);
    }

    get xFriendlymail(): string | undefined {
        return this._xFriendlymail;
    }
}
