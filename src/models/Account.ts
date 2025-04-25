import { User } from './User';

export class Account {
    private _user: User;
    private _sessionToken: string;
    private _lastActive: Date;
    private _isLoggedIn: boolean;
    private _loginAttempts: number;
    private _lastLoginAttempt: Date;

    constructor(user: User) {
        this._user = user;
        this._sessionToken = '';
        this._lastActive = new Date();
        this._isLoggedIn = false;
        this._loginAttempts = 0;
        this._lastLoginAttempt = new Date();
    }

    // Getters
    get user(): User { return this._user; }
    get sessionToken(): string { return this._sessionToken; }
    get lastActive(): Date { return new Date(this._lastActive); }
    get isLoggedIn(): boolean { return this._isLoggedIn; }
    get loginAttempts(): number { return this._loginAttempts; }
    get lastLoginAttempt(): Date { return new Date(this._lastLoginAttempt); }

    // Authentication methods
    login(password: string): boolean {
        // In a real application, you would hash the password and compare with stored hash
        // This is a simplified version for demonstration
        if (this._loginAttempts >= 5) {
            const timeSinceLastAttempt = Date.now() - this._lastLoginAttempt.getTime();
            if (timeSinceLastAttempt < 15 * 60 * 1000) { // 15 minutes
                throw new Error('Too many login attempts. Please try again later.');
            }
            this._loginAttempts = 0;
        }

        this._lastLoginAttempt = new Date();
        this._loginAttempts++;

        // Simulate password verification
        if (password === 'password123') { // Replace with actual password verification
            this._isLoggedIn = true;
            this._sessionToken = crypto.randomUUID();
            this._lastActive = new Date();
            this._loginAttempts = 0;
            return true;
        }

        return false;
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

    // Security methods
    resetLoginAttempts(): void {
        this._loginAttempts = 0;
    }

    // Account management
    updatePassword(oldPassword: string, newPassword: string): boolean {
        if (!this._isLoggedIn) {
            throw new Error('Must be logged in to change password');
        }

        // Verify old password
        if (oldPassword === 'password123') { // Replace with actual password verification
            // Update password (in a real app, you would hash and store the new password)
            return true;
        }

        return false;
    }

    // Account status
    isAccountLocked(): boolean {
        return this._loginAttempts >= 5 && 
               (Date.now() - this._lastLoginAttempt.getTime()) < 15 * 60 * 1000;
    }

    getTimeUntilUnlock(): number {
        if (!this.isAccountLocked()) return 0;
        
        const lockDuration = 15 * 60 * 1000; // 15 minutes
        const timeSinceLastAttempt = Date.now() - this._lastLoginAttempt.getTime();
        return Math.max(0, lockDuration - timeSinceLastAttempt);
    }
} 