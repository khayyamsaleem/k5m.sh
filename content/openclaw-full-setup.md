---
title: "self-hosted ai that doesn't terrify me 🏠🤖"
date: 2026-02-18
draft: false
---

i finally set up a personal AI assistant that actually works. not in the "sometimes chatgpt is helpful" way, but in the "i've delegated real automation tasks to an AI running on my machine" way.

it's called [OpenClaw](https://openclaw.ai), and it's the first one of these things that I'm not constantly worried about.

## the problem

every AI assistant setup i've tried hits the same wall: they're either locked down so hard they're useless, or they're so open i'm terrified to give them access to anything. i want something that can:

- autonomously check my email
- commit code to my repos
- run arbitrary commands
- generate and execute scripts
- but *not* destroy my data when it glitches

## the machine

first, let me be honest about the hardware. i'm running this on a personal workstation, not some cloud empire:

**Host:** Manjaro Linux (kernel 6.6.124) on a desktop PC
**CPU:** Ryzen (didn't check which gen, but plenty of cores)
**RAM:** 64GB
**GPU:** NVIDIA GTX 1080 Ti (11GB VRAM) — this is the real constraint
**Storage:** 916GB SSD available, /workspace at 58% capacity

the GPU is the interesting bottleneck. the 1080 Ti is old (2017), but still better than a CPU for running local LLMs. the 11GB VRAM means:
- **one 8B parameter model at a time** (~8-9GB)
- loading a different model takes ~30 seconds
- can't run two models in parallel
- careful VRAM budgeting required

this is actually fine! for my use case (occasional file analysis, mostly delegating to hosted APIs), one model at a time is plenty.

## the stack

OpenClaw runs as four Docker services orchestrated by docker-compose:

```
┌─────────────────────────────────────────┐
│     My Workstation (Host)               │
│  - Docker daemon                        │
│  - ~/.openclaw/workspace/ (mounted)     │
│  - GPU passthrough to containers        │
└─────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  docker-compose       │
        │  (4 services)         │
        └───────────────────────┘
                    │
        ┌───────────┼───────────┬──────────┐
        ▼           ▼           ▼          ▼
    ┌──────┐   ┌──────────┐ ┌────────┐ ┌─────┐
    │Ollama│   │ Gateway  │ │Sandbox │ │ CLI │
    │      │   │          │ │ (on-   │ │     │
    │:11434    │ :18789   │ │ demand)│ │     │
    └──────┘   └──────────┘ └────────┘ └─────┘
      GPU ✓        Docker ✓
        DooD      DooD
```

### Ollama (local inference)

- runs the local LLM with GPU acceleration
- supports Llama 3.1:8b, Qwen 3:8b
- models persist in a named volume
- **cost: $0**

### OpenClaw Gateway (orchestrator)

- the brains: routes messages, spawns agents, manages sessions
- uses "Docker-outside-of-Docker" (DooD) — mounts the host docker socket
- can spawn sandbox containers on-demand for running untrusted code
- read-only root filesystem for safety (only `/tmp` and workspace are writable)
- listens on `localhost:18789`

### Sandbox (execution environment)

- build-only service (not persistent)
- gateway spawns instances when agents need to run code
- based on debian bookworm-slim
- includes: bash, git, curl, python3, jq, ripgrep
- runs as non-root user with dropped Linux capabilities
- memory-capped at 2GB, CPU-capped at 2 cores

### CLI (terminal interface)

- lets me interact with the gateway from my shell
- optional; the automated stuff doesn't need it

## the models

OpenClaw lets you mix and match local + hosted models. here's my setup:

**Local (free):**
- Qwen 3:8b — fast, good at code & reasoning
- Llama 3.1:8b — alternative if i need different strengths

**Hosted (fallback chain):**
1. GPT-4-Turbo (OpenAI) — best cost/quality for general tasks
2. Claude Sonnet (Anthropic) — fallback #1
3. Gemini 3 Flash (Google) — fallback #2 (free during preview!)

the fallback chain means if one API fails or rate-limits, it automatically tries the next. this is actually really nice for reliability.

## the benchmarking

before i trusted this setup with real work, i benchmarked the local models across 5 different scenarios. yeah, five. i wanted to know what these models are actually good for.

### benchmark 1: simple latency

ran quick prompts against each model and measured tokens/second. results:

- Qwen 3:8b: ~25-32 tok/s
- Llama 3.1:8b: ~28 tok/s
- Gemma 3:12b (quantized): ~18 tok/s

tldr: Qwen is fast. Gemma is slower but more capable in some dimensions.

### benchmark 2: comprehensive evaluation

10 tests across 4 categories:
- **Coding** (3 tests): FizzBuzz, binary search, regex
- **Reasoning** (3 tests): math word problems, logic puzzles, sequence prediction
- **Summarization** (2 tests): paragraph summaries, key point extraction
- **Tool calling** (3 tests): function calling, multi-step operations

each test had a **validation function** — not just "did it respond" but "did it get the right answer?"

results (simplified):

| Model | Coding | Reasoning | Summarization | Tools | Total |
|-------|--------|-----------|---------------|-------|-------|
| Qwen 3:8b | 3/3 | 2/3 | 2/2 | 3/3 | **10/11** |
| Llama 3.1:8b | 2/3 | 3/3 | 2/2 | 1/3 | 8/11 |
| Gemma 3:12b | 3/3 | 2/3 | 1/2 | 2/3 | 8/11 |

**Qwen wins** for my use case (code + tool calling). Llama is better at pure reasoning.

### benchmark 3: agentic evaluation

tested models specifically on tasks they'd do as agents:
- **tool selection** — given 4 tools, pick the right one
- **no-tool knowledge** — answer from knowledge, don't call tools unnecessarily
- **large context** — summarize a 3000+ word technical doc on consensus protocols
- **debugging** — identify an async race condition and suggest the fix

Qwen and Llama both handled this pretty well. Gemma (even quantized) struggled with the larger context.

### benchmark 4: end-to-end through the gateway

ran agents through the actual OpenClaw gateway (not just direct API calls). this includes sandbox spawning, tool resolution, session management — the real deal.

this is where you see the wall-clock overhead of the entire pipeline. going from "model inference time" to "how long until i get an answer back" is usually 2-3x longer.

important detail: i unloaded all Ollama models from VRAM before each test to be fair. otherwise model A would run fast (already in VRAM) and model B would stall for 30 seconds loading.

### benchmark 5: real-world agentic task

the ultimate test: "check my email from the last 2 days, installing the `gog` CLI tool if not already present."

this required:
- multi-step reasoning (check if tool exists, install if not)
- CLI interaction (running shell commands)
- fallback handling (parsing output, handling errors)

**Qwen result:** 207 seconds (3.5 minutes)
- correctly identified gog CLI
- constructed proper Gmail date syntax
- proposed the right command

it worked! the model understood the multi-step task, ran the right commands, and interpreted the output correctly.

this is where i decided "okay, i trust this enough to automate real stuff."

## what i'm actually using it for

1. **daily run reminders** — heartbeat system pings me every hour until i go running 🏃‍♂️
2. **email automation** — scanning for important messages, extracting info
3. **git automation** — creating PRs, reviewing code, writing commit messages
4. **file analysis** — searching logs, extracting data, reformatting documents
5. **security research** — analyzing config files, identifying vulnerabilities

none of this is *mind-blowing*, but it's all stuff i was doing manually before. the automation is solid and reliable enough that i'm comfortable giving it real access (with approval gates for scary operations).

## security stuff

OpenClaw has an approval system for dangerous operations. when the AI wants to:
- delete files
- push to GitHub
- run arbitrary shell commands
- modify config

...it sends me an approval request. i see the exact command, i click yes or no. this is *exactly* the right level of paranoia.

additionally:
- sandbox has dropped Linux capabilities (can't do privilege escalation)
- memory limit (2GB) prevents OOM attacks
- read-only root filesystem (can't modify system)
- non-root user (can't chown files)
- workspace-only access (can't read arbitrary system files)

it's not Fort Knox, but it's reasonable. the AI can still do useful stuff (run commands, write files, git operations) but it can't nuke my system.

## costs

in practice, here's what happens:

1. **simple task** (file search, log parsing, formatting) → local Qwen ($0) takes 30-90 seconds
2. **medium task** (code generation, reasoning) → GPT-4-Turbo ($0.01-0.03) takes 5-10 seconds
3. **hard task** (complex reasoning, architecture) → Claude Sonnet ($0.02-0.05) takes 15-30 seconds

over a full day of heavy use, i spend about $2 in API calls. would be $10-15 if i ran everything on GPT-5 (the expensive stuff).

the local GPU basically handles the "slow but free" tasks, hosted APIs handle "fast but costs money" tasks. this is honestly the perfect balance for my use case.

## why this matters

every other "personal AI assistant" setup i've tried fails one of these:

- **scared to use it** — you can't give it real access without worrying
- **not useful** — too locked down, can't do anything interesting
- **expensive** — runs everything on expensive hosted APIs
- **black box** — you don't know what's happening or what you're running
- **privacy nightmare** — your data leaves your machine

OpenClaw solves all of these:
- ✅ safe to use (approval gates, sandboxing)
- ✅ actually useful (can run real commands)
- ✅ cheap (hybrid local + hosted)
- ✅ transparent (it's open source, you control it)
- ✅ private (everything runs on your machine)

the setup does require some Linux knowledge and you have to be comfortable with Docker, but if you're into that stuff it's not too bad.

## next steps

want to implement:
- [ ] multi-agent delegation (spawn cheap sub-agents for task decomposition)
- [ ] email → calendar automation (find receipts, add paid events)
- [ ] more heartbeat tasks (standups, reminders, location-based triggers)
- [ ] semantic search over my notes (so it can context-search instead of random grep)

also need to learn:
- [ ] whether my current Qwen/Llama split makes sense or if i should just pick one
- [ ] how to use the tool-calling APIs more effectively
- [ ] whether i should optimize for latency vs. capability

## conclusion

this is the first "AI assistant" thing that i'm not constantly worried about or frustrated by. it costs me $2/day, runs on hardware i own, does real work, and i actually trust it.

if you're the kind of person who:
- runs services on your home server
- is comfortable with Linux and Docker
- wants an AI that can *actually do stuff* instead of just chat
- doesn't want to pay cloud vendors $1000/month
- cares about data privacy

...then check out OpenClaw. it's genuinely cool. and it's open source so you can see exactly what's happening.

---

**links:**
- [OpenClaw](https://openclaw.ai)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [My OpenClaw config](https://github.com/khayyamsaleem/openclaw-config) *(if i publish it)*

**time invested:** ~8 hours setup + config + benchmarking
**monthly cost:** ~$60-80 API spend, $0 hardware (already had the GPU)
**would i do it again:** absolutely. best technical investment in months.
