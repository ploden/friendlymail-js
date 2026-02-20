import { IMessageReceiver } from './MessageReceiver.interface';
import { IMessageSender } from './MessageSender.interface';
import { IMessageStore } from './MessageStore.interface';
import { ISocialNetwork } from './SocialNetwork.interface';
import { IMessageProcessor } from '../MessageProcessor.interface';

/**
 * Interface for the Daemon data type.
 * The Daemon uses the main friendlymail data types to send and receive
 * friendlymail messages. It coordinates a MessageStore, MessageReceiver,
 * MessageSender, MessageProcessor, and SocialNetwork.
 */
export interface IDaemon {
    /** The store used to hold received and draft messages */
    readonly messageStore: IMessageStore;

    /** The receiver used to fetch incoming messages */
    readonly messageReceiver: IMessageReceiver;

    /** The sender used to dispatch draft messages */
    readonly messageSender: IMessageSender;

    /** The processor used to process messages and produce drafts */
    readonly messageProcessor: IMessageProcessor;

    /** The social network updated by the message processor */
    readonly socialNetwork: ISocialNetwork;

    /**
     * Run one cycle: fetch messages into the store, process them,
     * send any resulting drafts, and update the social network.
     * @returns Promise that resolves when the cycle is complete
     */
    run(): Promise<void>;
}
