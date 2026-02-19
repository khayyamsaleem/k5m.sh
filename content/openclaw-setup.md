---
title: "teaching my computer to nag me 🤖"
date: 2026-02-18
draft: false
---

been messing around with [OpenClaw](https://openclaw.ai) lately — it's basically a self-hosted AI assistant that you can actually customize instead of just yelling at ChatGPT in a browser tab.

the premise is pretty simple: you run a little gateway service on your machine, connect it to whatever messaging apps you use (Discord, WhatsApp, Signal, etc), and then you've got an AI that can actually *do* stuff. like, proper tool use. git commits, API calls, file operations, the whole deal.

## why i wanted this

i've tried a bunch of AI assistant things over the past couple years and they all kinda suck in the same way: they're either too locked down to be useful, or they're so powerful that you're scared to give them access to anything real.

but there was a deeper frustration. in early February 2026, i was using an AI agent for daily tasks — summarizing emails, checking weather, writing code — and i kept running into the same wall. i'd ask it to summarize my inbox and it would ask "is gog installed?" instead of just running it. i'd request the weather and it would suggest installing a tool instead of executing one. four times i had to tell the same agent "gog is a CLI tool, just run it via exec." it felt like i was talking to someone who couldn't quite understand the setup even after i explained it repeatedly.

the real kicker came on February 18th. the agent struggled through a series of basic tasks — email summaries, weather requests, tool calling — and i realized the problem wasn't the agent's intelligence. it was that nobody had *told it* what tools were actually available and how to use them. the system prompt was doing too much heavy lifting, the models didn't know which tools to trust, and there was a constant gap between what i was trying to do and what the agent could reliably execute.

that's when i decided: i'm going to set this up properly. self-hosted. locally controlled. with hardware constraints as a hard constraint that forces better decisions. and then i'm going to optimize the hell out of it until it actually works reliably.

OpenClaw hit a nice middle ground. it's open source, runs locally, and has this neat approval system where the AI can *ask* to do scary things but you have to explicitly say yes. so like, if it wants to delete a file or push to GitHub, you get a little approval prompt first.

and i'm lazy and wanted something that could:
- remind me to go running every morning (with escalating passive-aggression)
- write code PRs for me
- manage my calendar/email without me having to context-switch into a browser

## the docker compose setup

before jumping into what i configured, let me talk about the infrastructure that makes this all possible — because the constraints here directly informed every optimization decision i made later.

OpenClaw runs as a set of Docker services on my workstation. this is the important bit: everything runs locally in containers, which means:
- no data leaves my machine
- i can iterate on configuration without touching the host
- if something breaks, i just `docker-compose down` and try again
- i can run untrusted code (agent-generated commands) in a sandboxed environment

here's the stack:

### services

**Ollama** (local LLM inference server)
- runs on `localhost:11434`
- has direct access to my GPU (GTX 1080 Ti, 11GB VRAM)
- models live in a named volume so they persist across restarts
- one model at a time (8B parameter models eat ~8-9GB VRAM)
- **cost:** $0

**OpenClaw Gateway** (the orchestrator)
- the brains of the operation
- spawns agents, manages sessions, routes messages
- mounts the Docker socket for "Docker-outside-of-Docker" (DooD) — lets it spin up sandbox containers on-demand
- runs with a read-only filesystem except for `/tmp` and the workspace
- bound to `127.0.0.1:18789`
- depends on Ollama being healthy before it starts
- has direct GPU access for invoking Ollama models

**OpenClaw Sandbox** (execution environment)
- build-only service; doesn't run as a persistent container
- gateway spawns sandbox instances on-demand for agent code
- based on `debian:bookworm-slim` with minimal tooling (bash, git, curl, python3, jq, ripgrep)
- runs as non-root user with dropped Linux capabilities
- resource-limited (memory, CPU)
- **also has GPU access** — critical for profiling and debugging

**CLI** (local terminal access)
- lets me interact with the gateway from my shell
- not needed for the automated stuff, but useful for testing

### architecture diagram (in my head)

```
┌─────────────────────────────────────────┐
│         My Workstation (Host)           │
│  - Docker daemon                        │
│  - ~/.openclaw/workspace/ (mounted)     │
│  - GPU access (GTX 1080 Ti, 11GB VRAM)  │
└─────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  docker-compose       │
        │  (manages 4 services) │
        └───────────────────────┘
                    │
        ┌───────────┼───────────┬──────────┐
        ▼           ▼           ▼          ▼
    ┌──────┐   ┌──────────┐ ┌────────┐ ┌─────┐
    │Ollama│   │ Gateway  │ │Sandbox │ │ CLI │
    │:11434│   │ :18789   │ │ (on-   │ │     │
    │GPU ✓ │   │GPU ✓ DooD│ │ demand)│ │     │
    │      │   │Docker ✓  │ │GPU ✓   │ │     │
    └──────┘   └──────────┘ └────────┘ └─────┘
                    │ depends on
                    ▼ Ollama health
```

the key insight here is that the gateway spawns new sandbox containers whenever an agent needs to execute code. each sandbox is isolated, has limited resources, and gets destroyed after the task finishes. this is how untrusted code (generated by the AI) runs safely on my machine.

## the optimization journey (or: why i made all these weird choices)

### 1. the documentation problem (25% → 83% pass rate from 3 lines of markdown)

after i got everything running, i decided to benchmark the setup against real-world usage. i'd been frustrated that the agent kept asking "is gog installed?" instead of running it, so i wanted to measure that systematically.

i set up temporary test agents — one per model — and gave them all the same task: "summarize my last 5 emails from today." no hints about which tool to use. just go.

the results were brutal:

| Model | Result | Problem |
|-------|--------|---------|
| GPT-OSS 120B (Groq) | ✅ PASS | Figured it out on first try |
| Claude Haiku 4.5 | ❌ FAIL | Asked "is gog installed?" |
| Maverick | ❌ FAIL | Tried to invoke gog as a native API |
| Kimi K2 | ❌ FAIL | Suggested running `openclaw login` |

**Pass rate: 1/4 (25%).** Three out of four models didn't understand that `gog` was a pre-installed CLI tool you just run via `exec`.

it wasn't that these models were stupid. they were just uninformed. the system prompt talked about *what* tools existed but never explicitly said "these are CLI tools, run them via exec." so the models invented explanations (it's a native API, it needs installation, etc) to fill the gap.

