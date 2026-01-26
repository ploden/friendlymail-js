import { SocialNetwork } from './SocialNetwork.impl';
import { User } from './User.impl';

/**
 * Interface for Account data type
 */
export interface IAccount {
    readonly user: User;
    readonly sessionToken: string | null;
    readonly lastActive: Date;
    readonly isLoggedIn: boolean;
    readonly socialNetwork: SocialNetwork;

    getSocialNetwork(): SocialNetwork;
    login(): boolean;
    logout(): void;
    updateLastActive(): void;
    isSessionValid(): boolean;
    refreshSession(): void;
}
