import { SimpleMessageWithMessageId } from './models/SimpleMessageWithMessageId';
import { User } from './models/User';
import { SocialNetwork } from './models/SocialNetwork';
import { EmailAddress } from './models/EmailAddress';
import { MessageDraft } from './models/MessageDraft';
import { FriendlymailMessageType } from './models/FriendlymailMessageType';
import { IMessageProcessor } from './MessageProcessor.interface';
import { encodeQuotedPrintable, decodeQuotedPrintable } from './utils/quotedPrintable';
import * as path from 'path';
import * as fs from 'fs';
import { VERSION, SIGNATURE } from './constants';

export class MessageProcessor implements IMessageProcessor {
    private _hostEmailAddress: EmailAddress;
    private _receivedMessages: SimpleMessageWithMessageId[];
    private _drafts: MessageDraft[];
    private _sentMessages: SimpleMessageWithMessageId[];
    private socialNetworks: Map<string, SocialNetwork>;

    constructor(hostEmailAddress: EmailAddress, receivedMessages: SimpleMessageWithMessageId[] = []) {
        this._hostEmailAddress = hostEmailAddress;
        this._receivedMessages = [...receivedMessages];
        this._drafts = [];
        this._sentMessages = [];
        this.socialNetworks = new Map();

        if (this.shouldCreateWelcomeMessageDraft()) {
            this.createWelcomeMessageDraftForHost();
        }

        this._receivedMessages.forEach(message => this.processMessage(message));
    }

    // ── Template loading ───────────────────────────────────────────────────────

