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
    private _verbose: boolean;
    private _runCount: number = 0;

    /**
     * Creates a new Daemon instance.
     * @param hostEmailAddress The email address of the host user
     * @param messageReceiver Used to fetch incoming messages
     * @param messageSender Used to dispatch draft messages
     * @param socialNetwork Used to persist social network state across runs
     * @param verbose When true, logs detailed run-cycle information to stdout
     */
    constructor(
        hostEmailAddress: EmailAddress,
        messageReceiver: IMessageReceiver,
        messageSender: IMessageSender,
        socialNetwork: ISocialNetwork,
        verbose: boolean = false
    ) {
        this._hostEmailAddress = hostEmailAddress;
        this._messageStore = new MessageStore();
        this._messageReceiver = messageReceiver;
        this._messageSender = messageSender;
        this._socialNetwork = socialNetwork;
        this._messageProcessor = new MessageProcessor(hostEmailAddress);
        this._verbose = verbose;
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
        this._runCount++;
        const log = this._verbose
            ? (...args: unknown[]) => console.log(`[daemon run=${this._runCount}]`, ...args)
            : () => {};

        log(`--- cycle start ---`);

        // Populate the store with messages from the receiver
        const newMessages = await this._messageReceiver.getMessages();
        log(`getMessages() returned ${newMessages.length} message(s)`);
        if (this._verbose) {
            for (const m of newMessages) {
                console.log(`  [daemon run=${this._runCount}] message  id=${m.messageId}  from=${m.from}  subject="${m.subject}"  xFriendlymail=${m.xFriendlymail ?? '(none)'}`);
            }
        }

        const storeSizeBefore = this._messageStore.allMessages.length;
        this._messageStore.addMessages(newMessages);
        const storeSizeAfter = this._messageStore.allMessages.length;
        log(`store size: ${storeSizeBefore} → ${storeSizeAfter} (${storeSizeAfter - storeSizeBefore} added after dedup)`);

        // Build a processor from the accumulated store messages
        this._messageProcessor = new MessageProcessor(
            this._hostEmailAddress,
            [...this._messageStore.allMessages]
        );

        // Send each draft produced by the processor
        const drafts = this._messageProcessor.getMessageDrafts();
        log(`processor produced ${drafts.length} draft(s)`);
        if (this._verbose) {
            for (const d of drafts) {
                console.log(`  [daemon run=${this._runCount}] draft  to=${d.to.map(a => a.toString()).join(',')}  subject="${d.subject}"  messageType=${(d as { messageType?: string }).messageType ?? '(none)'}`);
            }
        }

        for (const draft of drafts) {
            log(`sending draft  to=${draft.to.map(a => a.toString()).join(',')}  subject="${draft.subject}"`);
            await this._messageSender.sendDraft(draft);
            this._messageProcessor.removeDraft(draft);
        }

        // Fetch any messages produced by sending drafts and add them to the store
        const sentMessages = await this._messageReceiver.getMessages();
        log(`post-send getMessages() returned ${sentMessages.length} message(s)`);
        const storeSizeBeforePost = this._messageStore.allMessages.length;
        this._messageStore.addMessages(sentMessages);
        const storeSizeAfterPost = this._messageStore.allMessages.length;
        log(`store size after post-send fetch: ${storeSizeBeforePost} → ${storeSizeAfterPost}`);

        // Update the social network from processor state
        const hostSocialNetwork = this._messageProcessor.getHostSocialNetwork();
        if (hostSocialNetwork) {
            this._socialNetwork.setUser(hostSocialNetwork.getUser());
        }

        log(`--- cycle end ---`);
    }

}