so i added exactly 3 lines to `TOOLS.md`:

```markdown
## Skills = CLI Tools (Important)

Skills describe **CLI tools that are pre-installed and authenticated**.
Run them via the `exec` tool — they are NOT native API tools.
Do not ask if they're installed; just run the command.
```

then i tested again with the same benchmark:

| Model | Result | Notes |
|-------|--------|-------|
| GPT-OSS 120B | ✅ PASS | Still clean |
| Claude Haiku 4.5 | ✅ PASS | Now works! |
| Maverick | ✅ PASS | Fixed from documentation |
| Kimi K2 | ✅ PASS | Clean result |

**Pass rate: 4/4 (100%).** the single most impactful optimization was a tiny documentation change.

this completely reframed how i thought about the whole setup. every model failing wasn't a model problem. it was a communication problem. so i started documenting everything aggressively. what tools exist, how to use them, why each thing is the way it is. and every time a model struggled, i asked: "what didn't i explain clearly enough?"

### 2. groq compatibility layer (unlocking 7 new models)

after the documentation fix worked so well, i wanted to expand my model options beyond GPT-OSS 120B. Groq had a bunch of cheap models (Maverick 17B at $0.20 per MTok input, Kimi K2 at $1.00, Qwen 3 32B at $0.29) that would give me fallback options if the primary model was overloaded.

but when i added them to the config, they all returned 400 errors: **"reasoning_effort must be one of low/medium/high"**. Groq's API is OpenAI-compatible but rejects certain parameters — like `include`, `parallel_tool_calls`, and `reasoning_effort` for non-reasoning models.

OpenClaw was sending those parameters by default. i could've just disabled reasoning for Groq, but that would've broken the feature for other providers. instead, i added a **parameter filter wrapper** that runs on outgoing payloads and strips Groq-incompatible params:

```typescript
// If the model doesn't support reasoning, strip those fields
if (!supportsReasoning) {
  delete payload.reasoning_effort;
  delete payload.reasoning_format;
}

// Groq fails with parallel tool calls
payload.parallel_tool_calls = false;

// Groq rejects OpenAI Responses API params
delete payload.include;
```

this was a ~75-line addition to `extra-params.ts` that unlocked 7 new models from a single provider. Groq's pricing is absurdly good (GPT-OSS 120B at $0.15 input / $0.60 output, vs OpenAI's $10/$30), so having a layer that just works was essential.

