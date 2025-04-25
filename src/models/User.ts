import { PrivacySetting } from './types';

export class User {
    private _id: string;
    private _username: string;
    private _email: string;
    private _password: string;
    private _profilePicture: string;
    private _bio: string;
    private _friends: User[];
    private _privacySettings: {
        profile: PrivacySetting;
        posts: PrivacySetting;
        friends: PrivacySetting;
    };
    private _createdAt: Date;

    constructor(
        username: string,
        email: string,
        password: string,
        options: {
            profilePicture?: string;
            bio?: string;
            privacySettings?: {
                profile: PrivacySetting;
                posts: PrivacySetting;
                friends: PrivacySetting;
            };
        } = {}
    ) {
        this._id = crypto.randomUUID();
        this._username = username;
        this._email = email;
        this._password = password;
        this._profilePicture = options.profilePicture || '';
        this._bio = options.bio || '';
        this._friends = [];
        this._privacySettings = options.privacySettings || {
            profile: 'public',
            posts: 'public',
            friends: 'public'
        };
        this._createdAt = new Date();
    }

    // Getters
    get id(): string { return this._id; }
    get username(): string { return this._username; }
    get email(): string { return this._email; }
    get profilePicture(): string { return this._profilePicture; }
    get bio(): string { return this._bio; }
    get friends(): User[] { return [...this._friends]; }
    get privacySettings() { return { ...this._privacySettings }; }
    get createdAt(): Date { return new Date(this._createdAt); }

    // Methods
    addFriend(user: User): void {
        if (!this._friends.some(friend => friend.id === user.id)) {
            this._friends.push(user);
        }
    }

    removeFriend(user: User): void {
        this._friends = this._friends.filter(friend => friend.id !== user.id);
    }

    updateProfile(updates: {
        username?: string;
        email?: string;
        profilePicture?: string;
        bio?: string;
    }): void {
        if (updates.username) this._username = updates.username;
        if (updates.email) this._email = updates.email;
        if (updates.profilePicture) this._profilePicture = updates.profilePicture;
        if (updates.bio) this._bio = updates.bio;
    }

    updatePrivacySettings(settings: {
        profile?: PrivacySetting;
        posts?: PrivacySetting;
        friends?: PrivacySetting;
    }): void {
        if (settings.profile) this._privacySettings.profile = settings.profile;
        if (settings.posts) this._privacySettings.posts = settings.posts;
        if (settings.friends) this._privacySettings.friends = settings.friends;
    }
} 