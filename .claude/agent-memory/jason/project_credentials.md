---
name: FriendlyMail Credential Setup
description: Environment variables required to run purge and live-sim scripts — not set by default in agent shell sessions
type: project
---

The purge and live-sim scripts require two environment variables that are NOT exported in the default agent shell environment:

- `$GMAIL_PASS` — App password for ploden.postcards@gmail.com (referenced in gmail_config.txt)
- `$ICLOUD_PASS` — App password for xploden@icloud.com (referenced in icloud_config.txt)

**Why:** The config files use `$VAR` syntax for credential expansion. The scripts will exit with "Config error: environment variable $X is not set" if these are absent.

**How to apply:** Before running any purge or live-sim command, verify these env vars are set in the shell. If not, the scripts cannot connect to the mail servers and the run must be deferred or run manually by the user in their authenticated shell.
