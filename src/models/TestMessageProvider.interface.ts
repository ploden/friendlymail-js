import { IMailProvider } from './MailProvider.interface';
import { EmailAddress } from './EmailAddress.impl';
import { SimpleMessage } from './SimpleMessage';

/**
 * Interface for TestMessageProvider used for testing and in the simulator.
 * Implements MessageSender and MessageReceiver, and loads messages from files.
 * If a file contains <host_address> as the To or From field, the email address
 * of the host user will be used.
 */
export interface ITestMessageProvider extends IMailProvider {
    /**
     * The host email address used to replace <host_address> placeholders
     */
    readonly hostAddress: EmailAddress;

    /**
     * Load message. After the message has been loaded,
     * it will be returned on the next call to getMessages().
     */
    loadMessage(message: SimpleMessage): Promise<void>;

    /**
     * Load messages from a file. After the file has been loaded,
     * it will be returned on the next call to getMessages().
     * @param filePath The path to the file to load
     */
    loadFromFile(filePath: string): Promise<void>;
}
