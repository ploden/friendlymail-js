import { Account } from './Account.impl';
import { ISocialNetwork } from './SocialNetwork.interface';

export class SocialNetwork implements ISocialNetwork {
    private account: Account;

    constructor(account: Account) {
        this.account = account;
    }

    getAccount(): Account {
        return this.account;
    }

    setAccount(account: Account): void {
        this.account = account;
    }
}
