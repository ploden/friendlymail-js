import { ProcessMessages } from '../src/ProcessMessages';
import { EmailMessage } from '../EmailMessage';
import { EmailAddress } from '../src/models/EmailAddress';
import { MessageDraft } from '../src/models/MessageDraft';
import * as fs from 'fs';
import * as path from 'path';
import { Account } from '../src/models/Account';
import { User } from '../src/models/User';
import { VERSION, SIGNATURE } from '../src/constants';

describe('ProcessMessages', () => {
    let processor: ProcessMessages;
    let message1: EmailMessage;
    let message2: EmailMessage;
    let message3: EmailMessage;
    let createAccountMessage: EmailMessage;
    let createAccountMessage2: EmailMessage;
    let sender1: EmailAddress;
    let sender2: EmailAddress;
    let recipient1: EmailAddress;
    let recipient2: EmailAddress;

    beforeEach(async () => {
        const hostEmail = new EmailAddress('friendlymail@example.com');
        processor = new ProcessMessages(hostEmail);

        sender1 = new EmailAddress('sender1@example.com');
        sender2 = new EmailAddress('sender2@example.com');
        recipient1 = new EmailAddress('recipient1@example.com');
        recipient2 = new EmailAddress('recipient2@example.com');

        message1 = new EmailMessage(
            sender1,
            [recipient1],
            'Test Subject 1',
            'Test Body 1',
            {
                priority: 'normal',
                isHtml: false,
                attachments: []
            }
        );

        message2 = new EmailMessage(
            sender1,
            [recipient2],
            'Test Subject 2',
            'Test Body 2',
            {
                priority: 'high',
                isHtml: false,
                attachments: []
            }
        );

        message3 = new EmailMessage(
            sender2,
            [recipient1],
            'Test Subject 3',
            'Test Body 3',
            {
                priority: 'normal',
                isHtml: true,
                attachments: []
            }
        );
    });

    it('placeholder test', () => {
        expect(true).toBe(true);
    });

}); 