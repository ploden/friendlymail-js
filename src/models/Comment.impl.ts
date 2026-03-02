import { User } from './User.impl';
import { Post } from './Post.impl';
import { IComment } from './Comment.interface';

/**
 * A Comment is a Post made in reply to another Post, identified by inReplyTo.
 * Comments do not support nested comments; addComment and removeComment are no-ops.
 */
export class Comment extends Post implements IComment {
    private _inReplyTo: string;

    constructor(author: User, content: string, inReplyTo: string, refId: string = '') {
        super(author, content, 'text', { refId });
        this._inReplyTo = inReplyTo;
    }

    get inReplyTo(): string { return this._inReplyTo; }

    /** No-op: comments do not support nested comments. */
    override addComment(_comment: IComment): void {}

    /** No-op: comments do not support nested comments. */
    override removeComment(_commentId: string): void {}

    updateContent(newContent: string): void {
        this._content = newContent;
    }
}