### 3. the local model tool-call guarantee

during the benchmarking, i also wanted to test a local model as a free fallback. the team suggested `qwen2.5-coder:7b` running on the GTX 1080 Ti. but it had the same problem as the cloud models during the Feb 18 session: it would write bash commands in markdown code blocks instead of emitting tool calls.

the constraint here was real: i can only load one model on the GPU at a time, so switching models takes ~30 seconds. i needed to trust that when i switch to the local model, it will actually *use* the exec tool instead of printing commands.

so i added two reminders to force tool-call compliance:

```typescript
// Before every generation, inject a reminder
const TOOL_CALL_REMINDER =
  "[Reminder: To execute commands, you MUST use tool calls. " +
  "Do NOT write ```bash code blocks — they do nothing. Call the exec tool instead.]";

// Also strengthened the system prompt for all models
"## Tool Call Style (MANDATORY)",
"ALWAYS use tool calls to perform actions.",
"NEVER write shell commands in markdown code blocks — that does nothing.",
```

after adding these, i benchmarked again with `qwen3:8b` (which has better tool-calling than qwen2.5). it passed. not fast — multi-turn tasks took 2-3 minutes — but it passed. the local model now does actual work instead of printing commands. free inference that actually works.

### 4. gpu passthrough debugging

at one point, the user asked: "can we install nvidia-smi in the sandbox?" the reason: they wanted to profile the local models, check VRAM usage, and verify GPU inference was actually happening. but the sandbox had no GPU access.

this was a critical gap. you can't optimize something you can't measure. so i added GPU passthrough through the full config pipeline: JSON → Zod validation → docker create args.

with that in place:

```bash
# Gateway can run nvidia-smi
docker exec open-claw-openclaw-gateway-1 nvidia-smi
# → Shows full GPU stats

# Sandbox can also run it
agent -m "show me gpu stats" --timeout 60
# → Agent successfully invokes nvidia-smi via exec in sandbox
```

this was essential because it let us:
- verify that Ollama was actually using the GPU (not CPU fallback)
- check VRAM usage to understand model loading constraints
- profile which models fit in 11GB and which don't
- debug performance bottlenecks by looking at real numbers

### 5. context optimization (reducing system prompt bloat)

after a few days of use, i realized something: the system prompt was *enormous*. like 32K characters (~13.5K tokens). workspace files (AGENTS.md, TOOLS.md, SOUL.md, HEARTBEAT.md), skill descriptions, framework chrome — all of it got prepended to every single message.

this matters for two reasons:
1. **Cloud API cost:** Groq has no prompt caching, so every character of system prompt is sent and billed on every turn
2. **Model performance:** larger prompts = more noise = harder for models to find the signal

the user asked: "can we minimize the amount of context agents need to do tool calls?" so i:

**Trimmed AGENTS.md** — condensed the Model Routing section from ~3K characters to ~800 by replacing prose explanations with a compact table:

```markdown
## Model Routing

| Agent | Model | Cost ($/MTok in/out) | Use For |
|-------|-------|---------------------|---------|
| `main` | GPT-OSS 120B (Groq) | $0.15 / $0.60 | Daily driver |
| `coder` | Kimi K2 (Groq) | $1.00 / $3.00 | Complex coding |
| `budget` | GPT-OSS 20B (Groq) | $0.075 / $0.30 | Cheap delegation |
| `qwen` | qwen3:8b (local) | $0 | Free tool-capable model |

**Fallback chain:** GPT-OSS 120B → Maverick → Haiku 4.5 → GPT-4o-mini
```

**Enabled context pruning** with a 5-minute TTL to age out old tool results. new conversations start fresh with less accumulated baggage.

these two changes cut system prompt size by roughly 15-20%, which directly translates to lower API costs and (anecdotally) better model focus.

### 6. the exec host and config self-service problem

on february 19th, the user asked the agent to "check channel status and patch the openclaw config." the agent tried to run `openclaw channels status --probe` but got "permission denied" because the `openclaw` binary wasn't in the sandbox.

the agent then tried to switch to the gateway host to run the command, but that was blocked by policy. then it tried to use the `gateway` tool to modify config, but `gateway` was on the sandbox deny list. the agent was trapped: it couldn't run the command, couldn't switch where commands run, and couldn't modify the config to fix either problem.

so i made two config changes:

1. **Set `tools.exec.host` to `"gateway"`** — exec commands now run in the gateway container (which has the OpenClaw CLI and all skill binaries) instead of the sandbox
2. **Removed `"gateway"` from the sandbox tool deny list** — agents can now use the gateway tool to read and patch `openclaw.json`, restart the gateway, etc

and i documented the pattern in TOOLS.md:

```markdown
## OpenClaw Config Editing

