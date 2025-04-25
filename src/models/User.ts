import { PrivacySetting } from './types';
import { Post } from './Post';
import { Comment } from './Comment';
import { EmailAddress } from './EmailAddress';

export class User {
    private _id: string;
    private _username: string;
    private _email: EmailAddress;
    private _profilePicture: string;
    private _bio: string;
    private _posts: Post[];
    private _comments: Comment[];
    private _followers: Set<User>;
    private _following: Set<User>;
    private _privacySettings: {
        profile: PrivacySetting;
        posts: PrivacySetting;
        friends: PrivacySetting;
    };
    private _createdAt: Date;

    constructor(
        username: string,
        email: EmailAddress,
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
        this._profilePicture = options.profilePicture || '';
        this._bio = options.bio || '';
        this._posts = [];
        this._comments = [];
        this._followers = new Set();
        this._following = new Set();
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
    get email(): EmailAddress { return this._email; }
    get profilePicture(): string { return this._profilePicture; }
    get bio(): string { return this._bio; }
    get posts(): Post[] { return [...this._posts]; }
    get comments(): Comment[] { return [...this._comments]; }
    get followers(): User[] { return Array.from(this._followers); }
    get following(): User[] { return Array.from(this._following); }
    get privacySettings() { return { ...this._privacySettings }; }
    get createdAt(): Date { return new Date(this._createdAt); }

    // Methods
    addPost(post: Post): void {
        this._posts.push(post);
    }

    addComment(comment: Comment): void {
        this._comments.push(comment);
    }

    follow(user: User): void {
        if (user === this) {
            throw new Error('Cannot follow yourself');
        }
        this._following.add(user);
        user._followers.add(this);
    }

    unfollow(user: User): void {
        this._following.delete(user);
        user._followers.delete(this);
    }

    getFollowers(): User[] {
        return Array.from(this._followers);
    }

    getFollowing(): User[] {
        return Array.from(this._following);
    }

    isFollowing(user: User): boolean {
        return this._following.has(user);
    }

    isFollowedBy(user: User): boolean {
        return this._followers.has(user);
    }

    getFollowersCount(): number {
        return this._followers.size;
    }

    getFollowingCount(): number {
        return this._following.size;
    }

    updateProfile(updates: {
        username?: string;
        email?: EmailAddress;
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