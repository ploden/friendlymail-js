import { Account } from './Account.impl';

/**
 * Interface for SocialNetwork data type
 */
export interface ISocialNetwork {
    getAccount(): Account;
    setAccount(account: Account): void;
}
