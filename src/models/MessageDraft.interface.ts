import { EmailAddress } from './EmailAddress.impl';
import { EmailMessage } from '../../EmailMessage';
import { FriendlymailMessageType } from './FriendlymailMessageType';

/**
 * Interface for MessageDraft data type
 */
export interface IMessageDraft {
    readonly from: EmailAddress | null;
    readonly to: EmailAddress[];
    readonly cc: EmailAddress[];
    readonly bcc: EmailAddress[];
    readonly subject: string;
    readonly body: string;
    readonly attachments: string[];
    readonly isHtml: boolean;
    readonly priority: 'high' | 'normal' | 'low';
    readonly messageType: FriendlymailMessageType | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;

    addRecipient(email: EmailAddress): void;
    addCc(email: EmailAddress): void;
    addBcc(email: EmailAddress): void;
    addAttachment(filePath: string): void;
    removeRecipient(email: EmailAddress): void;
    removeCc(email: EmailAddress): void;
    removeBcc(email: EmailAddress): void;
    removeAttachment(filePath: string): void;
    isReadyToSend(): boolean;
    toJSON(): Record<string, any>;
}

export interface IMessageDraftStatic {
    fromEmailMessage(message: EmailMessage): IMessageDraft;
    fromJSON(json: Record<string, any>): IMessageDraft;
}