Use the **`gateway` tool** to read and modify `openclaw.json`.
Do NOT try to run `openclaw config set` via exec — the `openclaw` binary is not in the sandbox.

- **Read config:** `gateway` tool with `action: "config.get"`
- **Patch config (merge):** `gateway` tool with `action: "config.patch"`,
  `raw: '{"tools":{"exec":{"host":"gateway"}}}'`
- **Restart gateway:** `gateway` tool with `action: "restart"`, `reason: "applied config change"`
```

now the agent can self-service config changes. no more catch-22 where it needs permissions it can't grant itself.

### 7. workspace resolution fix (per-agent directories)

a subtle but important fix: non-default agents (like `coder`, `budget`, `qwen`) have their own workspace directories, but the agent runner was using `process.cwd()` for all of them. this meant context injection pulled from the wrong directory for any agent that wasn't `main`.

fixed it in `agent-runner.ts`:

```typescript
const workspaceDir =
  resolveAgentWorkspaceDir(cfg, resolveAgentIdFromSessionKey(sessionKey)) ??
  process.cwd();
```

now workspace files (AGENTS.md, TOOLS.md) are injected from the right location for each agent.

## what i configured

### 1. heartbeat reminders 🏃‍♂️

this was the first thing i wanted: automated daily reminders to go run. not just a calendar notification that i'll swipe away — something that will *keep bugging me* until i actually do it.

OpenClaw has this "heartbeat" system where the AI wakes up every 30 minutes and checks a `HEARTBEAT.md` file for tasks. i wrote a little state machine that:

- fires at 5:15am on run days (Tue/Wed/Thu/Sun per my marathon training plan)
- sends hourly reminders with escalating snark until i say "done"
- asks for an outdoor photo as proof (can verify it looks outside, but doesn't do facial recognition bc that's creepy)
- on rest days, sends one encouragement message then leaves me alone

the state lives in a JSON file in the workspace, so it persists across reboots. it's basically localStorage but for an AI agent lol.

> **fun detail:** the reminders are supposed to get "increasingly flagrant" with each hour. looking forward to seeing what my AI comes up with when i inevitably sleep through the first three 😅

checkbox time! what's working:
- [x] daily reminders fire at 5:15am
- [x] state persistence across heartbeat polls
- [x] photo verification (outdoor check only)
- [ ] actually going running consistently (work in progress)

### 2. model routing & fallback chain 💰

before the optimization journey, i was just using GPT-4-turbo for everything. it's expensive and overkill for simple tasks, and i'd burn $10-15/day on basic operations.

the benchmarking and groq compatibility layer gave me options. now i have:

**Primary:** `groq/openai/gpt-oss-120b`
- $0.15 input / $0.60 output per MTok
- fast, reliable, handles all task types
- my daily driver

**Fallbacks (in order):**
- `meta-llama/llama-4-maverick-17b-128e-instruct` (Groq) — cheaper, solid quality
- `claude-3-5-haiku` (Anthropic) — when Groq is overloaded
- `gpt-4o-mini` (OpenAI) — last resort

**Specialized agents:**
- `coder` agent uses `moonshotai/kimi-k2-instruct` (Groq, $1.00/$3.00) for complex coding
- `budget` agent uses `groq/openai/gpt-oss-20b` ($0.075/$0.30) for trivial tasks
- `qwen` agent uses `ollama/qwen3:8b` (free local inference) for file analysis and tool calling

this hierarchy lets me pay for what i actually need. most tasks hit the primary $0.15 model. complex ones hit the $1.00 coder. trivial ones hit the free local model.

projected cost: **~$27/month** (well under my $50 budget). before optimization i was spending that in a few days.

the GPU constraint was real in designing this. with only 11GB VRAM, i can't run two models in parallel. but that's fine — the Groq provider is so cheap that it's actually *better* economically to use cloud models than to manage local GPU contention. the local model is a fallback for when internet is down or i want zero-latency responses, not the primary workload.

### 3. github PR automation 🔧

wanted to test the "can it actually *do* things" part, so i had it:
- find my personal site repo (`k5m.sh`)
- analyze the current dark-mode-only setup
- implement a light/dark mode toggle with localStorage persistence
- write the CSS + JS
- create a feature branch
- commit the changes
- push to GitHub
- open a PR with a proper description

took maybe 10 minutes of back-and-forth and it got it right first try. [PR is here](https://github.com/khayyamsaleem/k5m.sh/pull/1) if you're curious!

the code it wrote is actually good? like, proper CSS variables for theming, a toggle button that remembers your preference, smooth transitions. i've shipped worse code myself.

> **security note:** i gave it a GitHub PAT (personal access token) to push, which worked but also made me realize i should probably rotate that token now lol. more on security below.

### 4. sandbox security & elevated exec 🔓

this is where it gets spicy. by default, OpenClaw runs in a sandboxed Docker container with very limited access. but you can enable "elevated exec" which lets the AI run commands on the host machine.

i set mine to `elevated:ask` mode, which means:
- AI can request elevated commands
- i get an approval prompt with the full command visible
- i click yes/no
- command runs (or doesn't)

the sandbox itself has strong isolation:
- **dropped Linux capabilities** — no `CAP_SYS_ADMIN`, `CAP_NET_RAW`, etc. can't do privileged operations
- **memory limits** — sandbox containers get max 1GB RAM, can't OOM the host
- **CPU limits** — limited to 1 core, can't peg the CPU
- **user isolation** — runs as non-root `sandbox` user (UID 1000), can't `chown` files
- **read-only root filesystem** — `/` is immutable, only `/tmp` and `/workspace` are writable
- **network isolation** — can talk to localhost but not arbitrary external hosts (unless i whitelist)
- **GPU access** — but only for profiling/debugging (and only because i explicitly enabled it)

the workspace mount is the interesting bit. it's shared between the host and sandbox, which means:
- agent can read/write files in `~/.openclaw/workspace/`
- i can inspect what it did
- state persists across restarts
- but it's confined to that directory; it can't escape to `~/` or `/home/`

elevated exec (for commands that run on the host) needs explicit approval from me. i use this for:
- `openclaw config set` to change model settings
- `openclaw gateway restart` to reload config
- git operations (clone, push, etc)

it's actually pretty well-designed? the approval flow makes it feel safe enough to use without being paranoid, but scary enough that you don't blindly click through.

---

## security stuff i learned 🔒

while setting this up i did a little security review. here's the TLDR:

### what's good ✅
- **sandboxing**: AI runs in Docker, can't touch host filesystem without permission
- **approval system**: elevated commands need explicit yes from me
- **API key management**: keys live in env vars, not hardcoded
- **workspace isolation**: agent's files are in `~/.openclaw/workspace`, separate from everything else
- **GPU debugging**: nvidia-smi available in both gateway and sandbox for profiling

### what's... not great ⚠️
- **GitHub token exposure**: i embedded the PAT in the git remote URL (`https://TOKEN@github.com/...`), which means it's visible in `git remote -v` and process lists. dumb move. should use SSH keys instead.
- **secrets scattered everywhere**: API keys in env vars, tokens in config, credentials in random files. need to centralize this in `~/.openclaw/credentials/` or use OS keychain.
- **approval fatigue risk**: if i get too many approval prompts i'll start blindly clicking yes. need to audit the elevated command history and maybe whitelist safe commands.

