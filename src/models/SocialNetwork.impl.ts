import { User } from './User.impl';
import { ISocialNetwork } from './SocialNetwork.interface';

export class SocialNetwork implements ISocialNetwork {
    private user: User;

    constructor(user: User) {
        this.user = user;
    }

    getUser(): User {
        return this.user;
    }

    setUser(user: User): void {
        this.user = user;
    }
}
