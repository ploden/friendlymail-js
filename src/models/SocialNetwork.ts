import { User } from './User';
import { Post } from './Post';

export class SocialNetwork {
    private _users: User[];
    private _posts: Post[];

    constructor() {
        this._users = [];
        this._posts = [];
    }

    // Methods
    registerUser(user: User): void {
        if (!this._users.some(u => u.email === user.email)) {
            this._users.push(user);
        }
    }

    createPost(post: Post): void {
        this._posts.push(post);
    }

    deletePost(postId: string): void {
        this._posts = this._posts.filter(post => post.id !== postId);
    }

    getFeed(user: User): Post[] {
        return this._posts.filter(post => {
            const isAuthor = post.author.id === user.id;
            const isFriend = post.author.friends.some(friend => friend.id === user.id);
            const isPublic = post.privacy === 'public';
            
            return isAuthor || (isFriend && post.privacy === 'friends') || isPublic;
        });
    }

    searchUsers(query: string): User[] {
        return this._users.filter(user => 
            user.username.toLowerCase().includes(query.toLowerCase()) ||
            user.email.toLowerCase().includes(query.toLowerCase())
        );
    }

    getTrendingPosts(): Post[] {
        return [...this._posts]
            .sort((a, b) => b.likes.length - a.likes.length)
            .slice(0, 10);
    }
} 