import { IMailProvider } from './MailProvider.interface';
import { EmailAddress } from './EmailAddress.impl';
import { SimpleMessageWithMessageId } from './SimpleMessageWithMessageId';

/**
 * Interface for SimMessageProvider, used by the simulator (run-process-messages.ts).
 * Extends IMailProvider with simulator-specific methods for loading messages and
 * managing simulator output directories.
 */
export interface ISimMessageProvider extends IMailProvider {
    /**
     * The host email address, used as the sender for messages loaded via loadFromMailto().
     */
    readonly hostAddress: EmailAddress;

    /**
     * All messages sent via sendDraft() since construction or the last clearDirs() call.
     */
    readonly sentMessages: ReadonlyArray<SimpleMessageWithMessageId>;

    /**
     * Load a message from a .txt file. Applies host and test-user placeholders,
     * writes the result to the received directory, and queues the message to be
     * returned on the next call to getMessages().
     * @param filePath Absolute path to the .txt file
     */
    loadFile(filePath: string): Promise<void>;

    /**
     * Load a message from a mailto: URL, treating the host as the sender.
     * Writes the message to the received directory and queues it to be returned
     * on the next call to getMessages().
     * @param url A mailto: URL such as mailto:host@example.com?subject=Fm&body=%24%20help
     */
    loadFromMailto(url: string): Promise<void>;

    /**
     * Clear all files in the simulator sent and received directories and reset
     * the internal file-index counters.
     */
    clearDirs(): void;
}
