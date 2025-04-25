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

    // Static factory method to create from text file
    static async fromTextFile(filePath: string): Promise<EmailMessage> {
        const fs = require('fs');
        const path = require('path');

        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const lines = content.split('\n');

            // Initialize variables
            let from = '';
            let to: string[] = [];
            let cc: string[] = [];
            let bcc: string[] = [];
            let subject = '';
            let body = '';
            let isHtml = false;
            let priority: 'high' | 'normal' | 'low' = 'normal';
            let attachments: string[] = [];

            // Parse headers
            let inBody = false;
            let currentHeader = '';
            let currentValue = '';

            for (const line of lines) {
                if (!inBody) {
                    if (line.trim() === '') {
                        inBody = true;
                        continue;
                    }

                    // Handle multi-line headers
                    if (line.startsWith(' ') || line.startsWith('\t')) {
                        if (currentHeader) {
                            currentValue += ' ' + line.trim();
                        }
                        continue;
                    }

                    // Process the previous header if exists
                    if (currentHeader) {
                        switch (currentHeader.toLowerCase()) {
                            case 'from:':
                                from = currentValue;
                                break;
                            case 'to:':
                                to = currentValue.split(',').map(email => email.trim());
                                break;
                            case 'cc:':
                                cc = currentValue.split(',').map(email => email.trim());
                                break;
                            case 'bcc:':
                                bcc = currentValue.split(',').map(email => email.trim());
                                break;
                            case 'subject:':
                                subject = currentValue;
                                break;
                            case 'content-type:':
                                isHtml = currentValue.includes('text/html');
                                break;
                            case 'x-priority:':
                                const prio = currentValue.toLowerCase();
                                if (['high', 'normal', 'low'].includes(prio)) {
                                    priority = prio as 'high' | 'normal' | 'low';
                                }
                                break;
                            case 'x-attachment:':
                                attachments.push(currentValue);
                                break;
                        }
                    }

                    // Start new header
                    const headerMatch = line.match(/^([^:]+):\s*(.*)$/);
                    if (headerMatch) {
                        currentHeader = headerMatch[1] + ':';
                        currentValue = headerMatch[2].trim();
                    }
                } else {
                    body += line + '\n';
                }
            }

            // Process the last header
            if (currentHeader) {
                switch (currentHeader.toLowerCase()) {
                    case 'from:':
                        from = currentValue;
                        break;
                    case 'to:':
                        to = currentValue.split(',').map(email => email.trim());
                        break;
                    case 'cc:':
                        cc = currentValue.split(',').map(email => email.trim());
                        break;
                    case 'bcc:':
                        bcc = currentValue.split(',').map(email => email.trim());
                        break;
                    case 'subject:':
                        subject = currentValue;
                        break;
                    case 'content-type:':
                        isHtml = currentValue.includes('text/html');
                        break;
                    case 'x-priority:':
                        const prio = currentValue.toLowerCase();
                        if (['high', 'normal', 'low'].includes(prio)) {
                            priority = prio as 'high' | 'normal' | 'low';
                        }
                        break;
                    case 'x-attachment:':
                        attachments.push(currentValue);
                        break;
                }
            }

            // Trim the last newline from the body
            body = body.trim();

            // Validate required fields
            if (!from || to.length === 0 || !subject || !body) {
                throw new Error('Missing required email fields in file');
            }

            return new EmailMessage(from, to, subject, body, {
                cc,
                bcc,
                attachments,
                isHtml,
                priority
            });
        } catch (error) {
            throw new Error(`Failed to create EmailMessage from file: ${error.message}`);
        }
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