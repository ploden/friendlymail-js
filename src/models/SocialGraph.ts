import { Account } from './Account';

export class SocialGraph {
    private account: Account;

    constructor(account: Account) {
        this.account = account;
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
} 