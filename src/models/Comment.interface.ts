import { IPost } from './Post.interface';

/**
 * Interface for Comment data type. A Comment is a Post made in reply to another
 * Post, identified by inReplyTo.
 */
export interface IComment extends IPost {
    readonly inReplyTo: string;

    updateContent(newContent: string): void;
}
