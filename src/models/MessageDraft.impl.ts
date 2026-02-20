import { EmailAddress } from './EmailAddress.impl';
import { EmailMessage } from '../../EmailMessage';
import { IMessageDraft, IMessageDraftStatic } from './MessageDraft.interface';
import { FriendlymailMessageType } from './FriendlymailMessageType';
import { decodeQuotedPrintable } from '../utils/quotedPrintable';

/**
 * Represents a draft email message that may be incomplete or unsent.
 * Allows for partial data unlike EmailMessage which requires all fields.
 */
export class MessageDraft implements IMessageDraft {
    private _from: EmailAddress | null;
    private _to: EmailAddress[];
    private _cc: EmailAddress[];
    private _bcc: EmailAddress[];
    private _subject: string;
    private _body: string;
    private _attachments: string[];
    private _isHtml: boolean;
    private _priority: 'high' | 'normal' | 'low';
    private _messageType: FriendlymailMessageType | null;
    private _createdAt: Date;
    private _updatedAt: Date;

    constructor(
        from: EmailAddress | null = null,
        to: EmailAddress[] = [],
        subject: string = '',
        body: string = '',
        options: {
            cc?: EmailAddress[];
            bcc?: EmailAddress[];
            attachments?: string[];
            isHtml?: boolean;
            priority?: 'high' | 'normal' | 'low';
            messageType?: FriendlymailMessageType | null;
            createdAt?: Date;
            updatedAt?: Date;
        } = {}
    ) {
        this._from = from;
        this._to = [...to];
        this._subject = subject;
        this._body = body;
        this._cc = options.cc ? [...options.cc] : [];
        this._bcc = options.bcc ? [...options.bcc] : [];
        this._attachments = options.attachments ? [...options.attachments] : [];
        this._isHtml = options.isHtml || false;
        this._priority = options.priority || 'normal';
        this._messageType = options.messageType !== undefined ? options.messageType : null;
        this._createdAt = options.createdAt || new Date();
        this._updatedAt = options.updatedAt || new Date();
    }

    get from(): EmailAddress | null {
        return this._from;
    }

    get to(): EmailAddress[] {
        return [...this._to];
    }

    get cc(): EmailAddress[] {
        return [...this._cc];
    }

    get bcc(): EmailAddress[] {
        return [...this._bcc];
    }

    get subject(): string {
        return this._subject;
    }

    get body(): string {
        return this._body;
    }

    get attachments(): string[] {
        return [...this._attachments];
    }

    get isHtml(): boolean {
        return this._isHtml;
    }

    get priority(): 'high' | 'normal' | 'low' {
        return this._priority;
    }

    get messageType(): FriendlymailMessageType | null {
        return this._messageType;
    }

    get createdAt(): Date {
        return new Date(this._createdAt);
    }

    get updatedAt(): Date {
        return new Date(this._updatedAt);
    }

    set from(value: EmailAddress | null) {
        this._from = value;
        this._updatedAt = new Date();
    }

    set to(value: EmailAddress[]) {
        this._to = [...value];
        this._updatedAt = new Date();
    }

    set cc(value: EmailAddress[]) {
        this._cc = [...value];
        this._updatedAt = new Date();
    }

    set bcc(value: EmailAddress[]) {
        this._bcc = [...value];
        this._updatedAt = new Date();
    }

    set subject(value: string) {
        this._subject = value;
        this._updatedAt = new Date();
    }

    set body(value: string) {
        this._body = value;
        this._updatedAt = new Date();
    }

    set attachments(value: string[]) {
        this._attachments = [...value];
        this._updatedAt = new Date();
    }

    set isHtml(value: boolean) {
        this._isHtml = value;
        this._updatedAt = new Date();
    }

    set priority(value: 'high' | 'normal' | 'low') {
        this._priority = value;
        this._updatedAt = new Date();
    }

    addRecipient(email: EmailAddress): void {
        if (!this._to.some(e => e.equals(email))) {
            this._to.push(email);
            this._updatedAt = new Date();
        }
    }

