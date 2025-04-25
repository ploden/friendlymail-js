import { EmailAddress } from '../src/models/EmailAddress';

describe('EmailAddress', () => {
    describe('constructor', () => {
        it('should create an instance with a valid email address', () => {
            const email = new EmailAddress('test@example.com');
            expect(email).toBeDefined();
            expect(email.toString()).toBe('test@example.com');
        });

        it('should throw an error for invalid email addresses', () => {
            const invalidEmails = [
                '',
                'invalid',
                '@example.com',
                'test@',
                'test@.',
                'test@.com',
                'test@example.',
                'test@@example.com',
                'test@exam ple.com',
            ];

            invalidEmails.forEach(email => {
                expect(() => new EmailAddress(email)).toThrow('Invalid email address');
            });
        });

        it('should convert email addresses to lowercase', () => {
            const email = new EmailAddress('Test@Example.COM');
            expect(email.toString()).toBe('test@example.com');
        });
    });

    describe('isValid', () => {
        it('should return true for valid email addresses', () => {
            const validEmails = [
                'test@example.com',
                'test.name@example.com',
                'test+label@example.com',
                'test@subdomain.example.com',
                'test123@example.com',
                '123test@example.com',
                'test-name@example.com',
                'test_name@example.com',
            ];

            validEmails.forEach(email => {
                expect(EmailAddress.isValid(email)).toBe(true);
            });
        });

        it('should return false for invalid email addresses', () => {
            const invalidEmails = [
                '',
                'invalid',
                '@example.com',
                'test@',
                'test@.',
                'test@.com',
                'test@example.',
                'test@@example.com',
                'test@exam ple.com',
                null,
                undefined,
            ];

            invalidEmails.forEach(email => {
                expect(EmailAddress.isValid(email as string)).toBe(false);
            });
        });
    });

    describe('fromString', () => {
        it('should create an instance from a valid email string', () => {
            const email = EmailAddress.fromString('test@example.com');
            expect(email).toBeDefined();
            expect(email?.toString()).toBe('test@example.com');
        });

        it('should return null for invalid email strings', () => {
            const email = EmailAddress.fromString('invalid');
            expect(email).toBeNull();
        });
    });

    describe('fromDisplayString', () => {
        it('should extract email from display string format', () => {
            const inputs = [
                { input: 'John Doe <john@example.com>', expected: 'john@example.com' },
                { input: '"John Doe" <john@example.com>', expected: 'john@example.com' },
                { input: 'john@example.com', expected: 'john@example.com' },
                { input: '<john@example.com>', expected: 'john@example.com' },
            ];

            inputs.forEach(({ input, expected }) => {
                const email = EmailAddress.fromDisplayString(input);
                expect(email).toBeDefined();
                expect(email?.toString()).toBe(expected);
            });
        });

        it('should return null for invalid display strings', () => {
            const invalidInputs = [
                '',
                'John Doe',
                'John Doe <>',
                '<>',
                'John Doe <invalid>',
            ];

            invalidInputs.forEach(input => {
                const email = EmailAddress.fromDisplayString(input);
                expect(email).toBeNull();
            });
        });
    });

    describe('getLocalPart and getDomain', () => {
        it('should correctly split email into local part and domain', () => {
            const email = new EmailAddress('test@example.com');
            expect(email.getLocalPart()).toBe('test');
            expect(email.getDomain()).toBe('example.com');
        });

        it('should handle complex local parts', () => {
            const email = new EmailAddress('test.name+label@example.com');
            expect(email.getLocalPart()).toBe('test.name+label');
            expect(email.getDomain()).toBe('example.com');
        });
    });

    describe('equals', () => {
        it('should consider identical email addresses equal', () => {
            const email1 = new EmailAddress('test@example.com');
            const email2 = new EmailAddress('test@example.com');
            expect(email1.equals(email2)).toBe(true);
        });

        it('should consider different email addresses unequal', () => {
            const email1 = new EmailAddress('test1@example.com');
            const email2 = new EmailAddress('test2@example.com');
            expect(email1.equals(email2)).toBe(false);
        });

        it('should be case-insensitive', () => {
            const email1 = new EmailAddress('TEST@EXAMPLE.COM');
            const email2 = new EmailAddress('test@example.com');
            expect(email1.equals(email2)).toBe(true);
        });
    });
}); 