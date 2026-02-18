+++
date = "18 Feb 2026"
title = "openclaw"
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

### 0. the infrastructure (it's actually not that complicated) 🏗️

before i jump into the fun stuff, quick breakdown of what's actually running. i use Docker Compose with four services:

1. **Ollama** (local LLM inference) — runs on the GPU, serves models like Qwen and Llama via HTTP
2. **OpenClaw Gateway** (the orchestrator) — handles agent routing, session management, sandboxing. mounted the Docker socket so it can spawn sandbox containers on-demand
3. **OpenClaw CLI** — interactive shell for direct agent prompts
4. **OpenClaw Sandbox** — the execution boundary where untrusted code runs, with capabilities dropped and resource limits enforced (100 max processes, 2GB RAM, 2 CPU cores)

GPU setup: GTX 1080 Ti with 11GB VRAM. the constraint is **one model at a time** — 8B models eat like 5-6GB each, so loading a second model forces the first to swap out. between benchmarking runs, i `ollama stop <model>` to clear VRAM in ~2 seconds. it's annoying but fair.

network: everything's on localhost (127.0.0.1). the gateway API is on port 18789. Ollama on 11434. nothing exposed to the internet.

fallback chain: GPT-4 Turbo → Claude Sonnet → Gemini Flash → Qwen (local). if the primary model is down or rate-limited, the gateway automatically tries the next one.

sandbox security: Docker isn't a cryptographic boundary — if someone has kernel exploits, game over. but for defense-in-depth against script-kiddies and accidental mishaps, we've got capabilities dropped (`capDrop: ["ALL"]`), resource limits, non-root user, and read-only gateway filesystem. it's good enough.

> **real talk**: the sandbox is designed to prevent the agent from accidentally `rm -rf /` the host, or from running malware that tries to exfiltrate credentials. it's not Fort Knox. but combined with the approval-gate workflow (more on that below), it works.

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

### 4. benchmarking local models (it's more complex than you'd think) 📊

i've been diving deep into local model performance, and honestly benchmarking is non-trivial. here's why:

**the problem:** when you're testing on a single GPU with limited VRAM, you need to isolate each test. if you don't unload the previous model from VRAM before loading the next one, it stays resident and forces the next model into partial CPU offloading. that's not a fair comparison — you're measuring CPU fallback performance, not GPU performance.

so i ended up with a **5-tier benchmarking methodology:**

1. **Direct Ollama API** — hit the API directly, bypass the gateway, measure raw inference speed
2. **Comprehensive evaluation** — 10 tests across coding, reasoning, summarization, tool-calling. each test has a validation function that checks correctness, not just "did it respond"
3. **Advanced agentic** — native tool-calling via Ollama's tools API, large-context summarization (3k+ word technical docs), decision-making (when to use vs. not use tools)
4. **End-to-end through gateway** — full agent turn: routing, sandbox spawn, inference, response formatting. most realistic benchmark
5. **Real-world task** — actual multi-step agent job: "check email from the last 2 days, install the gog CLI tool if needed". this one took 207 seconds on Qwen and actually validated the whole pipeline

why so many levels? because **raw inference speed ≠ agentic capability**. a model might be fast at generating tokens but bad at tool-calling. or it might nail reasoning but get confused in a sandboxed execution context. you need multiple angles. plus, the real-world validation (that 207s email check) beats any synthetic benchmark for proving "this actually works."

**the VRAM unloading pattern** (all benchmarks use this):
```bash
unload_all_models() {
  echo "  [vram] Unloading all Ollama models..."
  for m in $(ollama ps | tail -n +2 | awk '{print $1}'); do
    ollama stop "$m" 2>/dev/null || true
  done
  sleep 2  # wait for GPU memory to flush
}

# before each test:
unload_all_models
# then run the actual benchmark with fresh GPU state
```

this adds overhead (each test takes ~2-3 seconds longer), but it's the only way to get fair numbers.

**honest caveat:** the benchmark sample size is small (10 tests per model). but i trust the results because (1) the direct Ollama API tests are deterministic and repeatable, (2) the agentic tests include tool-calling and large-context reasoning (hard stuff), and (3) the real-world task (email check + CLI install) is what actually matters. it's not a scientific paper, but it's solid enough to make a cost decision.

