import { IDaemon } from './Daemon.interface';
import { IMessageReceiver } from './MessageReceiver.interface';
import { IMessageSender } from './MessageSender.interface';
import { IMessageStore } from './MessageStore.interface';
import { ISocialNetwork } from './SocialNetwork.interface';
import { IMessageProcessor } from '../MessageProcessor.interface';
import { MessageStore } from './MessageStore.impl';
import { MessageProcessor } from '../MessageProcessor';
import { EmailAddress } from './EmailAddress.impl';

/**
 * Daemon coordinates the core friendlymail components to send and receive
 * friendlymail messages. On each run() cycle it fetches incoming messages,
 * processes them to produce draft replies, sends those drafts, and updates
 * the social network accordingly.
 */
export class Daemon implements IDaemon {
    private _messageStore: IMessageStore;
    private _messageReceiver: IMessageReceiver;
    private _messageSender: IMessageSender;
    private _messageProcessor: IMessageProcessor;
    private _socialNetwork: ISocialNetwork;
    private _hostEmailAddress: EmailAddress;

    /**
     * Creates a new Daemon instance.
     * @param hostEmailAddress The email address of the host user
     * @param messageReceiver Used to fetch incoming messages
     * @param messageSender Used to dispatch draft messages
     * @param socialNetwork Used to persist social network state across runs
     */
    constructor(
        hostEmailAddress: EmailAddress,
        messageReceiver: IMessageReceiver,
        messageSender: IMessageSender,
        socialNetwork: ISocialNetwork
    ) {
        this._hostEmailAddress = hostEmailAddress;
        this._messageStore = new MessageStore();
        this._messageReceiver = messageReceiver;
        this._messageSender = messageSender;
        this._socialNetwork = socialNetwork;
        this._messageProcessor = new MessageProcessor(hostEmailAddress);
    }

    /** The store holding all received and pending draft messages */
    get messageStore(): IMessageStore {
        return this._messageStore;
    }

    /** The receiver used to fetch incoming messages */
    get messageReceiver(): IMessageReceiver {
        return this._messageReceiver;
    }

    /** The sender used to dispatch draft messages */
    get messageSender(): IMessageSender {
        return this._messageSender;
    }

    /** The processor for the most recently completed run cycle */
    get messageProcessor(): IMessageProcessor {
        return this._messageProcessor;
    }

    /** The social network updated by the message processor */
    get socialNetwork(): ISocialNetwork {
        return this._socialNetwork;
    }

    /**
     * Run one cycle: fetch new messages into the store, process them,
     * send any resulting drafts, and update the social network.
     */
    async run(): Promise<void> {
        // Populate the store with messages from the receiver
        const newMessages = await this._messageReceiver.getMessages();
        this._messageStore.addMessages(newMessages);

        // Build a processor from the accumulated store messages
        this._messageProcessor = new MessageProcessor(
            this._hostEmailAddress,
            [...this._messageStore.allMessages]
        );

        // Send each draft produced by the processor
        const drafts = this._messageProcessor.getMessageDrafts();
        for (const draft of drafts) {
            await this._messageSender.sendDraft(draft);
            this._messageProcessor.removeDraft(draft);
        }

        // Fetch any messages produced by sending drafts and add them to the store
        const sentMessages = await this._messageReceiver.getMessages();
        this._messageStore.addMessages(sentMessages);

        // Update the social network from processor state
        const socialNetworks = this._messageProcessor.getAllSocialNetworks();
        if (socialNetworks.length > 0) {
            this._socialNetwork.setUser(socialNetworks[0].getUser());
        }
    }

}
