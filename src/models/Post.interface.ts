import { User } from './User.impl';
import { Comment } from './Comment.impl';
import { PrivacySetting, PostType } from './types';

/**
 * Interface for Post data type
 */
export interface IPost {
    readonly id: string;
    readonly author: User;
    readonly content: string;
    readonly type: PostType;
    readonly mediaUrl: string | undefined;
    readonly likes: User[];
    readonly comments: Comment[];
    readonly privacy: PrivacySetting;
    readonly createdAt: Date;

    addLike(user: User): void;
    removeLike(user: User): void;
    addComment(comment: Comment): void;
    removeComment(commentId: string): void;
    updatePrivacy(privacy: PrivacySetting): void;
}
