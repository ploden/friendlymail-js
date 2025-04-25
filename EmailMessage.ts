export class EmailMessage {
    private _from: string;
    private _to: string[];
    private _cc: string[];
    private _bcc: string[];
    private _subject: string;
    private _body: string;
    private _attachments: string[];
    private _isHtml: boolean;
    private _priority: 'high' | 'normal' | 'low';

    constructor(
        from: string,
        to: string[],
        subject: string,
        body: string,
        options: {
            cc?: string[];
            bcc?: string[];
            attachments?: string[];
            isHtml?: boolean;
            priority?: 'high' | 'normal' | 'low';
        } = {}
    ) {
        this._from = from;
        this._to = to;
        this._subject = subject;
        this._body = body;
        this._cc = options.cc || [];
        this._bcc = options.bcc || [];
        this._attachments = options.attachments || [];
        this._isHtml = options.isHtml || false;
        this._priority = options.priority || 'normal';
    }

    // Getters
    get from(): string {
        return this._from;
    }

    get to(): string[] {
        return [...this._to];
    }

    get cc(): string[] {
        return [...this._cc];
    }

    get bcc(): string[] {
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

    // Setters
    set from(value: string) {
        this._from = value;
    }

    set to(value: string[]) {
        this._to = [...value];
    }

    set cc(value: string[]) {
        this._cc = [...value];
    }

    set bcc(value: string[]) {
        this._bcc = [...value];
    }

    set subject(value: string) {
        this._subject = value;
    }

    set body(value: string) {
        this._body = value;
    }

    set attachments(value: string[]) {
        this._attachments = [...value];
    }

    set isHtml(value: boolean) {
        this._isHtml = value;
    }

    set priority(value: 'high' | 'normal' | 'low') {
        this._priority = value;
    }

    // Methods
    addRecipient(email: string): void {
        this._to.push(email);
    }

    addCc(email: string): void {
        this._cc.push(email);
    }

    addBcc(email: string): void {
        this._bcc.push(email);
    }

    addAttachment(filePath: string): void {
        this._attachments.push(filePath);
    }

    removeRecipient(email: string): void {
        this._to = this._to.filter(e => e !== email);
    }

    removeCc(email: string): void {
        this._cc = this._cc.filter(e => e !== email);
    }

    removeBcc(email: string): void {
        this._bcc = this._bcc.filter(e => e !== email);
    }

    removeAttachment(filePath: string): void {
        this._attachments = this._attachments.filter(f => f !== filePath);
    }

    // Validation method
    validate(): boolean {
        return (
            this._from.length > 0 &&
            this._to.length > 0 &&
            this._subject.length > 0 &&
            this._body.length > 0
        );
    }

    // Convert to plain object
    toJSON(): Record<string, any> {
        return {
            from: this._from,
            to: this._to,
            cc: this._cc,
            bcc: this._bcc,
            subject: this._subject,
            body: this._body,
            attachments: this._attachments,
            isHtml: this._isHtml,
            priority: this._priority
        };
    }
} 