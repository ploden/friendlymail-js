import { EmailAddress } from './src/models/EmailAddress';

export class EmailMessage {
    private _from: EmailAddress;
    private _to: EmailAddress[];
    private _cc: EmailAddress[];
    private _bcc: EmailAddress[];
    private _subject: string;
    private _body: string;
    private _attachments: string[];
    private _isHtml: boolean;
    private _priority: 'high' | 'normal' | 'low';
    private _customHeaders: Map<string, string>;

    constructor(
        from: EmailAddress,
        to: EmailAddress[],
        subject: string,
        body: string,
        options: {
            cc?: EmailAddress[];
            bcc?: EmailAddress[];
            attachments?: string[];
            isHtml?: boolean;
            priority?: 'high' | 'normal' | 'low';
            customHeaders?: Map<string, string>;
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
        this._customHeaders = options.customHeaders ? new Map(options.customHeaders) : new Map();
    }

    // Static factory method to create from text file
    static async fromTextFile(filePath: string): Promise<EmailMessage> {
        const fs = require('fs');
        const path = require('path');

        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const lines = content.split('\n');

            // Initialize variables
            let from: EmailAddress | null = null;
            let to: EmailAddress[] = [];
            let cc: EmailAddress[] = [];
            let bcc: EmailAddress[] = [];
            let subject = '';
            let body = '';
            let isHtml = false;
            let priority: 'high' | 'normal' | 'low' = 'normal';
            let attachments: string[] = [];
            let customHeaders = new Map<string, string>();

            // Parse headers
            let inBody = false;
            let currentHeader = '';
            let currentValue = '';

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                if (!inBody) {
                    if (line.trim() === '') {
                        inBody = true;
                        continue;
                    }

                    // Handle multi-line headers
                    if (line.startsWith(' ') || line.startsWith('\t')) {
                        if (currentHeader) {
                            currentValue += ' ' + line.trim();
                            continue;
                        }
                    }

                    // Process the previous header if exists
                    if (currentHeader) {
                        switch (currentHeader.toLowerCase()) {
                            case 'from':
                                from = EmailAddress.fromDisplayString(currentValue);
                                break;
                            case 'to':
                                to = currentValue.split(',').map(email => {
                                    const addr = EmailAddress.fromDisplayString(email.trim());
                                    if (!addr) throw new Error(`Invalid email address in To: ${email}`);
                                    return addr;
                                });
                                break;
                            case 'cc':
                                cc = currentValue.split(',').map(email => {
                                    const addr = EmailAddress.fromDisplayString(email.trim());
                                    if (!addr) throw new Error(`Invalid email address in Cc: ${email}`);
                                    return addr;
                                });
                                break;
                            case 'bcc':
                                bcc = currentValue.split(',').map(email => {
                                    const addr = EmailAddress.fromDisplayString(email.trim());
                                    if (!addr) throw new Error(`Invalid email address in Bcc: ${email}`);
                                    return addr;
                                });
                                break;
                            case 'subject':
                                subject = currentValue;
                                break;
                            case 'content-type':
                                isHtml = currentValue.toLowerCase().includes('text/html');
                                break;
                            case 'x-priority':
                                const prio = currentValue.toLowerCase();
                                if (['high', 'normal', 'low'].includes(prio)) {
                                    priority = prio as 'high' | 'normal' | 'low';
                                }
                                break;
                            case 'x-attachment':
                                attachments.push(currentValue);
                                break;
                            case 'x-friendlymail':
                                customHeaders.set('X-friendlymail', currentValue);
                                break;
                        }
                    }

                    // Start new header
                    const headerMatch = line.match(/^([^:]+):\s*(.*)$/);
                    if (headerMatch) {
                        currentHeader = headerMatch[1].trim();
                        currentValue = headerMatch[2].trim();
                    }
                } else {
                    // Skip empty lines at the start of the body
                    if (body === '' && line.trim() === '') {
                        continue;
                    }
                    body += line + '\n';
                }
            }

            // Process the last header
            if (currentHeader) {
                switch (currentHeader.toLowerCase()) {
                    case 'from':
                        from = EmailAddress.fromDisplayString(currentValue);
                        break;
                    case 'to':
                        to = currentValue.split(',').map(email => {
                            const addr = EmailAddress.fromDisplayString(email.trim());
                            if (!addr) throw new Error(`Invalid email address in To: ${email}`);
                            return addr;
                        });
                        break;
                    case 'cc':
                        cc = currentValue.split(',').map(email => {
                            const addr = EmailAddress.fromDisplayString(email.trim());
                            if (!addr) throw new Error(`Invalid email address in Cc: ${email}`);
                            return addr;
                        });
                        break;
                    case 'bcc':
                        bcc = currentValue.split(',').map(email => {
                            const addr = EmailAddress.fromDisplayString(email.trim());
                            if (!addr) throw new Error(`Invalid email address in Bcc: ${email}`);
                            return addr;
                        });
                        break;
                    case 'subject':
                        subject = currentValue;
                        break;
                    case 'content-type':
                        isHtml = currentValue.toLowerCase().includes('text/html');
                        break;
                    case 'x-priority':
                        const prio = currentValue.toLowerCase();
                        if (['high', 'normal', 'low'].includes(prio)) {
                            priority = prio as 'high' | 'normal' | 'low';
                        }
                        break;
                            case 'x-attachment':
                                attachments.push(currentValue);
                                break;
                            case 'x-friendlymail':
                                customHeaders.set('X-friendlymail', currentValue);
                                break;
                }
            }

            // Trim the last newline from the body
            body = body.trim();

            // Debug log before validation
            console.log('Parsed email fields:', { 
                from: from?.toString(), 
                to: to.map(addr => addr.toString()), 
                subject, 
                body 
            });

            // Validate required fields
            if (!from || to.length === 0 || !subject || !body) {
                console.error('Missing required fields:', { 
                    from: from?.toString(), 
                    to: to.map(addr => addr.toString()), 
                    subject, 
                    body 
                });
                throw new Error('Missing required email fields in file');
            }

            return new EmailMessage(from, to, subject, body, {
                cc,
                bcc,
                attachments,
                isHtml,
                priority,
                customHeaders: customHeaders.size > 0 ? customHeaders : undefined
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to create EmailMessage from file: ${errorMessage}`);
        }
    }

    // Getters
    get from(): EmailAddress {
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

    /**
     * Get a custom header value
     */
    getCustomHeader(name: string): string | undefined {
        return this._customHeaders.get(name);
    }

    /**
     * Get all custom headers
     */
    getCustomHeaders(): Map<string, string> {
        return new Map(this._customHeaders);
    }

    // Setters
    set from(value: EmailAddress) {
        this._from = value;
    }

    set to(value: EmailAddress[]) {
        this._to = [...value];
    }

    set cc(value: EmailAddress[]) {
        this._cc = [...value];
    }

    set bcc(value: EmailAddress[]) {
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

    /**
     * Set a custom header value
     */
    setCustomHeader(name: string, value: string): void {
        this._customHeaders.set(name, value);
    }

    // Methods
    addRecipient(email: EmailAddress): void {
        this._to.push(email);
    }

    addCc(email: EmailAddress): void {
        this._cc.push(email);
    }

    addBcc(email: EmailAddress): void {
        this._bcc.push(email);
    }

    addAttachment(filePath: string): void {
        this._attachments.push(filePath);
    }

    removeRecipient(email: EmailAddress): void {
        this._to = this._to.filter(e => !e.equals(email));
    }

    removeCc(email: EmailAddress): void {
        this._cc = this._cc.filter(e => !e.equals(email));
    }

    removeBcc(email: EmailAddress): void {
        this._bcc = this._bcc.filter(e => !e.equals(email));
    }

    removeAttachment(filePath: string): void {
        this._attachments = this._attachments.filter(f => f !== filePath);
    }

    validate(): boolean {
        return !!this._from && this._to.length > 0 && !!this._subject && !!this._body;
    }

    toJSON(): Record<string, any> {
        const customHeadersObj: Record<string, string> = {};
        this._customHeaders.forEach((value, key) => {
            customHeadersObj[key] = value;
        });
        return {
            from: this._from.toString(),
            to: this._to.map(addr => addr.toString()),
            cc: this._cc.map(addr => addr.toString()),
            bcc: this._bcc.map(addr => addr.toString()),
            subject: this._subject,
            body: this._body,
            attachments: this._attachments,
            isHtml: this._isHtml,
            priority: this._priority,
            customHeaders: customHeadersObj
        };
    }
} 