    /**
     * Load a template from src/templates/<subdir>/ and substitute {{ key }} placeholders.
     */
    private _loadTemplate(subdir: string, filename: string, vars: Record<string, string>): string {
        const templatePath = path.join(process.cwd(), 'src', 'templates', subdir, filename);
        let content = fs.readFileSync(templatePath, 'utf8');
        for (const [key, value] of Object.entries(vars)) {
            content = content.split(`{{ ${key} }}`).join(value);
        }
        return content.trimEnd();
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /** Returns true if the subject identifies a friendlymail command message. */
    private _isFriendlymailSubject(subject: string): boolean {
        return subject === 'Fm' || subject === 'fm' || subject === '📻';
    }

    /**
     * Returns a display name derived from an email address.
     * Format: "FirstName X" where FirstName is the capitalised local-part and X
     * is an initial derived from the second-level domain (sum of letter positions mod 26).
     */
    private _displayName(email: EmailAddress): string {
        const local = email.getLocalPart();
        const firstName = local.charAt(0).toUpperCase() + local.slice(1);

        const domain = email.getDomain();
        const sld = domain.split('.')[0]; // e.g. 'test' from 'test.com'

        let sum = 0;
        for (const char of sld) {
            const code = char.toLowerCase().charCodeAt(0);
            if (code >= 97 && code <= 122) {
                sum += code - 96; // a=1 … z=26
            }
        }

        const position = sum % 26 || 26; // 0 → 26 (Z)
        const lastInitial = String.fromCharCode(64 + position);

        return `${firstName} ${lastInitial}`;
    }

    /**
     * Returns true if a response of the given type has already been sent to the
     * given recipient in reply to the specific triggering message (identified by
     * inReplyTo). Prevents duplicate replies for the same incoming message across
     * Daemon run cycles without blocking legitimate responses to new messages of
     * the same type.
     */
    private _hasResponseOfTypeToRecipient(type: FriendlymailMessageType, recipient: EmailAddress, inReplyTo: string): boolean {
        return this._receivedMessages.some(msg => {
            if (!msg.xFriendlymail) return false;
            if (!msg.to.some(addr => addr.equals(recipient))) return false;
            try {
                const meta = JSON.parse(decodeQuotedPrintable(msg.xFriendlymail));
                return meta.messageType === type && meta.inReplyTo === inReplyTo;
            } catch {
                return false;
            }
        });
    }

    /**
     * Returns true if a fatal "account required" invite (without --addfollower) error
     * has already been sent to the host.
     */
    private _hasInviteFatalResponseForHost(): boolean {
        return this._receivedMessages.some(msg => {
            if (!msg.xFriendlymail) return false;
            if (!msg.to.some(addr => addr.equals(this._hostEmailAddress))) return false;
            try {
                const meta = JSON.parse(decodeQuotedPrintable(msg.xFriendlymail));
                return meta.messageType === FriendlymailMessageType.INVITE
                    && msg.body.includes('Fatal: a friendlymail user account is required')
                    && !msg.body.includes('--addfollower');
            } catch { return false; }
        });
    }

    /**
     * Returns true if a fatal "account required" invite --addfollower error has already
     * been sent to the host.
     */
    private _hasInviteAddfollowerFatalResponseForHost(): boolean {
        return this._receivedMessages.some(msg => {
            if (!msg.xFriendlymail) return false;
            if (!msg.to.some(addr => addr.equals(this._hostEmailAddress))) return false;
            try {
                const meta = JSON.parse(decodeQuotedPrintable(msg.xFriendlymail));
                return meta.messageType === FriendlymailMessageType.INVITE
                    && msg.body.includes('Fatal: a friendlymail user account is required')
                    && msg.body.includes('--addfollower');
            } catch { return false; }
        });
    }

    /**
     * Returns true if a fatal "user already exists" adduser error has already been
     * sent to the host. Used to prevent re-sending the fatal on subsequent run cycles.
     */
    private _hasAdduserFatalResponseForHost(): boolean {
        return this._receivedMessages.some(msg => {
            if (!msg.xFriendlymail) return false;
            try {
                const meta = JSON.parse(decodeQuotedPrintable(msg.xFriendlymail));
                return meta.messageType === FriendlymailMessageType.ADDUSER_RESPONSE
                    && msg.body.includes('Fatal: a friendlymail user already exists');
            } catch {
                return false;
            }
        });
    }

    /** Returns true if the given address is a follower of the host. */
    private _isFollower(email: EmailAddress): boolean {
        return this.socialNetworks.get(this._hostEmailAddress.toString())?.isFollowedByEmail(email.toString()) ?? false;
    }

    /** Returns all create-post messages from the host (subject Fm, body not a command). */
    private getCreatePostMessages(): SimpleMessageWithMessageId[] {
        return this._receivedMessages.filter(msg =>
            this._isFriendlymailSubject(msg.subject) &&
            msg.from.equals(this._hostEmailAddress) &&
            !msg.body.trim().startsWith('$') &&
            !msg.xFriendlymail
        );
    }

    // ── Message processing ─────────────────────────────────────────────────────

    /**
     * Process a single received message and create at most one draft in response.
     */
    private processMessage(message: SimpleMessageWithMessageId): void {
        // Skip system-generated messages (replies from friendlymail itself)
        if (message.xFriendlymail) return;

        const subject = message.subject;
        const body = message.body.trim();
        const fromHost = message.from.equals(this._hostEmailAddress);
        const fromFollower = this._isFollower(message.from);

        // Like message: "Fm Like ❤️:<base64-message-id>" — followers only
        if (subject.startsWith('Fm Like')) {
            if (fromFollower && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.NEW_LIKE_NOTIFICATION, this._hostEmailAddress, message.messageId)) {
                this.createLikeNotification(message);
            }
            return;
        }

        // Comment message: "Fm Comment 💬:<base64-message-id>" — followers only
        if (subject.startsWith('Fm Comment')) {
            if (fromFollower && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.NEW_COMMENT_NOTIFICATION, this._hostEmailAddress, message.messageId)) {
                this.createCommentNotification(message);
            }
            return;
        }

        if (!this._isFriendlymailSubject(subject)) {
            return;
        }

