import { Account } from './Account';

export class SocialGraph {
    private account: Account;
    private following: Set<Account>;
    private followers: Set<Account>;

    constructor(account: Account) {
        this.account = account;
        this.following = new Set();
        this.followers = new Set();
    }

    /**
     * Get the account associated with this social graph
     */
    getAccount(): Account {
        return this.account;
    }

    /**
     * Set a new account for this social graph
     */
    setAccount(account: Account): void {
        this.account = account;
    }

    /**
     * Follow another account
     */
    follow(account: Account): void {
        if (account === this.account) {
            console.warn('Cannot follow yourself');
            return;
        }
        this.following.add(account);
        account.getSocialGraph().addFollower(this.account);
    }

    /**
     * Add a follower to this account
     */
    addFollower(account: Account): void {
        this.followers.add(account);
    }

    /**
     * Unfollow another account
     */
    unfollow(account: Account): void {
        this.following.delete(account);
        account.getSocialGraph().removeFollower(this.account);
    }

    /**
     * Remove a follower from this account
     */
    removeFollower(account: Account): void {
        this.followers.delete(account);
    }

    /**
     * Get all accounts this account is following
     */
    getFollowing(): Account[] {
        return Array.from(this.following);
    }

    /**
     * Get all accounts following this account
     */
    getFollowers(): Account[] {
        return Array.from(this.followers);
    }

    /**
     * Check if this account is following another account
     */
    isFollowing(account: Account): boolean {
        return this.following.has(account);
    }

    /**
     * Check if this account is followed by another account
     */
    isFollowedBy(account: Account): boolean {
        return this.followers.has(account);
    }
} 