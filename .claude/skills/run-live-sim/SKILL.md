---
name: run-live-sim
description: Run a friendlymail .sim script through the LOCAL live simulator. Use when asked to run a sim file (e.g. adduser_set_profile_pic.sim), reproduce a scenario, or generate sim output for analysis. Covers resolving the sim by name, output dirs, and multi-role (host + non-host) runs.
---

# Run a live sim (local mode)

Drives a `.sim` script through `run-live-sim.ts` in `--local` mode: no IMAP/SMTP,
mailboxes are written to a data dir on disk as `<data-dir>/<email>/{Inbox,Sent}/NNNN.txt|html`.

Always run from the project root.

## 1. Resolve the sim file

A sim named `<name>` lives at `sim_scripts/<name>/<name>.sim`. If the user gives a
bare name (with or without `.sim`), expand it:

- `adduser_set_profile_pic` → `sim_scripts/adduser_set_profile_pic/adduser_set_profile_pic.sim`

If unsure what exists: `find sim_scripts -name '*.sim'`.

## 2. Pick the output dir

Convention: write output to `sim_output/<name>/` and **delete it first** so stale
state never bleeds in. (The `host` instance also wipes `--data-dir` on start, but
deleting up front keeps things unambiguous and matches the agreed convention.)

## 3. Detect the roles

Roles = the implicit `host` plus every distinct role named in an `if-role <role>`
line in the sim file:

```bash
grep -hE '^[[:space:]]*if-role[[:space:]]+' "$SIM" | sed -E 's/.*if-role[[:space:]]+//' | sort -u
```

Each role uses host-config file `local_sim_config_<role>.txt`:
- `host` → `local_sim_config_host.txt`
- `non-host-user-1` → `local_sim_config_non-host-user-1.txt`

If a needed config file is missing, stop and say so (don't invent credentials).

## 4a. Single-role sim (no `if-role` lines) — one command

Most sims (including `adduser_set_profile_pic`) are host-only:

```bash
rm -rf sim_output/adduser_set_profile_pic
npx tsx run-live-sim.ts --local \
  --host-config local_sim_config_host.txt \
  --role host \
  --data-dir sim_output/adduser_set_profile_pic \
  sim_scripts/adduser_set_profile_pic/adduser_set_profile_pic.sim
```

## 4b. Multi-role sim — one instance per role, run concurrently

Roles coordinate through presence files in the shared `--data-dir`: the `host`
instance wipes the dir and publishes its presence; non-host instances wait for it,
then for each other. So **start `host` first**, then the non-host roles, and let
them run in parallel against the same `--data-dir`. Send each to a log file so the
interleaved output stays readable. Example for a `host` + `non-host-user-1` sim:

```bash
SIM=sim_scripts/adduser_send_invite_create_post/adduser_send_invite_create_post.sim
OUT=sim_output/adduser_send_invite_create_post
rm -rf "$OUT"

npx tsx run-live-sim.ts --local --host-config local_sim_config_host.txt \
  --role host --data-dir "$OUT" "$SIM" > "$OUT.host.log" 2>&1 &
sleep 1
npx tsx run-live-sim.ts --local --host-config local_sim_config_non-host-user-1.txt \
  --role non-host-user-1 --data-dir "$OUT" "$SIM" > "$OUT.non-host-user-1.log" 2>&1 &
wait
```

(Put logs as siblings of `$OUT`, never inside it — the `host` instance deletes the
data dir on start.) Add another `npx tsx ... --role non-host-user-N ...` line per
additional role.

## 5. Inspect the output

```bash
find sim_output/<name> -type f \( -name '*.txt' -o -name '*.html' \) | sort
```

Read the `.txt`/`.html` files under each `<email>/Inbox` and `<email>/Sent` to see
what was sent and received. For multi-role runs, also check the per-role `*.log`
files for daemon errors.

## Useful options

- `--verbose` — print a summary of each sent message after every daemon run.
- `--delay <ms>` — wait after each daemon run (default 10000); local mode rarely needs more.
- `--data-dir <dir>` — mailbox output root (set per step 2).
- `--role <role>` — `host` (default) or `non-host-user-N`.

Full flag reference and host-config format: header comment of `run-live-sim.ts`.
