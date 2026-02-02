import { EmailAddress } from './EmailAddress.impl';
import { EmailMessage } from '../../EmailMessage';
import { MessageDraft } from './MessageDraft.impl';
import { IMailbox } from './Mailbox.interface';

/**
 * Represents a mailbox for an email address containing received messages, sent messages, and drafts
 */
export class Mailbox implements IMailbox {
    private _hostEmailAddress: EmailAddress;
    private _receivedMessages: EmailMessage[];
    private _sentMessages: EmailMessage[];
    private _drafts: MessageDraft[];

    /**
     * Creates a new Mailbox instance
     * @param hostEmailAddress The email address associated with this mailbox
     * @param receivedMessages Optional array of received messages
     * @param sentMessages Optional array of sent messages
     * @param drafts Optional array of draft messages
     */
    constructor(
        hostEmailAddress: EmailAddress,
        receivedMessages: EmailMessage[] = [],
        sentMessages: EmailMessage[] = [],
        drafts: MessageDraft[] = []
    ) {
        this._hostEmailAddress = hostEmailAddress;
        this._receivedMessages = [...receivedMessages];
        this._sentMessages = [...sentMessages];
        this._drafts = [...drafts];
    }

    /**
     * Get the email address associated with this mailbox
     */
    get hostEmailAddress(): EmailAddress {
        return this._hostEmailAddress;
    }

    /**
     * Get all received messages
     */
    get receivedMessages(): ReadonlyArray<EmailMessage> {
        return [...this._receivedMessages] as ReadonlyArray<EmailMessage>;
    }

    /**
     * Get all sent messages
     */
    get sentMessages(): ReadonlyArray<EmailMessage> {
        return [...this._sentMessages] as ReadonlyArray<EmailMessage>;
    }

    /**
     * Get all draft messages
     */
    get drafts(): ReadonlyArray<MessageDraft> {
        return [...this._drafts] as ReadonlyArray<MessageDraft>;
    }

    addingReceivedMessages(messages: EmailMessage[]): IMailbox {
        const allMessages = [...this._receivedMessages, ...messages];
        const sortedMessages = allMessages.sort((a, b) => {
            const aDate = this.getMessageDate(a);
            const bDate = this.getMessageDate(b);
            return aDate.getTime() - bDate.getTime();
        });
        return new Mailbox(
            this._hostEmailAddress,
            sortedMessages,
            [...this._sentMessages],
            [...this._drafts]
        );
    }

    addingSentMessages(messages: EmailMessage[]): IMailbox {
        const allMessages = [...this._sentMessages, ...messages];
        const sortedMessages = allMessages.sort((a, b) => {
            const aDate = this.getMessageDate(a);
            const bDate = this.getMessageDate(b);
            return aDate.getTime() - bDate.getTime();
        });
        return new Mailbox(
            this._hostEmailAddress,
            [...this._receivedMessages],
            sortedMessages,
            [...this._drafts]
        );
    }

    addingDrafts(drafts: MessageDraft[]): IMailbox {
        const allDrafts = [...this._drafts, ...drafts];
        const sortedDrafts = allDrafts.sort((a, b) => {
            return a.createdAt.getTime() - b.createdAt.getTime();
        });
        return new Mailbox(
            this._hostEmailAddress,
            [...this._receivedMessages],
            [...this._sentMessages],
            sortedDrafts
        );
    }

    /**
     * Get the date for an EmailMessage for sorting purposes
     * Since EmailMessage doesn't have a date property, uses current time as fallback
     * @param message The email message
     * @returns Date for sorting
     */
    private getMessageDate(message: EmailMessage): Date {
        return new Date();
    }

    removingDrafts(drafts: MessageDraft[]): IMailbox {
        const filteredDrafts = this._drafts.filter(draft => !drafts.includes(draft));
        return new Mailbox(
            this._hostEmailAddress,
            [...this._receivedMessages],
            [...this._sentMessages],
            filteredDrafts
        );
    }
}
