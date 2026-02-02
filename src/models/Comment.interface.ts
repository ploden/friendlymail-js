import { User } from './User.impl';
import { Post } from './Post.impl';

/**
 * Interface for Comment data type
 */
export interface IComment {
    readonly id: string;
    readonly author: User;
    readonly content: string;
    readonly post: Post;
    readonly likes: User[];
    readonly createdAt: Date;

    addLike(user: User): void;
    removeLike(user: User): void;
    updateContent(newContent: string): void;
}
