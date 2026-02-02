import { EmailAddress } from './EmailAddress.impl';
import { EmailMessage } from '../../EmailMessage';
import { MessageDraft } from './MessageDraft.impl';

/**
 * Interface for Mailbox data type
 */
export interface IMailbox {
    readonly hostEmailAddress: EmailAddress;
    readonly receivedMessages: ReadonlyArray<EmailMessage>;
    readonly sentMessages: ReadonlyArray<EmailMessage>;
    readonly drafts: ReadonlyArray<MessageDraft>;

    /**
     * Create a new mailbox with additional received messages
     * Messages are sorted chronologically after merging with existing received messages
     * @param messages Array of messages to add to received messages
     * @returns A new Mailbox instance with the added messages sorted chronologically
     */
    addingReceivedMessages(messages: EmailMessage[]): IMailbox;

    /**
     * Create a new mailbox with additional sent messages
     * Messages are sorted chronologically after merging with existing sent messages
     * @param messages Array of messages to add to sent messages
     * @returns A new Mailbox instance with the added messages sorted chronologically
     */
    addingSentMessages(messages: EmailMessage[]): IMailbox;

    /**
     * Create a new mailbox with additional draft messages
     * Drafts are sorted chronologically by createdAt date after merging with existing drafts
     * @param drafts Array of drafts to add to drafts
     * @returns A new Mailbox instance with the added drafts sorted chronologically
     */
    addingDrafts(drafts: MessageDraft[]): IMailbox;

    /**
     * Create a new mailbox with drafts removed
     * @param drafts Array of drafts to remove from drafts
     * @returns A new Mailbox instance without the removed drafts
     */
    removingDrafts(drafts: MessageDraft[]): IMailbox;
}
