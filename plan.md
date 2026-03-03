# Plan: Add Real Email Sending & Receiving via Postfix/Dovecot

## Current State

- `feature/email-integration` branch has a complete `EmailMailProvider` using nodemailer (SMTP) and imapflow (IMAP), plus a `run-daemon.ts` entry point. It's not yet on `postfix_dovecot`.
- `postfix_dovecot` branch has a working Postfix/Dovecot local mail server.
- The architecture is already designed for this: `IMailProvider` is the abstraction, `TestMessageProvider` is the current impl, `EmailMailProvider` is the real impl.

## Goal

Run `run-daemon.ts` as `phil@localhost` so that:
1. Friendlymail polls Dovecot via IMAP for new messages in phil's inbox
2. Friendlymail sends replies via Postfix SMTP
3. A follower (alice@localhost) can send commands and receive notifications in Thunderbird

## Steps

### 1. Merge `feature/email-integration` into `postfix_dovecot`

Merge the email integration branch to bring in:
- `src/models/EmailMailProvider.impl.ts` — nodemailer + imapflow
- `src/models/EmailMessage.impl.ts` — message type with full email headers
- `run-daemon.ts` — production daemon entry point
- `package.json` updates — nodemailer, imapflow, mailparser dependencies

### 2. Install dependencies

```bash
npm install
```

### 3. Configure EmailMailProvider for local Postfix/Dovecot

Our local server settings:
- **SMTP**: `localhost:587`, no TLS, no auth (permit_mynetworks allows localhost)
- **IMAP**: `localhost:143`, no TLS, plain password auth

The `EmailMailProvider` needs to support a no-auth SMTP mode. Review the current implementation and add support if missing (nodemailer can connect without auth).

### 4. Update run-daemon.ts defaults

Change defaults from Mailpit to our local Postfix/Dovecot:
- `--smtp-host localhost --smtp-port 587`
- `--imap-host localhost --imap-port 143`
- `--host-email phil@localhost`
- No TLS flags

Or add a `--local-dev` flag that sets all of the above.

### 5. Run the daemon

```bash
npx ts-node run-daemon.ts \
  --host-email phil@localhost \
  --smtp-host localhost --smtp-port 587 \
  --imap-host localhost --imap-port 143 \
  --imap-user phil@localhost --imap-pass phil123
```

### 6. End-to-end test

1. Alice sends a "Fm follow" command to phil@localhost from Thunderbird
2. Daemon polls IMAP, picks up the message
3. Daemon processes it via MessageProcessor
4. Daemon sends a welcome/follow-confirmation reply via SMTP to alice@localhost
5. Alice receives the reply in Thunderbird

## Key Decisions / Risks

- **No SMTP auth**: Postfix allows unauthenticated SMTP from localhost (permit_mynetworks). nodemailer supports this (omit auth config).
- **No TLS**: Both SMTP and IMAP are plain for local dev. The `EmailMailProvider` already supports this via `secure: false`.
- **IMAP \Seen flag**: Messages are marked as Seen after fetch, so the daemon won't process them twice. Old test messages in phil's inbox will be consumed on first run.
- **Host email**: `phil@localhost` is both the friendlymail host and the IMAP account the daemon monitors. Alice (`alice@localhost`) is the follower/tester.
