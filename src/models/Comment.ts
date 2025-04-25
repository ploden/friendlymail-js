import { User } from './User';
import { Post } from './Post';

export class Comment {
    private _id: string;
    private _author: User;
    private _content: string;
    private _post: Post;
    private _likes: User[];
    private _createdAt: Date;

    constructor(author: User, content: string, post: Post) {
        this._id = crypto.randomUUID();
        this._author = author;
        this._content = content;
        this._post = post;
        this._likes = [];
        this._createdAt = new Date();
    }

    // Getters
    get id(): string { return this._id; }
    get author(): User { return this._author; }
    get content(): string { return this._content; }
    get post(): Post { return this._post; }
    get likes(): User[] { return [...this._likes]; }
    get createdAt(): Date { return new Date(this._createdAt); }

    // Methods
    addLike(user: User): void {
        if (!this._likes.some(like => like.id === user.id)) {
            this._likes.push(user);
        }
    }

    removeLike(user: User): void {
        this._likes = this._likes.filter(like => like.id !== user.id);
    }

    updateContent(newContent: string): void {
        this._content = newContent;
    }
} 