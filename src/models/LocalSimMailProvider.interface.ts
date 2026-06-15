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
     * Write a message to the inbox of any participant identified by email.
     * Used in local mode to deliver outbound messages from a non-host instance
     * directly to the host's inbox so that wait-for-inbound can detect them.
     */
    writeToInbox(msg: SimpleMessageWithMessageId, email: string): void;

    /**
     * Poll Inbox/ for a message with X-Sim-Step matching stepFilter.
     * Exits the process if the timeout (5 minutes) expires.
     * @param stepFilter The step number to match against X-Sim-Step.
     * @param peerPresenceFiles Optional list of peer presence file paths; if all
     *   are absent before the timeout, the wait fails immediately.
     */
    waitForInbound(stepFilter: number, peerPresenceFiles?: string[]): Promise<void>;

    /**
     * Poll Inbox/ for a new message whose X-friendlymail header contains the
     * specified messageType. Useful for non-host instances waiting for a
     * daemon-sent message (e.g. an invite) before proceeding to the next step.
     * Exits the process if the 5-minute timeout expires.
     */
    waitForMessage(messageType: string): Promise<void>;
}
