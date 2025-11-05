import { EmailAddress } from './EmailAddress';
import { EmailMessage } from '../../EmailMessage';

/**
 * Represents a draft email message that may be incomplete or unsent.
 * Allows for partial data unlike EmailMessage which requires all fields.
 */
export class MessageDraft {
    private _from: EmailAddress | null;
    private _to: EmailAddress[];
    private _cc: EmailAddress[];
    private _bcc: EmailAddress[];
    private _subject: string;
    private _body: string;
    private _attachments: string[];
    private _isHtml: boolean;
    private _priority: 'high' | 'normal' | 'low';
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
        this._createdAt = options.createdAt || new Date();
        this._updatedAt = options.updatedAt || new Date();
    }

    /**
     * Get the sender email address
     */
    get from(): EmailAddress | null {
        return this._from;
    }

    /**
     * Get the recipient email addresses
     */
    get to(): EmailAddress[] {
        return [...this._to];
    }

    /**
     * Get the CC email addresses
     */
    get cc(): EmailAddress[] {
        return [...this._cc];
    }

    /**
     * Get the BCC email addresses
     */
    get bcc(): EmailAddress[] {
        return [...this._bcc];
    }

    /**
     * Get the subject line
     */
    get subject(): string {
        return this._subject;
    }

    /**
     * Get the message body
     */
    get body(): string {
        return this._body;
    }

    /**
     * Get the attachment file paths
     */
    get attachments(): string[] {
        return [...this._attachments];
    }

    /**
     * Get whether the message is HTML formatted
     */
    get isHtml(): boolean {
        return this._isHtml;
    }

    /**
     * Get the message priority
     */
    get priority(): 'high' | 'normal' | 'low' {
        return this._priority;
    }

    /**
     * Get the creation timestamp
     */
    get createdAt(): Date {
        return new Date(this._createdAt);
    }

    /**
     * Get the last update timestamp
     */
    get updatedAt(): Date {
        return new Date(this._updatedAt);
    }

    /**
     * Set the sender email address
     */
    set from(value: EmailAddress | null) {
        this._from = value;
        this._updatedAt = new Date();
    }

    /**
     * Set the recipient email addresses
     */
    set to(value: EmailAddress[]) {
        this._to = [...value];
        this._updatedAt = new Date();
    }

    /**
     * Set the CC email addresses
     */
    set cc(value: EmailAddress[]) {
        this._cc = [...value];
        this._updatedAt = new Date();
    }

    /**
     * Set the BCC email addresses
     */
    set bcc(value: EmailAddress[]) {
        this._bcc = [...value];
        this._updatedAt = new Date();
    }

    /**
     * Set the subject line
     */
    set subject(value: string) {
        this._subject = value;
        this._updatedAt = new Date();
    }

    /**
     * Set the message body
     */
    set body(value: string) {
        this._body = value;
        this._updatedAt = new Date();
    }

    /**
     * Set the attachment file paths
     */
    set attachments(value: string[]) {
        this._attachments = [...value];
        this._updatedAt = new Date();
    }

    /**
     * Set whether the message is HTML formatted
     */
    set isHtml(value: boolean) {
        this._isHtml = value;
        this._updatedAt = new Date();
    }

    /**
     * Set the message priority
     */
    set priority(value: 'high' | 'normal' | 'low') {
        this._priority = value;
        this._updatedAt = new Date();
    }

    /**
     * Add a recipient email address
     */
    addRecipient(email: EmailAddress): void {
        if (!this._to.some(e => e.equals(email))) {
            this._to.push(email);
            this._updatedAt = new Date();
        }
    }

    /**
     * Add a CC email address
     */
    addCc(email: EmailAddress): void {
        if (!this._cc.some(e => e.equals(email))) {
            this._cc.push(email);
            this._updatedAt = new Date();
        }
    }

    /**
     * Add a BCC email address
     */
    addBcc(email: EmailAddress): void {
        if (!this._bcc.some(e => e.equals(email))) {
            this._bcc.push(email);
            this._updatedAt = new Date();
        }
    }

    /**
     * Add an attachment file path
     */
    addAttachment(filePath: string): void {
        if (!this._attachments.includes(filePath)) {
            this._attachments.push(filePath);
            this._updatedAt = new Date();
        }
    }

    /**
     * Remove a recipient email address
     */
    removeRecipient(email: EmailAddress): void {
        const beforeLength = this._to.length;
        this._to = this._to.filter(e => !e.equals(email));
        if (this._to.length !== beforeLength) {
            this._updatedAt = new Date();
        }
    }

    /**
     * Remove a CC email address
     */
    removeCc(email: EmailAddress): void {
        const beforeLength = this._cc.length;
        this._cc = this._cc.filter(e => !e.equals(email));
        if (this._cc.length !== beforeLength) {
            this._updatedAt = new Date();
        }
    }

    /**
     * Remove a BCC email address
     */
    removeBcc(email: EmailAddress): void {
        const beforeLength = this._bcc.length;
        this._bcc = this._bcc.filter(e => !e.equals(email));
        if (this._bcc.length !== beforeLength) {
            this._updatedAt = new Date();
        }
    }

    /**
     * Remove an attachment file path
     */
    removeAttachment(filePath: string): void {
        const beforeLength = this._attachments.length;
        this._attachments = this._attachments.filter(f => f !== filePath);
        if (this._attachments.length !== beforeLength) {
            this._updatedAt = new Date();
        }
    }

    /**
     * Check if the draft is ready to be sent (has all required fields)
     */
    isReadyToSend(): boolean {
        return !!this._from && this._to.length > 0 && !!this._subject && !!this._body;
    }

    /**
     * Convert the draft to an EmailMessage.
     * Throws an error if the draft is not ready to send.
     */
    toEmailMessage(): EmailMessage {
        if (!this.isReadyToSend()) {
            throw new Error('Draft is not ready to send. Missing required fields.');
        }

        return new EmailMessage(
            this._from!,
            this._to,
            this._subject,
            this._body,
            {
                cc: this._cc,
                bcc: this._bcc,
                attachments: this._attachments,
                isHtml: this._isHtml,
                priority: this._priority
            }
        );
    }

    /**
     * Create a MessageDraft from an EmailMessage
     */
    static fromEmailMessage(message: EmailMessage): MessageDraft {
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
                priority: message.priority
            }
        );
    }

    /**
     * Convert the draft to JSON format
     */
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
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString()
        };
    }

    /**
     * Create a MessageDraft from JSON
     */
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
                createdAt: json.createdAt ? new Date(json.createdAt) : undefined,
                updatedAt: json.updatedAt ? new Date(json.updatedAt) : undefined
            }
        );
    }
}

