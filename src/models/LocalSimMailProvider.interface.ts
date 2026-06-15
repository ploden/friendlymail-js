import { SimpleMessageWithMessageId } from './SimpleMessageWithMessageId.impl';
import { IMessageSender } from './MessageSender.interface';
import { IMessageReceiver } from './MessageReceiver.interface';

/**
 * Extension of IMessageSender and IMessageReceiver for local filesystem-based
 * message delivery. Adds inbox injection and polling-based inbound wait.
 */
export interface ILocalSimMailProvider extends IMessageSender, IMessageReceiver {
    /** Display name of the host user. */
    readonly hostDisplayName: string | undefined;

    /**
     * Write a message directly to this instance's own Inbox, simulating inbound
     * mail from outside the sim (used by the `load` and `send` commands).
     */
    writeToOwnInbox(msg: SimpleMessageWithMessageId): void;

    /**
     * Poll Inbox/ for a message with X-Sim-Step matching stepFilter.
     * Exits the process if the timeout (5 minutes) expires.
     * @param stepFilter The step number to match against X-Sim-Step.
     * @param peerPresenceFiles Optional list of peer presence file paths; if all
     *   are absent before the timeout, the wait fails immediately.
     */
    waitForInbound(stepFilter: number, peerPresenceFiles?: string[]): Promise<void>;
}
