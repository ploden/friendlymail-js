import { User } from './User.impl';
import { IComment } from './Comment.interface';
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
    readonly comments: IComment[];
    readonly privacy: PrivacySetting;
    readonly createdAt: Date;

    addLike(user: User): void;
    removeLike(user: User): void;
    addComment(comment: IComment): void;
    removeComment(commentId: string): void;
    updatePrivacy(privacy: PrivacySetting): void;
}
