import { Post } from './Post.impl';
import { Comment } from './Comment.impl';
import { EmailAddress } from './EmailAddress.impl';
import { User } from './User.impl';

/**
 * Interface for User data type
 */
export interface IUser {
    readonly id: string;
    readonly username: string;
    readonly email: EmailAddress;
    readonly profilePicture: string;
    readonly bio: string;
    readonly posts: Post[];
    readonly comments: Comment[];
    readonly followers: User[];
    readonly following: User[];
    readonly createdAt: Date;

    addPost(post: Post): void;
    addComment(comment: Comment): void;
    follow(user: User): void;
    unfollow(user: User): void;
    getFollowers(): User[];
    getFollowing(): User[];
    isFollowing(user: User): boolean;
    isFollowedBy(user: User): boolean;
    getFollowersCount(): number;
    getFollowingCount(): number;
    updateProfile(updates: {
        username?: string;
        email?: EmailAddress;
        profilePicture?: string;
        bio?: string;
    }): void;
}
