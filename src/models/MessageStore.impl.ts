import { IMessageStore } from './MessageStore.interface';
import { SimpleMessage } from './SimpleMessage';
import { MessageDraft } from './MessageDraft.impl';

/**
 * Implementation of MessageStore for storing received and draft messages.
 */
export class MessageStore implements IMessageStore {
    private _allMessages: SimpleMessage[];
    private _draftMessages: MessageDraft[];

    constructor() {
        this._allMessages = [];
        this._draftMessages = [];
    }

    get allMessages(): ReadonlyArray<SimpleMessage> {
        return [...this._allMessages];
    }

    get draftMessages(): ReadonlyArray<MessageDraft> {
        return [...this._draftMessages];
    }

    addMessage(message: SimpleMessage): void {
        this._allMessages.push(message);
    }

    addMessages(messages: SimpleMessage[]): void {
        this._allMessages.push(...messages);
    }

    addDraft(draft: MessageDraft): void {
        this._draftMessages.push(draft);
    }

    removeDraft(draft: MessageDraft): void {
        const index = this._draftMessages.indexOf(draft);
        if (index !== -1) {
            this._draftMessages.splice(index, 1);
        }
    }

    clear(): void {
        this._allMessages = [];
        this._draftMessages = [];
    }
}