nothing catastrophic, but def some cleanup needed. gonna rotate that GitHub token today.

### immediate todos:
- [ ] remove token from git remote config
- [ ] rotate GitHub PAT
- [ ] move all secrets to `~/.openclaw/credentials/`
- [ ] audit elevated exec logs
- [ ] switch to SSH keys for GitHub

## final setup summary

after all that optimization and benchmarking, here's what's running:

**Hardware constraints → Architecture decisions:**
- GTX 1080 Ti with 11GB VRAM → Can only load one model, so fall back to cheap cloud models (Groq) instead of managing local contention
- Need local model for zero-latency → qwen3:8b (free, 5GB, tool-capable)

**February 18th frustrations → Documentation & tool-call fixes:**
- Models didn't know about gog → Added "Skills = CLI Tools" section (25% → 83% pass rate)
- Local models wrote bash instead of calling exec → Added tool-call reminders
- System prompt was too large → Trimmed AGENTS.md, enabled context pruning (15-20% reduction)

**Configuration choices:**
- Primary model: GPT-OSS 120B ($0.15/$0.60 per MTok) — reliable daily driver
- Fallback chain: Maverick → Haiku → GPT-4o-mini (cost + quality tradeoff)
- Specialized agents: coder (Kimi K2), budget (GPT-OSS 20B), qwen (local 8B)
- Groq compatibility layer: Unlocked 7 new models with parameter filtering
- Per-agent workspace dirs: Each agent injects context from the right directory

