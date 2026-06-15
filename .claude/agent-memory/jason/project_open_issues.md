---
name: Open Product Issues (Jason tracking)
description: Running list of open issues documented by Jason across all evaluation sessions
type: project
---

## Open Issues

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| JASON-001 | Critical | Sim-injected Gmail command messages never arrive in INBOX — daemon cannot process any user commands in live sim. Code fix (archiveFolder) implemented in f65c0ff but NOT activated: gmail_config.txt missing `archive-folder=[Gmail]/All Mail` | Open |
| JASON-002 | Critical | Gmail blocks outbound invite email to iCloud — DSN bounce received, invite never delivered | Open |
| JASON-003 | Major | Daemon has no mailer-daemon/postmaster filter — DSN bounces enter the message store | Open |
| JASON-004 | Minor | Verbose log dumps `[object Object]` for structured email headers (from, to, return-path, content-type) instead of human-readable strings. Partially addressed by logFmMessageSource() in f65c0ff — needs live run confirmation | Open |
| JASON-005 | Critical | gmail_config.txt is missing `archive-folder=[Gmail]/All Mail` — the archiveFolder fix for JASON-001 is inert without this config line | Open |
| JASON-006 | Critical | `$ invite --addfollower` silently adds the follower without sending any notification to the invitee. Alice receives posts from a stranger with no onboarding context. She has no mechanism to consent, unsubscribe, or understand why she is receiving mail. | Resolved (2026-06-15) |
| JASON-007 | Major | The `invite --addfollower` response (Message 3) had no HTML version. Every other daemon response in this flow rendered an HTML part. | Resolved (2026-06-15) |
| JASON-008 | Major | Welcome message (Message 1) included an `adduser:` mailto CTA link not present in the canonical spec. The link was removed, leaving only the `help:` link as specified. | Resolved (2026-06-15) |
| JASON-009 | Minor | Alice's Like/Comment links in the post notification point to Phil's address with no explanation. Architecturally correct but opaque to a first-time recipient. | Open |
| JASON-010 | Minor | The `adduser` display name convention is undiscoverable — welcome and help text do not explain how to set a name. | Open |
| JASON-011 | Minor | Message 4 (invite notification) has a hidden post-preview section. Correct behavior at invite time but the template is never re-used after a post exists. | Open |

**Last updated:** 2026-06-15 — Final approval run for adduser_send_invite_create_post.sim
