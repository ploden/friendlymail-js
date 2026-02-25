import { User } from './User.impl';

/**
 * Interface for SocialNetwork data type
 */
export interface ISocialNetwork {
    getUser(): User;
    setUser(user: User): void;
}
