import { Post } from './Post.impl';
import { Comment } from './Comment.impl';
import { EmailAddress } from './EmailAddress.impl';
import { IUser } from './User.interface';

export class User implements IUser {
    private _id: string;
    private _name: string;
    private _email: EmailAddress;

    private _posts: Post[];
    private _comments: Comment[];
    private _followers: Set<User>;
    private _following: Set<User>;
    private _createdAt: Date;

    constructor(
        name: string,
        email: EmailAddress,
    ) {
        this._id = crypto.randomUUID();
        this._name = name;
        this._email = email;
        this._posts = [];
        this._comments = [];
        this._followers = new Set();
        this._following = new Set();
        this._createdAt = new Date();
    }

    get id(): string { return this._id; }
    get name(): string { return this._name; }
    get email(): EmailAddress { return this._email; }

    get posts(): Post[] { return [...this._posts]; }
    get comments(): Comment[] { return [...this._comments]; }
    get followers(): User[] { return Array.from(this._followers); }
    get following(): User[] { return Array.from(this._following); }
    get createdAt(): Date { return new Date(this._createdAt); }

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
        name?: string;
        email?: EmailAddress;
    }): void {
        if (updates.name) this._name = updates.name;
        if (updates.email) this._email = updates.email;
    }

}
