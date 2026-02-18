import { IMessageSender } from './MessageSender.interface';
import { IMessageReceiver } from './MessageReceiver.interface';

/**
 * Interface for a data type for sending and receiving email messages.
 * Implements both MessageSender and MessageReceiver.
 */
export interface IMailProvider extends IMessageSender, IMessageReceiver {
}
