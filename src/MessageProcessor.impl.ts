import { SimpleMessage } from './models/SimpleMessage';
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
    private _receivedMessages: SimpleMessage[];
    private _drafts: MessageDraft[];
    private _sentMessages: SimpleMessage[];
    private socialNetworks: Map<string, SocialNetwork>;
    private following: Map<string, Set<string>>;
    private followers: Map<string, Set<string>>;

    constructor(hostEmailAddress: EmailAddress, receivedMessages: SimpleMessage[] = []) {
        this._hostEmailAddress = hostEmailAddress;
        this._receivedMessages = [...receivedMessages];
        this._drafts = [];
        this._sentMessages = [];
        this.socialNetworks = new Map();
        this.following = new Map();
        this.followers = new Map();

        if (this.shouldCreateWelcomeMessageDraft()) {
            this.createWelcomeMessageDraftForHost();
        }

        this._receivedMessages.forEach(message => this.processMessage(message));
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
     * given recipient (prevents duplicate replies across Daemon run cycles).
     */
    private _hasResponseOfTypeToRecipient(type: FriendlymailMessageType, recipient: EmailAddress): boolean {
        return this._receivedMessages.some(msg => {
            if (!msg.xFriendlymail) return false;
            if (!msg.to.some(addr => addr.equals(recipient))) return false;
            try {
                const meta = JSON.parse(decodeQuotedPrintable(msg.xFriendlymail));
                return meta.messageType === type;
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
        const hostEmail = this._hostEmailAddress.toString();
        return this.followers.get(hostEmail)?.has(email.toString()) ?? false;
    }

    /**
     * Returns true if a NEW_POST_NOTIFICATION already exists in the store
     * whose body contains the given post content (used to prevent re-notifying
     * for the same post on every run cycle).
     */
    private _hasPostNotificationForContent(content: string): boolean {
        return this._receivedMessages.some(msg => {
            if (!msg.xFriendlymail) return false;
            try {
                const meta = JSON.parse(decodeQuotedPrintable(msg.xFriendlymail));
                return meta.messageType === FriendlymailMessageType.NEW_POST_NOTIFICATION
                    && msg.body.includes(content);
            } catch {
                return false;
            }
        });
    }

    /** Returns all create-post messages from the host (subject Fm, body not a command). */
    private getCreatePostMessages(): SimpleMessage[] {
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
    private processMessage(message: SimpleMessage): void {
        // Skip system-generated messages (replies from friendlymail itself)
        if (message.xFriendlymail) return;

        const subject = message.subject;
        const body = message.body.trim();
        const fromHost = message.from.equals(this._hostEmailAddress);
        const fromFollower = this._isFollower(message.from);

        // Like message: "Fm Like ❤️:<base64-message-id>" — followers only
        if (subject.startsWith('Fm Like')) {
            if (fromFollower && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.NEW_LIKE_NOTIFICATION, this._hostEmailAddress)) {
                this.createLikeNotification(message);
            }
            return;
        }

        // Comment message: "Fm Comment 💬:<base64-message-id>" — followers only
        if (subject.startsWith('Fm Comment')) {
            if (fromFollower && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.NEW_COMMENT_NOTIFICATION, this._hostEmailAddress)) {
                this.createCommentNotification(message);
            }
            return;
        }

        if (!this._isFriendlymailSubject(subject)) {
            return;
        }

        if (body === '$ help') {
            if (!this._hasResponseOfTypeToRecipient(FriendlymailMessageType.HELP, message.from)) {
                this.createHelpMessageDraft(message);
            }
        } else if (body.startsWith('$ adduser')) {
            if (!fromHost) {
                // Non-host: create account silently, then reply with permission denied
                this.createAccountFromMessage(message);
                if (!this._hasResponseOfTypeToRecipient(FriendlymailMessageType.ADDUSER_RESPONSE, message.from)) {
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
                    if (account && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.ADDUSER_RESPONSE, this._hostEmailAddress)) {
                        this.createAdduserDraft(message, account.username, account.email.toString());
                    }
                }
            }
        } else if (body.startsWith('$ invite --addfollower')) {
            if (!fromHost) {
                // Host-only command: reply with permission denied
                if (!this._hasResponseOfTypeToRecipient(FriendlymailMessageType.INVITE, message.from)) {
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
                    if (followerEmail && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.INVITE, this._hostEmailAddress)) {
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
            if (!fromHost && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.FOLLOW_RESPONSE, message.from)) {
                this._createFollowPermissionDeniedDraft(message);
            }
        } else if (body.startsWith('$ unfollow ')) {
            // $ unfollow <email>: removing a specific follower is host-only
            if (!fromHost && !this._hasResponseOfTypeToRecipient(FriendlymailMessageType.UNFOLLOW_RESPONSE, message.from)) {
                this._createUnfollowPermissionDeniedDraft(message);
            }
        } else if (fromHost && !body.startsWith('$')) {
            if (!this._hasPostNotificationForContent(body)) {
                this.createPostNotifications(message);
            }
        }
    }

    // ── Account management ─────────────────────────────────────────────────────

    createAccountFromMessage(message: SimpleMessage): User | null {
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
        const socialNetwork = new SocialNetwork(user);
        this.socialNetworks.set(fromEmail.toString(), socialNetwork);

        return user;
    }

    // ── Draft creation ─────────────────────────────────────────────────────────

    /**
     * Create a welcome message draft from host to host.
     */
    private createWelcomeMessageDraftForHost(): void {
        const hostEmail = this._hostEmailAddress.toString();

        try {
            const templatePath = path.join(process.cwd(), 'src', 'templates', 'welcome_template.txt');
            const templateContent = fs.readFileSync(templatePath, 'utf8');

            const body = templateContent
                .replace('{{ version }}', VERSION)
                .replace('{{ host_email }}', hostEmail)
                .replace('{{ signature }}', SIGNATURE);

            const draft = new MessageDraft(
                this._hostEmailAddress,
                [this._hostEmailAddress],
                'Welcome to friendlymail!',
                body,
                {
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
    private createHelpMessageDraft(message: SimpleMessage): void {
        const sender = message.from;
        if (!sender) {
            console.warn('Cannot create help message: missing sender');
            return;
        }

        const hostEmail = this._hostEmailAddress.toString();
        const helpBody = `$ help
friendlymail: friendlymail, version ${VERSION}
These shell commands are defined internally.  Type \`$ help' to see this list.

Type \`$ adduser' to create an account and start using friendlymail.

Type \`$ help adduser' to find out more about the function \`adduser'.

$ help: mailto:${hostEmail}?subject=Fm&body=%24%20help
$ adduser: mailto:${hostEmail}?subject=Fm&body=%24%20adduser
$ help adduser: mailto:${hostEmail}?subject=Fm&body=%24%20help%20adduser
$ invite: mailto:${hostEmail}?subject=Fm&body=%24%20invite
$ help invite: mailto:${hostEmail}?subject=Fm&body=%24%20help%20invite
$ follow: mailto:${hostEmail}?subject=Fm&body=%24%20follow
$ help follow: mailto:${hostEmail}?subject=Fm&body=%24%20help%20follow

${SIGNATURE}`;

        const draft = new MessageDraft(
            this._hostEmailAddress,
            [sender],
            'Fm',
            helpBody,
            {
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
    private createAdduserDraft(message: SimpleMessage, username: string, email: string): void {
        const body = `$ adduser
Adding friendlymail user with name \`${username}' and email \`${email}' ...
Done.

To create your first post, reply to this message, or open the link below.

Create post: mailto:${email}?subject=Fm&body=Hello%2C+world

${SIGNATURE}`;

        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            {
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
    private _applyInviteFollowerState(message: SimpleMessage): string | null {
        const match = message.body.match(/\$\s*invite\s+--addfollower\s+(\S+)/);
        if (!match) {
            console.warn('No email found in invite --addfollower command');
            return null;
        }

        const followerEmail = match[1].trim();
        const hostEmail = this._hostEmailAddress.toString();

        if (!this.followers.has(hostEmail)) {
            this.followers.set(hostEmail, new Set());
        }
        this.followers.get(hostEmail)!.add(followerEmail);

        return followerEmail;
    }

    /**
     * Create the confirmation draft reply for an "invite --addfollower" command.
     * Only called when no reply has been sent yet.
     */
    private _createInviteDraft(message: SimpleMessage, followerEmail: string): void {
        const body = `$ invite --addfollower ${followerEmail}
invite: ${followerEmail} is now following you.

${SIGNATURE}`;

        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            {
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
    private _createAdduserPermissionDeniedDraft(message: SimpleMessage): void {
        const body = `$ adduser\nadduser: Permission denied\n\n${SIGNATURE}`;
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.ADDUSER_RESPONSE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create a fatal error reply when the host sends adduser but a user already exists.
     */
    private _createAdduserFatalDraft(message: SimpleMessage): void {
        const hostEmail = this._hostEmailAddress.toString();
        const body = `$ adduser\nadduser: Fatal: a friendlymail user already exists for ${hostEmail}\n\n${SIGNATURE}`;
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.ADDUSER_RESPONSE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create a permission denied reply for an invite command from a non-host sender.
     */
    private _createInvitePermissionDeniedDraft(message: SimpleMessage): void {
        const body = `${message.body.trim()}\ninvite: Permission denied\n\n${SIGNATURE}`;
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.INVITE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create a fatal error reply when the host sends invite without a user account.
     */
    private _createInviteFatalDraft(message: SimpleMessage): void {
        const body = `${message.body.trim()}\ninvite: Fatal: a friendlymail user account is required for this command.\n\n${SIGNATURE}`;
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.INVITE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create a permission denied reply for a follow <email> command from a non-host sender.
     */
    private _createFollowPermissionDeniedDraft(message: SimpleMessage): void {
        const body = `${message.body.trim()}\nfollow: Permission denied\n\n${SIGNATURE}`;
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.FOLLOW_RESPONSE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create a permission denied reply for an unfollow <email> command from a non-host sender.
     */
    private _createUnfollowPermissionDeniedDraft(message: SimpleMessage): void {
        const body = `${message.body.trim()}\nunfollow: Permission denied\n\n${SIGNATURE}`;
        const draft = new MessageDraft(
            this._hostEmailAddress,
            [message.from],
            'Fm',
            body,
            { isHtml: false, priority: 'normal', messageType: FriendlymailMessageType.UNFOLLOW_RESPONSE }
        );
        this._drafts.push(draft);
    }

    /**
     * Create new post notification drafts for the host user and each follower.
     */
    private createPostNotifications(postMessage: SimpleMessage): void {
        const hostAccount = this.getAccountByEmail(this._hostEmailAddress.toString());
        const hostName = hostAccount
            ? hostAccount.username
            : this._displayName(this._hostEmailAddress);

        const postBody = postMessage.body.trim();
        const hostEmail = this._hostEmailAddress.toString();
        const followerEmails = Array.from(this.followers.get(hostEmail) || new Set<string>());

        const base64Id = Buffer.from(`<post:${postBody.substring(0, 20)}>`).toString('base64');
        const likeLink = `Like ❤️: mailto:${hostEmail}?subject=Fm%20Like%20❤️:${base64Id}&body=❤️`;
        const commentLink = `Comment 💬: mailto:${hostEmail}?subject=Fm%20Comment%20💬:${base64Id}`;

        const notifBody = `${hostName} --> posted:

"${postBody}"

${likeLink}
${commentLink}

${SIGNATURE}`;

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
    private createLikeNotification(likeMessage: SimpleMessage): void {
        const posts = this.getCreatePostMessages();
        if (posts.length === 0) return;

        const originalPost = posts[posts.length - 1];
        const senderName = this._displayName(likeMessage.from);
        const hostName = this._displayName(this._hostEmailAddress);
        const postBody = originalPost.body.trim();

        const body = `${senderName} --> liked your post.

${hostName}:
"${postBody}"

${senderName}:
"${likeMessage.body.trim()}"

${SIGNATURE}`;

        const draft = new MessageDraft(
            this._hostEmailAddress,
            [this._hostEmailAddress],
            `friendlymail: ${senderName} liked your post...`,
            body,
            {
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
    private createCommentNotification(commentMessage: SimpleMessage): void {
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

        const body = `${senderName} --> commented on your post:

"${commentBody}"

${likeLink}
${commentLink}

Comment thread:

${hostName}:
"${postBody}"

${senderName}:
"${commentBody}"

${SIGNATURE}`;

        const draft = new MessageDraft(
            this._hostEmailAddress,
            [this._hostEmailAddress],
            `friendlymail: New comment from ${senderName}`,
            body,
            {
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

        if (!this.following.has(followerEmail)) {
            this.following.set(followerEmail, new Set());
        }
        if (!this.followers.has(followeeEmail)) {
            this.followers.set(followeeEmail, new Set());
        }

        this.following.get(followerEmail)!.add(followeeEmail);
        this.followers.get(followeeEmail)!.add(followerEmail);
    }

    unfollow(follower: User, followee: User): void {
        const followerEmail = follower.email.toString();
        const followeeEmail = followee.email.toString();

        this.following.get(followerEmail)?.delete(followeeEmail);
        this.followers.get(followeeEmail)?.delete(followeeEmail);
    }

    getFollowing(account: User): User[] {
        const email = account.email.toString();
        const followingEmails = this.following.get(email) || new Set();
        return Array.from(followingEmails)
            .map(e => this.getAccountByEmail(e))
            .filter((a): a is User => a !== null);
    }

    getFollowers(account: User): User[] {
        const email = account.email.toString();
        const followerEmails = this.followers.get(email) || new Set();
        return Array.from(followerEmails)
            .map(e => this.getAccountByEmail(e))
            .filter((a): a is User => a !== null);
    }

    isFollowing(follower: User, followee: User): boolean {
        const followerEmail = follower.email.toString();
        const followeeEmail = followee.email.toString();
        return this.following.get(followerEmail)?.has(followeeEmail) || false;
    }

    isFollowedBy(followee: User, follower: User): boolean {
        const followerEmail = follower.email.toString();
        const followeeEmail = followee.email.toString();
        return this.followers.get(followeeEmail)?.has(followerEmail) || false;
    }

    // ── Account accessors ──────────────────────────────────────────────────────

    addAccount(account: User): void {
        const socialNetwork = new SocialNetwork(account);
        this.socialNetworks.set(account.email.toString(), socialNetwork);
    }

    getAccountByEmail(email: string): User | null {
        const socialNetwork = this.socialNetworks.get(email);
        return socialNetwork?.getUser() || null;
    }

    getAllAccounts(): User[] {
        return Array.from(this.socialNetworks.values()).map(network => network.getUser());
    }

    // ── Message accessors ──────────────────────────────────────────────────────

    getAllMessages(): SimpleMessage[] {
        return [...this._receivedMessages];
    }

    getMessagesFrom(sender: EmailAddress): SimpleMessage[] {
        return this._receivedMessages.filter(message => message.from.equals(sender));
    }

    getMessagesTo(recipient: EmailAddress): SimpleMessage[] {
        return this._receivedMessages.filter(message => message.to.some(addr => addr.equals(recipient)));
    }

    getMessagesWithSubject(subject: string): SimpleMessage[] {
        return this._receivedMessages.filter(message => message.subject === subject);
    }

    getMessagesContaining(text: string): SimpleMessage[] {
        return this._receivedMessages.filter(message => message.body.includes(text));
    }

    getMessagesInDateRange(startDate: Date, endDate: Date): SimpleMessage[] {
        return this._receivedMessages.filter(message =>
            message.date >= startDate && message.date <= endDate
        );
    }

    removeMessage(message: SimpleMessage): void {
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

    getMessagesGroupedBySender(): Map<EmailAddress, SimpleMessage[]> {
        const grouped = new Map<EmailAddress, SimpleMessage[]>();
        for (const message of this._receivedMessages) {
            if (!grouped.has(message.from)) {
                grouped.set(message.from, []);
            }
            grouped.get(message.from)!.push(message);
        }
        return grouped;
    }

    getSocialNetwork(email: string): SocialNetwork | undefined {
        return this.socialNetworks.get(email);
    }

    getAllSocialNetworks(): SocialNetwork[] {
        return Array.from(this.socialNetworks.values());
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

    getSentMessages(): SimpleMessage[] {
        return [...this._sentMessages];
    }
}
