import { User } from './User.impl';
import { Comment } from './Comment.impl';
import { PrivacySetting, PostType } from './types';
import { IPost } from './Post.interface';

export class Post implements IPost {
    private _id: string;
    private _author: User;
    private _content: string;
    private _type: PostType;
    private _mediaUrl?: string;
    private _likes: User[];
    private _comments: Comment[];
    private _privacy: PrivacySetting;
    private _createdAt: Date;

    constructor(
        author: User,
        content: string,
        type: PostType,
        options: {
            mediaUrl?: string;
            privacy?: PrivacySetting;
        } = {}
    ) {
        this._id = crypto.randomUUID();
        this._author = author;
        this._content = content;
        this._type = type;
        this._mediaUrl = options.mediaUrl;
        this._likes = [];
        this._comments = [];
        this._privacy = options.privacy || 'public';
        this._createdAt = new Date();
    }

    get id(): string { return this._id; }
    get author(): User { return this._author; }
    get content(): string { return this._content; }
    get type(): PostType { return this._type; }
    get mediaUrl(): string | undefined { return this._mediaUrl; }
    get likes(): User[] { return [...this._likes]; }
    get comments(): Comment[] { return [...this._comments]; }
    get privacy(): PrivacySetting { return this._privacy; }
    get createdAt(): Date { return new Date(this._createdAt); }

    addLike(user: User): void {
        if (!this._likes.some(like => like.id === user.id)) {
            this._likes.push(user);
        }
    }

    removeLike(user: User): void {
        this._likes = this._likes.filter(like => like.id !== user.id);
    }

    addComment(comment: Comment): void {
        this._comments.push(comment);
    }

    removeComment(commentId: string): void {
        this._comments = this._comments.filter(comment => comment.id !== commentId);
    }

    updatePrivacy(privacy: PrivacySetting): void {
        this._privacy = privacy;
    }
}