#### 4a. Local Model Tournament: Qwen vs Llama (head-to-head evaluation) 🏆

when evaluating which local model to standardize on for cost-optimized delegation, we ran a head-to-head test across the 5-tier methodology. both `qwen3:8b` and `llama3.1:8b` fit comfortably on a GTX 1080 Ti (5.2 GB and 4.9 GB respectively), but they revealed very different integration characteristics during testing.

**the tournament setup:** we put both models through the full benchmarking gauntlet — raw API performance, comprehensive correctness tests, agentic tool-calling, end-to-end gateway integration, and real-world task execution. the goal was to determine which one could be reliably deployed as a subagent.

**the problem:** during tier 2 testing, llama3.1 consistently returned empty responses — just a single EOS token with no actual output. qwen3 worked immediately, every time.

**root cause investigation:** OpenClaw appends a per-turn reinforcement hint as a trailing `role: "system"` message after the last user message. llama3.1's Ollama chat template handles `user`, `assistant`, and `tool` roles, but a trailing `system` entry is silently unhandled. the template's `$last` flag (which determines "who speaks next?") lands on the unmatched system message instead of the final user message. so the template's `<|start_header_id|>assistant<|end_header_id|>` generation prompt never fires. the model sees no generation context and immediately outputs `<|eot_id|>` — 1 token, empty content. dead in the water.

**the reproduction case** (this drove me nuts):
```bash
# 1 token, empty — trailing system breaks llama3.1
{"messages": [...user..., {"role":"system","content":"[Reminder...]"}]} 
→ eval_count: 1, output: ""

# 13 tokens, correct — no trailing system  
{"messages": [...user...]} 
→ eval_count: 13, output: "The answer to 2 + 2 is 4!"
```

qwen3 handles both cases fine. llama3.1? nope. just dies.

**the fix:** move the reminder into the last user message's content instead of appending a new system message. this works for both models and i've filed it as [GitHub issue #20201](https://github.com/openclaw/openclaw/issues/20201) with full reproduction steps and the fix proposal.

**tournament results:**
- ✅ **qwen3:8b**: passed all 5 tiers, fully compatible, reliable for cost-optimized delegation
- ❌ **llama3.1:8b**: failed at tier 2 and beyond due to chat template issue (integration problem, not model quality)

**practical implications:**
if you're setting up a local subagent for cheap inference, qwen3 is your guy. llama3.1 has excellent hardware characteristics, but the integration problem makes it unusable until the OpenClaw team patches the chat template handling (which i've documented with reproduction steps). it's not Meta's fault — it's a quirk of how OpenClaw structures messages — but it matters for standardization.

**VRAM management during testing:** the 1080 Ti requires explicit model unloading between tournament rounds. `ollama stop <model>` clears VRAM in ~2 seconds, so we automated this:

```bash
# unload all models before each tournament round (fairness)
for m in $(ollama ps | tail -n +2 | awk '{print $1}'); do
  ollama stop "$m" 2>/dev/null || true
done
sleep 2  # wait for VRAM to flush

# now load the next model fresh (no prefetching bias)
```

without this, the previous model stays in VRAM and forces the next model into partial CPU offloading (dramatically slower and unfair). for ongoing delegation tasks, you'd want to keep the winning model resident or use a machine with more VRAM.

### 5. elevated exec with approval mode 🔐

by default, the agent runs in a sandboxed Docker container with very limited permissions. but sometimes i need it to edit the OpenClaw config itself, or restart the gateway, or do other host-level operations. when i say "arbitrary commands," i mean commands that run in the gateway context (not the sandbox) — like restarting services, modifying config files, or reading system state. all of that requires explicit approval.

