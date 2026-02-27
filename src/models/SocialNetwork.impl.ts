import { User } from './User.impl';
import { ISocialNetwork } from './SocialNetwork.interface';

export class SocialNetwork implements ISocialNetwork {
    private user: User;
    private _followerEmails: Set<string>;
    private _followingEmails: Set<string>;

    constructor(user: User) {
        this.user = user;
        this._followerEmails = new Set();
        this._followingEmails = new Set();
    }

    getUser(): User {
        return this.user;
    }

    setUser(user: User): void {
        this.user = user;
    }

    addFollowerEmail(email: string): void {
        this._followerEmails.add(email);
    }

    removeFollowerEmail(email: string): void {
        this._followerEmails.delete(email);
    }

    getFollowerEmails(): string[] {
        return Array.from(this._followerEmails);
    }

    isFollowedByEmail(email: string): boolean {
        return this._followerEmails.has(email);
    }

    addFollowingEmail(email: string): void {
        this._followingEmails.add(email);
    }

    removeFollowingEmail(email: string): void {
        this._followingEmails.delete(email);
    }

    getFollowingEmails(): string[] {
        return Array.from(this._followingEmails);
    }

    isFollowingEmail(email: string): boolean {
        return this._followingEmails.has(email);
    }
}
