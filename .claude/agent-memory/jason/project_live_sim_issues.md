---
name: Live Sim Infrastructure Issues (2026-04-04 run)
description: Critical issues found in the adduser_send_invite_accept_invite_create_post sim run — Gmail self-send suppression and invite blocking
type: project
---

The adduser_send_invite_accept_invite_create_post sim run on 2026-04-04 failed to exercise any feature beyond Welcome delivery. Two critical infrastructure issues were identified:

1. **Gmail self-send suppression (JASON-001):** Sim-injected command messages sent from the host Gmail account to itself via SMTP never appeared in the INBOX during daemon fetch cycles. The daemon's store never grew beyond 1 (the welcome message). No user commands were processed.

2. **Gmail blocked invite delivery (JASON-002):** When the sim injected the invite command, Gmail returned a DSN bounce ("Message blocked") to the host inbox. The invite never reached xploden@icloud.com.

**Why:** The live sim sends messages from the host account to itself. Gmail SMTP behavior for self-addressed messages differs from web-sent mail — messages may route to All Mail/Sent only, bypassing INBOX. Also, Gmail's spam/abuse filters blocked the outbound invite.

**How to apply:** Before evaluating any sim results, confirm that the daemon's INBOX fetch is actually receiving the sim-injected messages (check that INBOX uid count grows after each sim step). If store size stays flat at 1 (welcome only), the infrastructure issue is still present.