so i set up `elevated:ask` mode, which means:
- agent can request elevated (gateway) execution
- i get a real-time Discord prompt with the exact command
- i approve or deny
- command runs (or doesn't) depending on approval

the gateway has a timeout on the approval window (configurable, defaults to 5 minutes). if i don't respond, the agent move on. this has been super useful for quick config tweaks without having to SSH into the box myself.

example flow:
```
Agent: "I need to update the primary model config. 
        Command: `openclaw config set agents.defaults.model.primary openai/gpt-4-turbo`
        Approve? [yes/no]"

Me: "yes" (in Discord, within 5 minutes)

Agent: "✅ Config updated!"
```

note: "arbitrary commands within sandbox constraints" is key. the sandbox is already resource-limited (2GB RAM, 100 max processes, capabilities dropped). the approval gate adds a human-in-the-loop layer on top of that. together, they make the risk acceptable.

## security: what we built to defend 🔒

after setting everything up, i did a security review and implemented a multi-layer defense strategy. here's what we're protecting against and exactly how.

### threat vectors & mitigations

**accidental token commit to Git**
- **threat**: PAT or API key gets committed to a public repo
- **mitigations**: 
  - `.gitignore` entry for `.env` and all `.env.*.local` files
  - pre-commit hooks that scan for token patterns (`sk-*`, `ghp_*`, `xoxb-*`) before staging
  - monthly secret scan script that audits git history + disk for leaked patterns
- **status**: ✅ implemented and tested

**malicious agent code execution**
- **threat**: LLM-generated code tries to exfiltrate secrets or modify host system
- **mitigations**:
  - Docker sandbox with dropped capabilities (`capDrop: ["ALL"]`) — agent can't call privileged syscalls
  - resource limits: 100 max processes, 2GB RAM, 2 CPU cores — prevents resource exhaustion attacks
  - unprivileged user (no root) — process runs as non-root by default
  - `elevated:ask` approval gate — any host-level operation (config edits, gateway restart) requires explicit Discord approval with 5-minute timeout
  - network isolation — firewall rules restrict outbound to known APIs only (OpenAI, GitHub, Discord, Ollama local)
- **status**: ✅ implemented; monthly audit of approved elevated commands

**token exfiltration via process logs or URLs**
- **threat**: Tokens visible in `ps` output, git remote URLs, or shell history
- **mitigations**:
  - SSH keys for GitHub instead of embedded PATs — not visible in URLs or process lists
  - immutable `.env` file (`chattr +i` on Linux, `chflags uchg` on macOS) — prevents accidental edits/overwrites
  - env vars loaded via script with `set +x` — startup doesn't echo secrets to logs
  - encrypted disk (APFS/dm-crypt) — tokens at rest are encrypted
  - log scrubbing — periodic scan removes accidentally logged secrets
  - token rotation schedule: 90-day cycle for API keys, immediate revocation if suspected leak
- **status**: ✅ implemented; currently 90-day rotation schedule active

**log file leaks / disk recovery**
- **threat**: Old `.env` recoverable via forensic tools or logs containing tokens
- **mitigations**:
  - log rotation + archival — old logs deleted after 30 days
  - cold storage backup — encrypted `.env` backed up to external media (GPG-encrypted, kept offline)
  - secure deletion for rotated tokens — `shred -vfz` to overwrite before deletion
  - read-only gateway filesystem (except `/tmp` and mounts) — reduces surface if gateway process compromised
- **status**: ✅ implemented; cold backup stored offline

**supply chain attacks (compromised dependencies)**
- **threat**: `npm install` pulls a typosquatted or compromised package that reads `.env`
- **mitigations**:
  - `npm ci` (not `npm install`) — locks to exact versions in `package-lock.json`
  - `npm audit` in pre-commit hooks — blocks commits if vulnerabilities detected
  - version pinning — no wildcards (`^1.2.3`), all deps pinned to exact versions
  - npm verify — validates integrity of installed packages
  - selective code review for critical dependencies before installation
- **status**: ✅ implemented in CI workflows

**denial of service / approval fatigue**
- **threat**: Too many `elevated:ask` prompts cause operator to blindly approve
- **mitigations**:
  - command whitelisting — read-only ops like `openclaw config get` auto-approved
  - monthly audit — all elevated commands reviewed for suspicious patterns
  - rate-limiting — 10 attempts per 60s, 5-minute lockout to prevent brute force
  - approval timeout — if operator doesn't respond in 5 minutes, operation denied
- **status**: 🟡 whitelisting in progress; monthly audit active

### security posture by threat level

| threat scenario | severity | what we defend against |
|---|---|---|
| accidental token leak (GitHub commit) | high | `.gitignore`, pre-commit hooks, secret scans |
| malicious LLM output | high | Docker sandbox + capabilities drop + elevated:ask approval |
| token exfiltration (process/logs) | high | SSH keys, immutable .env, log scrubbing |
| supply chain attack (npm) | medium-high | `npm ci`, audit, version pinning, npm verify |
| disk forensic recovery | medium | shred, encrypted disk, cold backup |
| kernel exploit / sandbox escape | low | defense-in-depth (but no single magic defense) |
| MitM / HTTPS intercept | low | TLS 1.3, cert verification (pinning possible, not yet implemented) |

**honest assessment:** we're defending against realistic scenarios — accidents, lazy mistakes, script-kiddies, supply chain attacks. we're not defending against nation-state threat actors with kernel exploits or someone who already has root on the machine. if they have root, all security is theater. but for a personal machine where you control the code, this is solid.

### what's actually implemented ✅

**immutable .env storage**
```bash
# create with restrictive permissions
touch ~/.env && chmod 600 ~/.env
echo "OPENAI_API_KEY=sk-..." >> ~/.env

# make immutable (Linux)
sudo chattr +i ~/.env

# to edit: sudo chattr -i, edit, sudo chattr +i
```

**SSH keys instead of tokens for GitHub**
```bash
# generate ed25519 key for GitHub
ssh-keygen -t ed25519 -f ~/.ssh/github -c "openclaw@localhost"

# configure git
git config --global url."git@github.com:".insteadOf "https://github.com/"

# token is now rotated and revoked; agent uses SSH
```

**network isolation via firewall**
```bash
# example: ufw rules
sudo ufw default deny outgoing
sudo ufw allow out to api.openai.com port 443
sudo ufw allow out to api.github.com port 443
sudo ufw allow out to discordapp.com port 443
# (+ DNS for OpenAI, GitHub, Cloudflare)
```

**log scrubbing**
```bash
# monthly scan for leaked tokens
grep -r 'sk-[A-Za-z0-9]\{20,\}' /logs/ || echo "no OpenAI keys found"
grep -r 'ghp_[A-Za-z0-9]\{36,\}' /logs/ || echo "no GitHub tokens found"
# alerts on match, archives + deletes old logs
```

**token rotation schedule**
- OpenAI API key: 90 days
- GitHub SSH key: 90 days (or immediately if suspected compromise)
- Discord bot token: 365 days (only rotated on compromise)
- Process: generate new token → update .env (with `chattr -i`, `chattr +i`) → revoke old token → commit (no key in message)

### next steps: toward zero-trust 🎯

**immediate (next 2 weeks):**
- [ ] Centralize secrets to `~/.openclaw/credentials/` with standardized naming
- [ ] Document all secret locations + rotation schedule in a private wiki
- [ ] Implement command whitelisting for auto-approval (read-only ops)

**short-term (next month):**
- [ ] Set up monitoring for unusual elevated exec patterns (alert on `rm`, `mv`, `dd`, etc.)
- [ ] Audit log every elevated command with timestamp + operator approval
- [ ] Implement SSH agent integration for SSH key passphrase management

**longer-term (next quarter):**
- [ ] Consider hardware security module (HSM) for SSH key storage (optional, for high-value setups)
- [ ] Deploy AppArmor/SELinux profiles to further restrict sandbox escapes
- [ ] Implement cert pinning for external API calls (OpenAI, GitHub)

**bottom line:** the current setup is **strong for a personal machine**. accidental leaks, supply chain attacks, and malicious code execution are all mitigated. the remaining risks (kernel exploits, targeted attacks) are either low-probability or require root access. we're defending well, and the next steps build on that foundation without adding friction to day-to-day use.

## what's next

- [ ] **multi-agent delegation**: spawn sub-agents for specific tasks (e.g. one for monitoring, one for GitHub ops, one for reminders)
- [ ] **more automation**: hook up to more services (calendar, email, SMS, home automation?)

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
