// Types for the social network
type PrivacySetting = 'public' | 'friends' | 'private';
type PostType = 'text' | 'image' | 'video' | 'link';

// User class representing a social network user
export class User {
    private _id: string;
    private _username: string;
    private _email: string;
    private _password: string;
    private _profilePicture: string;
    private _bio: string;
    private _friends: User[];
    private _privacySettings: {
        profile: PrivacySetting;
        posts: PrivacySetting;
        friends: PrivacySetting;
    };
    private _createdAt: Date;

    constructor(
        username: string,
        email: string,
        password: string,
        options: {
            profilePicture?: string;
            bio?: string;
            privacySettings?: {
                profile: PrivacySetting;
                posts: PrivacySetting;
                friends: PrivacySetting;
            };
        } = {}
    ) {
        this._id = crypto.randomUUID();
        this._username = username;
        this._email = email;
        this._password = password;
        this._profilePicture = options.profilePicture || '';
        this._bio = options.bio || '';
        this._friends = [];
        this._privacySettings = options.privacySettings || {
            profile: 'public',
            posts: 'public',
            friends: 'public'
        };
        this._createdAt = new Date();
    }

    // Getters
    get id(): string { return this._id; }
    get username(): string { return this._username; }
    get email(): string { return this._email; }
    get profilePicture(): string { return this._profilePicture; }
    get bio(): string { return this._bio; }
    get friends(): User[] { return [...this._friends]; }
    get privacySettings() { return { ...this._privacySettings }; }
    get createdAt(): Date { return new Date(this._createdAt); }

    // Methods
    addFriend(user: User): void {
        if (!this._friends.some(friend => friend.id === user.id)) {
            this._friends.push(user);
        }
    }

    removeFriend(user: User): void {
        this._friends = this._friends.filter(friend => friend.id !== user.id);
    }

    updateProfile(updates: {
        username?: string;
        email?: string;
        profilePicture?: string;
        bio?: string;
    }): void {
        if (updates.username) this._username = updates.username;
        if (updates.email) this._email = updates.email;
        if (updates.profilePicture) this._profilePicture = updates.profilePicture;
        if (updates.bio) this._bio = updates.bio;
    }

    updatePrivacySettings(settings: {
        profile?: PrivacySetting;
        posts?: PrivacySetting;
        friends?: PrivacySetting;
    }): void {
        if (settings.profile) this._privacySettings.profile = settings.profile;
        if (settings.posts) this._privacySettings.posts = settings.posts;
        if (settings.friends) this._privacySettings.friends = settings.friends;
    }
}

// Post class representing a social media post
export class Post {
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

    // Getters
    get id(): string { return this._id; }
    get author(): User { return this._author; }
    get content(): string { return this._content; }
    get type(): PostType { return this._type; }
    get mediaUrl(): string | undefined { return this._mediaUrl; }
    get likes(): User[] { return [...this._likes]; }
    get comments(): Comment[] { return [...this._comments]; }
    get privacy(): PrivacySetting { return this._privacy; }
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

// Comment class representing a comment on a post
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

// SocialNetwork class to manage the entire network
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