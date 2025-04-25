import { User } from './User';
import { SocialGraph } from './SocialGraph';

export class Account {
    private _user: User;
    private _sessionToken: string;
    private _lastActive: Date;
    private _isLoggedIn: boolean;
    private _socialGraph: SocialGraph;

    constructor(user: User) {
        this._user = user;
        this._sessionToken = '';
        this._lastActive = new Date();
        this._isLoggedIn = false;
        this._socialGraph = new SocialGraph(this);
    }

    // Getters
    get user(): User { return this._user; }
    get sessionToken(): string { return this._sessionToken; }
    get lastActive(): Date { return new Date(this._lastActive); }
    get isLoggedIn(): boolean { return this._isLoggedIn; }
    get socialGraph(): SocialGraph { return this._socialGraph; }

    // Get social graph (alias for socialGraph getter)
    getSocialGraph(): SocialGraph {
        return this._socialGraph;
    }

    // Authentication methods
    login(): boolean {
        this._isLoggedIn = true;
        this._sessionToken = crypto.randomUUID();
        this._lastActive = new Date();
        return true;
    }

    logout(): void {
        this._isLoggedIn = false;
        this._sessionToken = '';
        this._lastActive = new Date();
    }

    // Session management
    updateLastActive(): void {
        this._lastActive = new Date();
    }

    isSessionValid(): boolean {
        if (!this._isLoggedIn) return false;
        
        const sessionAge = Date.now() - this._lastActive.getTime();
        return sessionAge < 24 * 60 * 60 * 1000; // 24 hours session
    }

    refreshSession(): void {
        if (this._isLoggedIn) {
            this._sessionToken = crypto.randomUUID();
            this._lastActive = new Date();
        }
    }
} 