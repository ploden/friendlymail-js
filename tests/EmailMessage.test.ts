import { EmailMessage } from '../EmailMessage';
import { EmailAddress } from '../src/models/EmailAddress';
import * as fs from 'fs';
import * as path from 'path';

describe('EmailMessage', () => {
    describe('fromTextFile', () => {
        it('should create an EmailMessage from a text file', async () => {
            const filePath = path.join(__dirname, '..', 'create_command_create_account.txt');
            const email = await EmailMessage.fromTextFile(filePath);
            
            const expectedFrom = EmailAddress.fromDisplayString('Phil Loden <ploden@gmail.com>');
            const expectedTo = [EmailAddress.fromDisplayString('Phil Loden <ploden@gmail.com>')];
            
            expect(email.from.equals(expectedFrom!)).toBe(true);
            expect(email.to.length).toBe(expectedTo.length);
            expect(email.to[0].equals(expectedTo[0]!)).toBe(true);
            expect(email.subject).toBe('fm');
            expect(email.body).toBe('$ adduser\n\nPhil');
            expect(email.isHtml).toBe(false);
            expect(email.priority).toBe('normal');
            expect(email.cc).toEqual([]);
            expect(email.bcc).toEqual([]);
            expect(email.attachments).toEqual([]);
        });

        it('should throw an error for missing required fields', async () => {
            const testFilePath = path.join(__dirname, 'invalid_email.txt');
            const emailContent = `Subject: Test Subject
Content-Type: text/plain

Test body content`;

            await fs.promises.writeFile(testFilePath, emailContent);

            try {
                await expect(EmailMessage.fromTextFile(testFilePath)).rejects.toThrow('Missing required email fields');
            } finally {
                await fs.promises.unlink(testFilePath);
            }
        });

        it('should handle HTML content type', async () => {
            const testFilePath = path.join(__dirname, 'html_email.txt');
            const emailContent = `From: test@example.com
To: recipient@example.com
Subject: HTML Test
Content-Type: text/html; charset=UTF-8

<h1>Test HTML content</h1>`;

            await fs.promises.writeFile(testFilePath, emailContent);

            try {
                const email = await EmailMessage.fromTextFile(testFilePath);
                expect(email.isHtml).toBe(true);
                expect(email.body).toBe('<h1>Test HTML content</h1>');
            } finally {
                await fs.promises.unlink(testFilePath);
            }
        });
    });
}); 