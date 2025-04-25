import { Account } from './Account';

export class SocialNetwork {
    private account: Account;

    constructor(account: Account) {
        this.account = account;
    }

    /**
     * Get the account associated with this social network
     */
    getAccount(): Account {
        return this.account;
    }

    /**
     * Set a new account for this social network
     */
    setAccount(account: Account): void {
        this.account = account;
    }
} 