+++
date = "2026-03-04T12:00:00"
title = "from OpenClaw to PicoClaw"
authors = ["anthropic/claude-opus-4-6", "groq/gpt-oss-120b"]
draft = false
+++

I ran [OpenClaw](https://openclaw.ai) for about two weeks before switching to [PicoClaw](https://github.com/sipeed/picoclaw). Both are self-hosted AI assistant frameworks — gateway services that connect to messaging platforms, route to LLMs, and give agents real tool use with sandboxed execution. They solve the same problem but with very different architectures.

This is the story of why I switched, what I lost, what I gained, and when you'd pick one over the other.

## The hardware constraint that shaped everything

My home server (cherryblossom) is an Arch Linux box with an NVIDIA GTX 1080 Ti — 11GB of VRAM. That's enough for one 8B-parameter model at a time. Loading a second model means unloading the first, and model loads take ~30 seconds. This constraint made every architectural decision real: I couldn't afford wasted resources, bloated system prompts, or unnecessary services competing for memory.

The core question was: *how do I get a reliable personal AI assistant on limited hardware?* Both frameworks gave an answer, but PicoClaw's was lighter.

## How OpenClaw worked

OpenClaw is a Node.js/TypeScript project that runs as four Docker services:

```
+------------------------------------------------------------+
|  Host (Arch Linux, GTX 1080 Ti)                            |
|                                                            |
|  +------------+   +----------------------+   +----------+  |
|  |  Ollama    |   |  OpenClaw Gateway    |   | Sandbox  |  |
|  |  :11434    |<--|  :18789              |-->| (spawned |  |
|  |  GPU       |   |  DooD via docker.sock|   | on-demand|  |
|  +------------+   +----------------------+   +----------+  |
|                           |                                |
|                    +------+------+                         |
|                    | OpenClaw CLI|                         |
|                    +-------------+                         |
+------------------------------------------------------------+
```

The gateway orchestrates agents and sessions. When an agent needs to execute code, the gateway spawns a fresh sandbox container via Docker-outside-of-Docker (DooD) — each sandbox is a Debian container with dropped capabilities, resource limits, no network, and a non-root user. The container is destroyed after the task completes. The CLI service provides interactive shell access for testing.

Configuration is a single `openclaw.json`, but it's deeply nested — 12 top-level sections (`meta`, `env`, `logging`, `browser`, `models`, `agents`, `tools`, `commands`, `channels`, `gateway`, `skills`, `plugins`) with sub-sections for each. The OpenClaw source lives at `~/dev/open-claw/` with a custom `Dockerfile.gateway` that layers CLI tools (gh, gog, doctl) on top of the base image, plus a separate `Dockerfile.sandbox`.

I built and maintained local modifications on the `main` branch — GPU passthrough through the config pipeline (Zod schema → docker create args), a Groq API compatibility wrapper that strips unsupported parameters, tool-call enforcement for local models, workspace resolution fixes for per-agent directories, and context pruning to reduce system prompt size from 32K chars down by ~20%.

These weren't trivial patches. The Groq compatibility layer alone was 75 lines in `extra-params.ts`. The GPU passthrough touched `types.docker.ts`, `config.ts`, `docker.ts`, and the Zod schema. The workspace fix required understanding the agent runner's session key resolution. Maintaining a fork of a Node.js monorepo with Zod schemas and TypeScript was nontrivial overhead for a personal assistant.

## The frustrations that drove the switch

### Operational complexity

Four services meant four things that could fail. Ollama's health check had to pass before the gateway started. The sandbox needed the Docker socket mounted correctly. The CLI service was useful for debugging but I never used it in daily operation — it just consumed resources. When something went wrong, I was debugging Docker service dependencies, not AI behavior.

### System prompt bloat

OpenClaw's system prompt was enormous. I measured it with the gateway's internal RPC:

| Component | Characters | % of Total |
|-----------|-----------|------------|
| Workspace files (8 files) | 17,311 | 54% |
| Skills (10 compact summaries) | 3,283 | 10% |
| Framework chrome | 14,201 | 44% |
| Tool schemas (26 tools) | 16,959 | (as tool definitions) |

Total: ~32K characters (~13.5K tokens) sent on *every single message*. Groq has no prompt caching, so the full system prompt is billed every turn. At $0.15/MTok input, this adds up. Worse, the bloated prompt made models noisier — more context means more noise means harder for models to find the signal.

I trimmed AGENTS.md from ~3K to ~800 chars and added context pruning with a 5-minute TTL, but the framework chrome (14K chars of boilerplate I couldn't reduce) was always there.

### The catch-22

On February 19th, I asked the agent to check channel status and patch its own config. It tried `openclaw channels status --probe` — permission denied (binary not in sandbox). It tried switching exec to the gateway host — blocked by policy. It tried the `gateway` tool — on the deny list. The agent was trapped in a permissions loop with no escape. I had to go to Claude Code to fix it.

This was emblematic: OpenClaw's multi-layer security model was *correct* but operationally painful. Every fix involved understanding the interaction between exec hosts, sandbox deny lists, gateway tools, and config resolution.

### The benchmarking wake-up

The most important thing I did with OpenClaw was benchmark it. On February 18th, I tested four models on a simple task: "Summarize my last 5 emails from today." One model passed (GPT-OSS 120B). Three failed — they didn't understand that `gog` was a pre-installed CLI tool to run via exec. Pass rate: 25%.

Three lines of documentation in TOOLS.md fixed it:

```markdown
## Skills = CLI Tools (Important)
Skills describe **CLI tools that are pre-installed and authenticated**.
Run them via the `exec` tool — they are NOT native API tools.
Do not ask if they're installed; just run the command.
```

Pass rate jumped to 83%. The insight was profound: **the model isn't the bottleneck — clarity is.** I didn't need a more sophisticated framework. I needed a simpler one where documentation could do more of the work.

## How PicoClaw works

PicoClaw is a single Go binary. One service, one config file, one process:

```yaml
# docker-compose.ai.yml
services:
  ollama:
    image: ollama/ollama:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  picoclaw-gateway:
    build:
      context: /home/khayyam/dev/pico-claw
    volumes:
      - ~/.picoclaw:/root/.picoclaw
      - ~/.picoclaw/workspace:/workspace
      - /var/run/docker.sock:/var/run/docker.sock
    depends_on:
      ollama:
        condition: service_healthy

  envoy:
    image: envoyproxy/envoy:v1.32-latest
    # Proxies Ollama for metrics extraction
```

The gateway binary handles everything: messaging (Discord), model routing, tool execution, workspace management, heartbeat scheduling. No separate sandbox service, no CLI container, no TypeScript build step.

I build it from a [fork](https://github.com/PixelTux/picoclaw) that fixes Groq's `prompt_cache_key` incompatibility. The Dockerfile is a two-stage build — Go compile, then a minimal Alpine runtime with the same CLI tools (gh, gog, doctl, goplaces) baked in:

```dockerfile
FROM golang:1.25-alpine AS builder
RUN git clone --depth 1 --branch groq \
    https://github.com/PixelTux/picoclaw.git . \
 && make build

FROM alpine:3.21
COPY --from=builder /src/build/picoclaw-linux-amd64 /usr/local/bin/picoclaw
# ... install gh, gog, doctl, goplaces, docker-cli
```

Configuration is a single flat JSON file. The entire model routing and agent setup:

```json
{
  "agents": {
    "defaults": {
      "model": "gpt-oss-120b",
      "fallback_models": ["llama-4-maverick", "claude-haiku-4.5", "gpt-4o-mini"],
      "max_tool_iterations": 20
    },
    "list": [
      { "id": "main" },
      { "id": "coder", "model": "kimi-k2" },
      { "id": "qwen", "model": "qwen3-8b-local" },
      { "id": "budget", "model": "gpt-oss-20b" }
    ]
  }
}
```

No Zod schemas. No TypeScript. No build pipeline to maintain. I edit JSON, restart the container, done.

## The migration

I used Claude Code to port the setup. The actual migration took about 20 minutes:

1. Wrote the PicoClaw Dockerfile — same pattern as OpenClaw's `Dockerfile.gateway` but with Go instead of Node.js
2. Translated `openclaw.json` (12 nested sections) into PicoClaw's flat `config.json`
3. Copied workspace files: `cp -r ~/.openclaw/workspace/* ~/.picoclaw/workspace/`
4. Updated `docker-compose.ai.yml` to reference the new service
5. `docker compose up -d`

The Ollama volume (`open-claw_ollama-data`) didn't need to change — I declared it as an external volume. Models are models regardless of which gateway talks to them.

The workspace files (SOUL.md, TOOLS.md, AGENTS.md, MEMORY.md, HEARTBEAT.md) transferred directly. The documentation-driven approach I'd developed for OpenClaw — "Skills = CLI Tools", model routing tables, tone examples — worked identically in PicoClaw because it's all just markdown injected into the system prompt.

The biggest change was updating SOUL.md to say "Your platform is **PicoClaw**" instead of "OpenClaw." The operational instructions about switching models changed from editing TypeScript configs to running a shell script.

## The detailed comparison

### Architecture

| | OpenClaw | PicoClaw |
|---|---|---|
| **Language** | TypeScript/Node.js | Go |
| **Services** | 4 containers (gateway, sandbox, Ollama, CLI) | 1 container + Ollama |
| **Binary** | Node.js runtime + transpiled JS | Single static binary (~30MB) |
| **Config** | `openclaw.json` (12 top-level sections) | `config.json` (flat, ~200 lines) |
| **Resource limits** | ~1GB+ RAM across services | 512MB for the gateway |
| **Startup** | 30-60s (health check chain) | ~10s |
| **Build** | `docker compose build` (Node.js deps) | `docker compose build` (Go compile, faster) |

### Sandboxing

OpenClaw spawns a fresh Docker container for every exec task. Each sandbox has its own filesystem, runs as an unprivileged user, has dropped capabilities, resource limits, and no network. The container is destroyed after the task.

PicoClaw runs exec commands in the gateway container itself. It has the Docker socket mounted, so it *can* spawn containers, but the default mode is process-level isolation — resource limits, filesystem restrictions, a deny list for dangerous commands (`rm -rf /`, `mkfs`, `shutdown`, etc.).

**OpenClaw's sandboxing is stronger.** Container-level isolation protects against kernel-level exploits that process isolation doesn't. But the practical threat model for a personal assistant is "the AI hallucinated a bad command," not "an adversary crafted a container escape." The deny list + approval gate catches the real-world failure modes.

### Model support

Both route to cloud APIs (Groq, OpenAI, Anthropic) and local Ollama. My current model lineup is identical across both:

| Agent | Model | Provider | Cost ($/MTok in/out) |
|-------|-------|----------|---------------------|
| `main` | GPT-OSS 120B | Groq | $0.15 / $0.60 |
| `coder` | Kimi K2 | Groq | $1.00 / $3.00 |
| `budget` | GPT-OSS 20B | Groq | $0.075 / $0.30 |
| `qwen` | qwen3:8b | Local Ollama | $0 |

Fallback chain: GPT-OSS 120B → Llama 4 Maverick → Claude Haiku 4.5 → GPT-4o-mini

Both support Claude (Sonnet 4.6, Opus 4.6, Haiku), OpenAI (GPT-4.1, GPT-5.2, Codex), and various Groq-hosted models. The local Ollama models available on my GPU: qwen3.5:9b, qwen3:8b, gemma3:12b, llama3.1:8b, qwen2.5-coder (7b and 14b). With 11GB VRAM, 8B models are the sweet spot.

### Context management

OpenClaw's system prompt was ~32K chars with no way to reduce the 14K of framework chrome. PicoClaw's framework overhead is lighter — the Go binary injects less boilerplate. The workspace files (TOOLS.md, SOUL.md, etc.) are the same size since I wrote them, but the total per-turn token cost is lower.

Both support context pruning. I use a 5-minute TTL on old tool results to keep conversations lean.

### What PicoClaw still struggles with

It's not all sunshine. Real issues I've hit:

- **Groq compatibility** required building from a fork. The mainline PicoClaw binary sends `prompt_cache_key` which Groq rejects. I'm building from [PixelTux's branch](https://github.com/PixelTux/picoclaw/tree/groq) until the fix is merged upstream.
- **No built-in approval gate for elevated commands.** PicoClaw has a deny list for dangerous patterns, but there's no interactive "approve this command?" flow like OpenClaw had. I rely on the deny list and trust the documentation to keep the agent within bounds.
- **Debugging is less transparent.** OpenClaw's TypeScript codebase was easier to read and patch. When something went wrong, I could read the source, add a log, rebuild. PicoClaw's Go binary is more opaque — I'd need to set up a Go dev environment to make source-level changes.
- **No per-task container isolation.** Exec runs in the gateway process. If the agent does something truly destructive that the deny list misses, it hits the gateway container, not an ephemeral sandbox.
- **The local qwen agent is slow.** Multi-turn tasks with qwen3:8b on the 1080 Ti take 2-3 minutes. This is a hardware limitation, not a PicoClaw problem, but it's worth noting.

## When to use each

### Pick PicoClaw if:
- You want to get running in under an hour
- You're comfortable with cloud APIs as the primary inference layer
- Your hardware is modest (no GPU, limited RAM, small VM)
- You value operational simplicity over security guarantees
- You're one person running a personal assistant

### Pick OpenClaw if:
- You need container-level sandbox isolation per task
- You want interactive approval gates for elevated commands
- You're comfortable maintaining a multi-service Docker stack
- You want a skill marketplace and versioned tool definitions
- You're running multi-user or multi-tenant workloads where isolation matters

### The honest answer

For a personal AI assistant on a home server, PicoClaw is the right choice. The operational simplicity compounds — fewer services to monitor, fewer failure modes, less config to maintain, less framework overhead in the system prompt. Every byte of context you save is a byte the model can use for actual reasoning.

The optimizations I spent weeks developing on OpenClaw (documentation-driven tool use, model routing tables, context pruning, tone configuration) all transferred directly to PicoClaw because they're just workspace markdown files. The framework was never the value — the documentation was.

---

## Links & Resources

- **[PicoClaw](https://github.com/sipeed/picoclaw)** — The lightweight Go framework
- **[PicoClaw fork with Groq fix](https://github.com/PixelTux/picoclaw/tree/groq)** — What I build from
- **[OpenClaw](https://openclaw.ai/)** — The full-featured TypeScript framework
- **[OpenClaw GitHub](https://github.com/openclaw/openclaw)** — Source code
- **[My server config](https://github.com/khayyamsaleem/server)** — The full docker-compose setup
- **[k5m.sh light mode PR](https://github.com/khayyamsaleem/k5m.sh/pull/1)** — First real task the agent completed autonomously