        if (body === '$ help') {
            if (!this._hasResponseOfTypeToRecipient(FriendlymailMessageType.HELP, message.from, message.messageId)) {
                this.createHelpMessageDraft(message);
            }
        } else if (body.startsWith('$ adduser')) {
            if (!fromHost) {
                // Non-host: create account silently, then reply with permission denied
                this.createAccountFromMessage(message);
                if (!this._hasResponseOfTypeToRecipient(FriendlymailMessageType.ADDUSER_RESPONSE, message.from, message.messageId)) {
                    this._createAdduserPermissionDeniedDraft(message);
                }
            } else {
                const existingAccount = this.getAccountByEmail(this._hostEmailAddress.toString());
                if (existingAccount) {
                    // A user already exists for this host: reply with fatal error
                    if (!this._hasAdduserFatalResponseForHost()) {
                        this._createAdduserFatalDraft(message);
                    }
                } else {
                    const account = this.createAccountFromMessage(message);
                    if (account && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.ADDUSER_RESPONSE, this._hostEmailAddress, message.messageId)) {
                        this.createAdduserDraft(message, account.name, account.email.toString());
                    }
                }
            }
        } else if (body.startsWith('$ invite --addfollower')) {
            if (!fromHost) {
                // Host-only command: reply with permission denied
                if (!this._hasResponseOfTypeToRecipient(FriendlymailMessageType.INVITE, message.from, message.messageId)) {
                    this._createInvitePermissionDeniedDraft(message);
                }
            } else {
                const hostAccount = this.getAccountByEmail(this._hostEmailAddress.toString());
                if (!hostAccount) {
                    // No account yet: reply with fatal error
                    if (!this._hasInviteAddfollowerFatalResponseForHost()) {
                        this._createInviteFatalDraft(message);
                    }
                } else {
                    // Always populate followers map (needed for post notification recipients)
                    const followerEmail = this._applyInviteFollowerState(message);
                    if (followerEmail && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.INVITE, this._hostEmailAddress, message.messageId)) {
                        this._createInviteDraft(message, followerEmail);
                    }
                }
            }
        } else if (body.startsWith('$ invite')) {
            // invite without --addfollower: requires a host user account
            if (fromHost) {
                const hostAccount = this.getAccountByEmail(this._hostEmailAddress.toString());
                if (!hostAccount && !this._hasInviteFatalResponseForHost()) {
                    this._createInviteFatalDraft(message);
                }
            }
        } else if (body.startsWith('$ follow ') && !body.startsWith('$ follow --show')) {
            // $ follow <email>: adding a specific follower is host-only
            if (!fromHost && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.FOLLOW_RESPONSE, message.from, message.messageId)) {
                this._createFollowPermissionDeniedDraft(message);
            }
        } else if (body.startsWith('$ unfollow ')) {
            // $ unfollow <email>: removing a specific follower is host-only
            if (!fromHost && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.UNFOLLOW_RESPONSE, message.from, message.messageId)) {
                this._createUnfollowPermissionDeniedDraft(message);
            }
        } else if (fromHost && !body.startsWith('$')) {
            const hostAccount = this.getAccountByEmail(this._hostEmailAddress.toString());
            if (!hostAccount) {
                if (!this._hasResponseOfTypeToRecipient(FriendlymailMessageType.COMMAND_NOT_FOUND, this._hostEmailAddress, message.messageId)) {
                    this._createCommandNotFoundDraft(message);
                }
            } else if (!this._hasResponseOfTypeToRecipient(FriendlymailMessageType.NEW_POST_NOTIFICATION, this._hostEmailAddress, message.messageId)) {
                this.createPostNotifications(message);
            }
        }
    }

    // ── Account management ─────────────────────────────────────────────────────

    createAccountFromMessage(message: SimpleMessageWithMessageId): User | null {
        const fromEmail = message.from;
        if (!fromEmail) {
            console.warn('Cannot create account: missing from email');
            return null;
        }

        // Check if account already exists
        const existingAccount = this.getAccountByEmail(fromEmail.toString());
        if (existingAccount) {
            return existingAccount;
        }

        // Extract username: inline arg ("$ adduser Name"), next non-empty line ("$ adduser\n\nName"), or default
        const inlineMatch = message.body.match(/\$\s*(?:adduser|adduser)\s+([^\n]+)/);
        let username: string;
        if (inlineMatch) {
            username = inlineMatch[1].trim();
        } else {
            const nameLine = message.body.split('\n').slice(1).find(l => l.trim() && !l.trim().startsWith('$'));
            username = nameLine ? nameLine.trim() : this._displayName(fromEmail);
        }

        const user = new User(username, fromEmail);
        this.socialNetworks.set(fromEmail.toString(), new SocialNetwork(user));

        return user;
    }

    // ── Draft creation ─────────────────────────────────────────────────────────

    /**
     * Create a welcome message draft from host to host.
     */
    private createWelcomeMessageDraftForHost(): void {
        const hostEmail = this._hostEmailAddress.toString();

        try {
            const vars = { version: VERSION, host_email: hostEmail, signature: SIGNATURE };
            const body = this._loadTemplate('text', 'welcome.txt', vars);
            const html = this._loadTemplate('html', 'welcome_template.html', vars);

            const draft = new MessageDraft(
                this._hostEmailAddress,
                [this._hostEmailAddress],
                'Welcome to friendlymail!',
                body,
                {
                    html,
                    isHtml: false,
                    priority: 'normal',
                    messageType: FriendlymailMessageType.WELCOME
                }
            );

            this._drafts.push(draft);
        } catch (error) {
            console.warn(`Failed to create welcome message draft for host ${hostEmail}:`, error);
        }
    }

    /**
     * Create a help reply draft in response to a help command.
     */
    private createHelpMessageDraft(message: SimpleMessageWithMessageId): void {
        const sender = message.from;
        if (!sender) {
            console.warn('Cannot create help message: missing sender');
            return;
        }

        const hostEmail = this._hostEmailAddress.toString();
        const helpBody = this._loadTemplate('text', 'help.txt', {
            version: VERSION,
            host_email: hostEmail,
            signature: SIGNATURE,
        });

        const draft = new MessageDraft(
            this._hostEmailAddress,
            [sender],
            'Fm',
            helpBody,
            {
                inReplyTo: message.messageId,
                isHtml: false,
                priority: 'normal',
                messageType: FriendlymailMessageType.HELP
            }
        );

        this._drafts.push(draft);
    }

    /**
     * Create an adduser confirmation reply draft.
     */
    private createAdduserDraft(message: SimpleMessageWithMessageId, username: string, email: string): void {
        const body = this._loadTemplate('text', 'adduser_response.txt', {
            name: username,
            email,
            signature: SIGNATURE,
        });

        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            {
                inReplyTo: message.messageId,
                isHtml: false,
                priority: 'normal',
                messageType: FriendlymailMessageType.ADDUSER_RESPONSE
            }
        );

        this._drafts.push(draft);
    }

    /**
     * Extract the follower email from an "invite --addfollower" command and add it to
     * the followers map. Returns the follower email, or null if the command is malformed.
     * Always called (even when a reply has already been sent) so the followers map stays
     * up to date across Daemon run cycles.
     */
    private _applyInviteFollowerState(message: SimpleMessageWithMessageId): string | null {
        const match = message.body.match(/\$\s*invite\s+--addfollower\s+(\S+)/);
        if (!match) {
            console.warn('No email found in invite --addfollower command');
            return null;
        }

        const followerEmail = match[1].trim();
        this.socialNetworks.get(this._hostEmailAddress.toString())?.addFollowerEmail(followerEmail);

        return followerEmail;
    }

    /**
     * Create the confirmation draft reply for an "invite --addfollower" command.
     * Only called when no reply has been sent yet.
     */
    private _createInviteDraft(message: SimpleMessageWithMessageId, followerEmail: string): void {
        const body = this._loadTemplate('text', 'invite_addfollower_response.txt', {
            follower_email: followerEmail,
            signature: SIGNATURE,
        });

        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            {
                inReplyTo: message.messageId,
                isHtml: false,
                priority: 'normal',
                messageType: FriendlymailMessageType.INVITE
            }
        );

        this._drafts.push(draft);
    }

    /**
     * Create a permission denied reply for an adduser command from a non-host sender.
     */
    private _createAdduserPermissionDeniedDraft(message: SimpleMessageWithMessageId): void {
        const body = this._loadTemplate('text', 'adduser_permission_denied.txt', { signature: SIGNATURE });
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { inReplyTo: message.messageId, isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.ADDUSER_RESPONSE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create a fatal error reply when the host sends adduser but a user already exists.
     */
    private _createAdduserFatalDraft(message: SimpleMessageWithMessageId): void {
        const body = this._loadTemplate('text', 'adduser_fatal.txt', {
            host_email: this._hostEmailAddress.toString(),
            signature: SIGNATURE,
        });
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { inReplyTo: message.messageId, isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.ADDUSER_RESPONSE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create a permission denied reply for an invite command from a non-host sender.
     */
    private _createInvitePermissionDeniedDraft(message: SimpleMessageWithMessageId): void {
        const body = this._loadTemplate('text', 'invite_permission_denied.txt', {
            command: message.body.trim(),
            signature: SIGNATURE,
        });
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { inReplyTo: message.messageId, isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.INVITE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create a fatal error reply when the host sends invite without a user account.
     */
    private _createInviteFatalDraft(message: SimpleMessageWithMessageId): void {
        const body = this._loadTemplate('text', 'invite_fatal.txt', {
            command: message.body.trim(),
            signature: SIGNATURE,
        });
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { inReplyTo: message.messageId, isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.INVITE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create a permission denied reply for a follow <email> command from a non-host sender.
     */
    private _createFollowPermissionDeniedDraft(message: SimpleMessageWithMessageId): void {
        const body = this._loadTemplate('text', 'follow_permission_denied.txt', {
            command: message.body.trim(),
            signature: SIGNATURE,
        });
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { inReplyTo: message.messageId, isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.FOLLOW_RESPONSE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create a permission denied reply for an unfollow <email> command from a non-host sender.
     */
    private _createUnfollowPermissionDeniedDraft(message: SimpleMessageWithMessageId): void {
        const body = this._loadTemplate('text', 'unfollow_permission_denied.txt', {
            command: message.body.trim(),
            signature: SIGNATURE,
        });
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { inReplyTo: message.messageId, isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.UNFOLLOW_RESPONSE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create a "command not found" reply when the host sends a non-command body
     * without a user account existing.
     */
    private _createCommandNotFoundDraft(message: SimpleMessageWithMessageId): void {
        const body = this._loadTemplate('text', 'command_not_found.txt', {
            command: message.body.trim(),
            signature: SIGNATURE,
        });
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { inReplyTo: message.messageId, isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.COMMAND_NOT_FOUND }
        );
        this._drafts.push(draft);
    }

    /**
     * Create new post notification drafts for the host user and each follower.
     */
    private createPostNotifications(postMessage: SimpleMessageWithMessageId): void {
        const hostAccount = this.getAccountByEmail(this._hostEmailAddress.toString());
        const hostName = hostAccount
            ? hostAccount.name
            : this._displayName(this._hostEmailAddress);

        const postBody = postMessage.body.trim();
        const hostEmail = this._hostEmailAddress.toString();
        const followerEmails = this.socialNetworks.get(hostEmail)?.getFollowerEmails() ?? [];

        const base64Id = Buffer.from(`<${postMessage.messageId}>`).toString('base64');
        const likeLink = `Like ❤️: mailto:${hostEmail}?subject=Fm%20Like%20❤️:${base64Id}&body=❤️`;
        const commentLink = `Comment 💬: mailto:${hostEmail}?subject=Fm%20Comment%20💬:${base64Id}`;

        const notifBody = this._loadTemplate('text', 'post_notification.txt', {
            host_name: hostName,
            post_body: postBody,
            like_link: likeLink,
            comment_link: commentLink,
            signature: SIGNATURE,
        });

        const subject = `friendlymail: New post from ${hostName}`;
        const recipients: EmailAddress[] = [this._hostEmailAddress];

        for (const followerEmail of followerEmails) {
            const addr = EmailAddress.fromString(followerEmail);
            if (addr) recipients.push(addr);
        }

        for (const recipient of recipients) {
            const draft = new MessageDraft(
                this._hostEmailAddress,
                [recipient],
                subject,
                notifBody,
                {
                    inReplyTo: postMessage.messageId,
                    isHtml: false,
                    priority: 'normal',
                    messageType: FriendlymailMessageType.NEW_POST_NOTIFICATION
                }
            );
            this._drafts.push(draft);
        }
    }

    /**
     * Create a new like notification draft for the host user.
     */
    private createLikeNotification(likeMessage: SimpleMessageWithMessageId): void {
        const posts = this.getCreatePostMessages();
        if (posts.length === 0) return;

        const originalPost = posts[posts.length - 1];
        const senderName = this._displayName(likeMessage.from);
        const hostName = this._displayName(this._hostEmailAddress);
        const postBody = originalPost.body.trim();

        const body = this._loadTemplate('text', 'like_notification.txt', {
            sender_name: senderName,
            host_name: hostName,
            post_body: postBody,
            like_body: likeMessage.body.trim(),
            signature: SIGNATURE,
        });

        const draft = new MessageDraft(
            this._hostEmailAddress,
            [this._hostEmailAddress],
            `friendlymail: ${senderName} liked your post...`,
            body,
            {
                inReplyTo: likeMessage.messageId,
                isHtml: false,
                priority: 'normal',
                messageType: FriendlymailMessageType.NEW_LIKE_NOTIFICATION
            }
        );

        this._drafts.push(draft);
    }

    /**
     * Create a new comment notification draft for the host user.
     */
    private createCommentNotification(commentMessage: SimpleMessageWithMessageId): void {
        const posts = this.getCreatePostMessages();
        if (posts.length === 0) return;

        const originalPost = posts[posts.length - 1];
        const senderName = this._displayName(commentMessage.from);
        const hostName = this._displayName(this._hostEmailAddress);
        const postBody = originalPost.body.trim();
        const commentBody = commentMessage.body.trim();

        const base64Id = commentMessage.subject.replace(/^Fm Comment 💬:/, '').trim();
        const hostEmail = this._hostEmailAddress.toString();
        const likeLink = `Like ❤️: mailto:${hostEmail}?subject=Fm%20Like%20❤️:${base64Id}&body=❤️`;
        const commentLink = `Comment 💬: mailto:${hostEmail}?subject=Fm%20Comment%20💬:${base64Id}`;

        const body = this._loadTemplate('text', 'comment_notification.txt', {
            sender_name: senderName,
            host_name: hostName,
            post_body: postBody,
            comment_body: commentBody,
            like_link: likeLink,
            comment_link: commentLink,
            signature: SIGNATURE,
        });

        const draft = new MessageDraft(
            this._hostEmailAddress,
            [this._hostEmailAddress],
            `friendlymail: New comment from ${senderName}`,
            body,
            {
                inReplyTo: commentMessage.messageId,
                isHtml: false,
                priority: 'normal',
                messageType: FriendlymailMessageType.NEW_COMMENT_NOTIFICATION
            }
        );

        this._drafts.push(draft);
    }

    // ── Follow / unfollow ──────────────────────────────────────────────────────

    follow(follower: User, followee: User): void {
        const followerEmail = follower.email.toString();
        const followeeEmail = followee.email.toString();

        if (followerEmail === followeeEmail) {
            console.warn('Cannot follow yourself');
            return;
        }

        this.socialNetworks.get(followerEmail)?.addFollowingEmail(followeeEmail);
        this.socialNetworks.get(followeeEmail)?.addFollowerEmail(followerEmail);
    }

    unfollow(follower: User, followee: User): void {
        const followerEmail = follower.email.toString();
        const followeeEmail = followee.email.toString();

        this.socialNetworks.get(followerEmail)?.removeFollowingEmail(followeeEmail);
        this.socialNetworks.get(followeeEmail)?.removeFollowerEmail(followerEmail);
    }

    getFollowing(account: User): User[] {
        const sn = this.socialNetworks.get(account.email.toString());
        return (sn?.getFollowingEmails() ?? [])
            .map(e => this.getAccountByEmail(e))
            .filter((a): a is User => a !== null);
    }

    getFollowers(account: User): User[] {
        const sn = this.socialNetworks.get(account.email.toString());
        return (sn?.getFollowerEmails() ?? [])
            .map(e => this.getAccountByEmail(e))
            .filter((a): a is User => a !== null);
    }

    isFollowing(follower: User, followee: User): boolean {
        return this.socialNetworks.get(follower.email.toString())?.isFollowingEmail(followee.email.toString()) ?? false;
    }

    isFollowedBy(followee: User, follower: User): boolean {
        return this.socialNetworks.get(followee.email.toString())?.isFollowedByEmail(follower.email.toString()) ?? false;
    }

    // ── Account accessors ──────────────────────────────────────────────────────

    addAccount(account: User): void {
        this.socialNetworks.set(account.email.toString(), new SocialNetwork(account));
    }

    getAccountByEmail(email: string): User | null {
        return this.socialNetworks.get(email)?.getUser() || null;
    }

    getAllAccounts(): User[] {
        return Array.from(this.socialNetworks.values()).map(n => n.getUser());
    }

    // ── Message accessors ──────────────────────────────────────────────────────

    getAllMessages(): SimpleMessageWithMessageId[] {
        return [...this._receivedMessages];
    }

    getMessagesFrom(sender: EmailAddress): SimpleMessageWithMessageId[] {
        return this._receivedMessages.filter(message => message.from.equals(sender));
    }

    getMessagesTo(recipient: EmailAddress): SimpleMessageWithMessageId[] {
        return this._receivedMessages.filter(message => message.to.some(addr => addr.equals(recipient)));
    }

    getMessagesWithSubject(subject: string): SimpleMessageWithMessageId[] {
        return this._receivedMessages.filter(message => message.subject === subject);
    }

    getMessagesContaining(text: string): SimpleMessageWithMessageId[] {
        return this._receivedMessages.filter(message => message.body.includes(text));
    }

    getMessagesInDateRange(startDate: Date, endDate: Date): SimpleMessageWithMessageId[] {
        return this._receivedMessages.filter(message =>
            message.date >= startDate && message.date <= endDate
        );
    }

    removeMessage(message: SimpleMessageWithMessageId): void {
        this._receivedMessages = this._receivedMessages.filter(m => m !== message);
    }

    clearMessages(): void {
        this._receivedMessages = [];
    }

    getMessageCount(): number {
        return this._receivedMessages.length;
    }

    getUniqueSenders(): EmailAddress[] {
        return Array.from(new Set(this._receivedMessages.map(message => message.from)));
    }

    getUniqueRecipients(): EmailAddress[] {
        const recipients = this._receivedMessages.flatMap(message => message.to);
        return Array.from(new Set(recipients));
    }

    getMessagesGroupedBySender(): Map<EmailAddress, SimpleMessageWithMessageId[]> {
        const grouped = new Map<EmailAddress, SimpleMessageWithMessageId[]>();
        for (const message of this._receivedMessages) {
            if (!grouped.has(message.from)) {
                grouped.set(message.from, []);
            }
            grouped.get(message.from)!.push(message);
        }
        return grouped;
    }

    getHostSocialNetwork(): SocialNetwork | null {
        return this.socialNetworks.get(this._hostEmailAddress.toString()) || null;
    }

    // ── Welcome deduplication ──────────────────────────────────────────────────

    /**
     * Returns true if any received message carries an xFriendlymail value
     * identifying it as a welcome message.
     */
    private _welcomeMessageExists(): boolean {
        return this._receivedMessages.some(msg => {
            if (!msg.xFriendlymail) return false;
            try {
                const meta = JSON.parse(decodeQuotedPrintable(msg.xFriendlymail));
                return meta.messageType === FriendlymailMessageType.WELCOME;
            } catch {
                return false;
            }
        });
    }

    /**
     * Returns true if a welcome message draft should be created.
     */
    private shouldCreateWelcomeMessageDraft(): boolean {
        return !this._welcomeMessageExists();
    }

    // ── Draft management ───────────────────────────────────────────────────────

    getMessageDrafts(): MessageDraft[] {
        return [...this._drafts];
    }

    removeDraft(draft: MessageDraft): void {
        this._drafts = this._drafts.filter(d => d !== draft);
    }

    hasWelcomeMessageBeenSent(sender: EmailAddress): boolean {
        return this._welcomeMessageExists();
    }

    getSentMessages(): SimpleMessageWithMessageId[] {
        return [...this._sentMessages];
    }
}