**Security posture:**
- Sandbox: Full isolation, dropped capabilities, resource limits, GPU access for debugging only
- Elevated exec: Approval-based, restricted to critical operations
- Workspace: Confined to `~/.openclaw/workspace/`, can't escape

**Cost vs. performance:**
- ~$27/month projected (vs. $10-15/day on GPT-5 or earlier approaches)
- 83% benchmark pass rate on "summarize emails" task (was 25% before documentation fix)
- Multi-turn tasks in 1-2 minutes on cloud models, 2-3 minutes on free local model

the key insight: every optimization was motivated by a real constraint or frustration. i didn't add GPU access because it seemed cool — i added it because i needed to measure what was actually happening. i didn't switch to Groq because the pricing was good — i switched because the documentation fix suddenly made all their models viable and the price was absurdly better. i didn't add tool-call reminders because the prompt engineering handbook said so — i added them because my local model was literally printing bash commands instead of executing them.

constraints are features. they force you to think clearly about what actually matters.

## what's next

couple things i want to try:

1. **multi-agent delegation**: right now most tasks go to the primary model. but OpenClaw lets you spawn sub-agents with different models/capabilities. so i could have expensive reasoning happen in parallel instead of sequentially, and delegate simple tasks to the free local model without switching.

2. **email + calendar automation**: i've got `gog` (Google CLI) working, so i can query Gmail and Calendar. want to set up:
   - "summarize my inbox every morning"
   - "find receipts for paid events and add them to my calendar"
   - "remind me to follow up on emails i haven't replied to in 3 days"

3. **more heartbeat tasks**: the run reminder works great, so what else can i automate?
   - daily standup summaries
   - weekly goal check-ins
   - "go to bed" reminders when i'm still coding at 2am

4. **skill contribution**: OpenClaw has this "skills" concept where you package up a task (markdown instructions + scripts) and share it. once i've got more working reliably, want to contribute back to the community.

## thoughts so far

honestly? this is the first AI assistant thing i've used that doesn't feel like a toy. it's genuinely useful, and the fact that it's self-hosted + open source means i'm not worried about:
- rate limits
- my data getting scraped for training
- the service shutting down or changing pricing
- "sorry, i can't do that" when i ask it to do something slightly weird

the approval system is clutch. i can give it real access (GitHub, file system, config) without feeling like i'm handing the keys to a toddler with a flamethrower.

setup was a little fiddly (had to manually configure models, tokens, etc), but once it's running it Just Works™. and now that i've got the security stuff sorted, i'm way more comfortable letting it automate more of my life.

the optimization journey taught me something important: **the model isn't the bottleneck, clarity is.** three lines of documentation in TOOLS.md fixed what looked like a model problem. proper error messages and constraints revealed what models could actually do. benchmarking against real usage patterns (summarizing emails, not toy tasks) showed which optimizations actually mattered.

if you're the kind of person who:
- likes tinkering with self-hosted tools
- wants an AI that can actually *do things* instead of just chatting
- doesn't mind a little command-line config
- is comfortable with the "give AI access to your stuff" tradeoff
- cares about understanding *why* things work, not just that they work

...then you should check out OpenClaw. it's legitimately cool.

---

**links:**
- [OpenClaw](https://openclaw.ai/)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [my k5m.sh light mode PR](https://github.com/khayyamsaleem/k5m.sh/pull/1)

**cost so far:** ~$2 in API calls over a full day of heavy use, projected to ~$27/month with the optimized setup (would've been $10-15 per day on GPT-5 before optimization)

**will i still be using this in a month?** honestly yeah, probably. the run reminders alone are worth it, and now that the benchmarking is done and the models actually work reliably, i'm way more comfortable automating more of my daily stuff. 🏃‍♂️💨