    addCc(email: EmailAddress): void {
        if (!this._cc.some(e => e.equals(email))) {
            this._cc.push(email);
            this._updatedAt = new Date();
        }
    }

    addBcc(email: EmailAddress): void {
        if (!this._bcc.some(e => e.equals(email))) {
            this._bcc.push(email);
            this._updatedAt = new Date();
        }
    }

    addAttachment(filePath: string): void {
        if (!this._attachments.includes(filePath)) {
            this._attachments.push(filePath);
            this._updatedAt = new Date();
        }
    }

    removeRecipient(email: EmailAddress): void {
        const beforeLength = this._to.length;
        this._to = this._to.filter(e => !e.equals(email));
        if (this._to.length !== beforeLength) {
            this._updatedAt = new Date();
        }
    }

    removeCc(email: EmailAddress): void {
        const beforeLength = this._cc.length;
        this._cc = this._cc.filter(e => !e.equals(email));
        if (this._cc.length !== beforeLength) {
            this._updatedAt = new Date();
        }
    }

    removeBcc(email: EmailAddress): void {
        const beforeLength = this._bcc.length;
        this._bcc = this._bcc.filter(e => !e.equals(email));
        if (this._bcc.length !== beforeLength) {
            this._updatedAt = new Date();
        }
    }

    removeAttachment(filePath: string): void {
        const beforeLength = this._attachments.length;
        this._attachments = this._attachments.filter(f => f !== filePath);
        if (this._attachments.length !== beforeLength) {
            this._updatedAt = new Date();
        }
    }

    isReadyToSend(): boolean {
        return !!this._from && this._to.length > 0 && !!this._subject && !!this._body;
    }

    static fromEmailMessage(message: EmailMessage): MessageDraft {
        const xFriendlymailHeader = message.getCustomHeader('X-friendlymail');
        let messageType: FriendlymailMessageType | null = null;
        if (xFriendlymailHeader) {
            try {
                const decodedMetadata = decodeQuotedPrintable(xFriendlymailHeader);
                const metadata = JSON.parse(decodedMetadata);
                if (metadata.messageType) {
                    messageType = metadata.messageType as FriendlymailMessageType;
                }
            } catch {
                // Invalid encoding or JSON, ignore
            }
        }

        return new MessageDraft(
            message.from,
            message.to,
            message.subject,
            message.body,
            {
                cc: message.cc,
                bcc: message.bcc,
                attachments: message.attachments,
                isHtml: message.isHtml,
                priority: message.priority,
                messageType: messageType
            }
        );
    }

    toJSON(): Record<string, any> {
        return {
            from: this._from?.toString() || null,
            to: this._to.map(addr => addr.toString()),
            cc: this._cc.map(addr => addr.toString()),
            bcc: this._bcc.map(addr => addr.toString()),
            subject: this._subject,
            body: this._body,
            attachments: this._attachments,
            isHtml: this._isHtml,
            priority: this._priority,
            messageType: this._messageType,
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString()
        };
    }

    static fromJSON(json: Record<string, any>): MessageDraft {
        return new MessageDraft(
            json.from ? EmailAddress.fromString(json.from) : null,
            (json.to || []).map((email: string) => EmailAddress.fromString(email)).filter((addr: EmailAddress | null): addr is EmailAddress => addr !== null),
            json.subject || '',
            json.body || '',
            {
                cc: (json.cc || []).map((email: string) => EmailAddress.fromString(email)).filter((addr: EmailAddress | null): addr is EmailAddress => addr !== null),
                bcc: (json.bcc || []).map((email: string) => EmailAddress.fromString(email)).filter((addr: EmailAddress | null): addr is EmailAddress => addr !== null),
                attachments: json.attachments || [],
                isHtml: json.isHtml || false,
                priority: json.priority || 'normal',
                messageType: json.messageType || null,
                createdAt: json.createdAt ? new Date(json.createdAt) : undefined,
                updatedAt: json.updatedAt ? new Date(json.updatedAt) : undefined
            }
        );
    }
}
