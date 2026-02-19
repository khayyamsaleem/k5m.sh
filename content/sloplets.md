+++
date = "19 Feb 2026"
title = "sloplets"
+++

# sloplets: your AI deserves its own disaster zone 🔥

imagine this. you're feeling lazy. you ask your AI assistant to do something useful: _summarize my emails and push a commit to my repo_. sounds chill, right?

except your AI is running *on your laptop*. it has access to your actual Gmail. your actual GitHub. your actual home directory.

one hallucination. one off-by-one error in the reasoning. one moment where the model confidently decides that `rm -rf ~` is exactly what you wanted.

your home folder is gone.

now imagine a different world. every time your AI runs a tool—every `gog gmail search`, every `git push`, every `python script.py`—it happens inside a throwaway Docker container. a sandboxed, isolated, completely ephemeral little universe. the AI tries `rm -rf /`? the container dies. you laugh. you try again. nothing breaks. nothing *ever* breaks.

welcome to the **sloplet**. 🎪

---

## what even is a sandbox?

a sandbox is an isolated environment. it's like a playpen, except the toys are real and dangerous, but they can't escape into the rest of your house.

when you run code in a sandbox:
- it can read, write, execute, crash, explode
- it has no access to your real system
- it has resource limits (memory, CPU, network)
- when the code finishes (or explodes), the sandbox dies with it
- nothing persists unless you explicitly let it

that's it. that's the whole magic. your AI gets a place to be creative, destructive, experimental—and you sleep soundly knowing your actual machine is untouched.

---

## the premium sloplet lineup 💎

so you want to hand your AI a sandbox without rolling your own? the market has you covered. here's the flavor palette:

### **exe.dev** — _the cozy home_

persistent VMs via SSH. the disk persists. you have sudo.

exe.dev is the no-nonsense play. spin up a VM, SSH into it, let your AI live there. it's like giving your agent a laptop of its own. filesystem persists. tools installed last week are still there. your AI gets a *home*.

great for: long-running agents, persistent state, workflows that need to accumulate context over time.

the vibe: "your AI gets a home" 🏠

### **sprites.dev (Fly.io)** — _the clone army_

hardware-isolated VMs. under one second to spin up. checkpointable. pay per second.

Sprites are Fly's answer to the sandbox problem: what if every invocation got its own VM? not a container—a real, isolated VM. and they boot *fast*. you can fork them like processes. you can checkpoint them. you pay only for what you use, by the second.

Fly's official take: _"Agents run better on Sprites."_

the vibe: "your AI gets a clone army" 👾

### **E2B (e2b.dev)** — _the industrial playground_

200M+ sandboxes started. Fortune 100 customers. open-source. purpose-built for AI.

E2B is the hardcore sandbox product. it's made *specifically* for LLM inference, coding agents, research agents, MCP servers. it's been battle-tested at scale. if you need a sandbox product that just works and scales to billions, this is it.

the vibe: "industrial-grade playpens for your AI" 🏭

### **Modal** — _the factory floor_

sub-second cold starts. elastic GPU scaling. "100x faster than Docker."

Modal is the factory. if your AI needs to spin up compute, run training loops, handle massive evals, process RL environments—Modal is the hammer. it scales to zero. it autoscales up. it has GPUs. it's *fast*.

real quote from Modal users: _"Everyone here loves Modal... we rely on it to handle massive spikes in volume for evals, RL environments, and MCP servers."_

the vibe: "your AI gets a factory floor" ⚡

---

## DIY sloplets: the $6 way 🚀

here's the thing: **you don't need any of those products**.

a DigitalOcean droplet (or AWS EC2, or Linode, or Hetzner) + Docker = infinite sandboxes.

### the setup

spin up a **$6/month Droplet** (1GB RAM, 1 vCPU, Linux). install Docker. done. now you can spawn sandboxes:

```bash
# one sloplet per tool call
docker run --rm \
  --network=none \
  --memory=512m \
  --cpus=0.5 \
  --cap-drop=ALL \
  --user=nobody \
  my-agent-image \
  python /app/tool.py
```

each invocation:
- spins up a fresh container
- runs your code in isolation
- has no network access (unless you explicitly allow it)
- is destroyed when it finishes
- took ~100-500ms total

cost: essentially free. you're paying $6/month for the droplet whether you run 10 tasks or 10,000.

### how it works

your agent orchestrator (OpenClaw, LangGraph, whatever) talks to the Docker daemon via `/var/run/docker.sock`:

1. **LLM generates tool call:** `execute: python summarize_emails.py`
2. **Orchestrator routes to sandbox:** spawn `docker run`
3. **Container executes:** code runs, produces result
4. **Result returned:** orchestrator captures stdout/stderr
5. **Container destroyed:** garbage collected

the loop takes ~500ms total. the agent never stops reasoning.

### security (the stuff that actually matters)

```
resource limits:
  - memory: 512MB (hard cap)
  - CPU: 0.5 cores (can't hog your system)
  - PIDs: 256 (no fork bombs)

capabilities:
  - CAP_DROP=ALL (no root powers)
  - nonroot user (nobody, 65534)

network:
  - --network=none (isolated, unless explicitly bridged)
  - no external access by default
  - whitelist what you need (S3, APIs, etc.)

filesystem:
  - ephemeral (tmpfs or destroyed on exit)
  - no persistence (unless you mount a volume)
```

OpenClaw actually does this natively. the gateway mounts `/var/run/docker.sock` and spawns sibling containers for every exec call. it's Docker-outside-of-Docker (DooD). it works. it's fast.

### costs at scale

one $6/month droplet can safely run:
- dozens of concurrent sandboxes (limited by RAM/CPU)
- hundreds of sequential tasks per day
- each task fully isolated, fully auditable

if you need more? spin up another $6 droplet. or go to E2B for easier scaling. but for personal AI assistants, one droplet is *plenty*.

---

## how agents actually use sandboxes

here's the real flow. this is what happens every time your AI needs to do something:

```
┌─────────────────────────────────────┐
│  User: "Summarize my emails"        │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Agent (LLM):                       │
│  "I need to call gog gmail search"  │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Agentic Platform:                  │
│  "OK, spawning sandbox..."          │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Docker Container Spawned:          │
│  $ gog gmail search "from:work"     │
│  → email1, email2, email3           │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Container Destroyed                │
│  Result: [3 emails]                 │
└─────────────┬───────────────────────┘
              ↓
┌─────────────────────────────────────┐
│  Agent (LLM):                       │
│  "Got it. Here's the summary:"      │
└─────────────────────────────────────┘
```

the entire loop: ~500ms. the model's context never breaks.

### the big three already do this

you've been using sandboxes this whole time and didn't even know:

- **OpenAI Code Interpreter** = a sandbox running Python/bash in a throwaway VM
- **Claude Computer Use** = a sandbox running a Linux desktop environment
- **GitHub Copilot Workspace** = sandboxes running your dev environment

these are just _premium sloplets in a trench coat_. they charge you for the convenience.

---

## market signals: everyone's going in 📈

the sandbox play is becoming table stakes:

- **E2B hit 200M sandboxes started.** Fortune 100 customers. Open-source. Investors noticed.
- **Fly.io launched Sprites.** Purpose-built VM-based sandboxes for agents. This is not a side project.
- **Modal is powering AI labs.** RL environments, eval infrastructure, MCP servers. Used by serious organizations doing serious AI work.

the pattern:
1. AI lab tries to run agent eval
2. They need isolation, fast cold starts, GPU support
3. They pick E2B or Modal or Sprites
4. They scale from 1K to 1M invocations
5. Sandbox layer is the bottleneck (not the model, not the logic)

every serious agentic platform is building around a sandbox. the primitives are consolidating. **"bring your own sloplet" is becoming table stakes.**

---

## the shopping list 🛒

so you want sandboxes. here's your options:

### _managed (easier, better cold starts, pay-per-use):_
- **E2B** — $5-25/month or usage-based. Fortune 100 trusted. open-source.
- **Sprites (Fly.io)** — per-second billing. hardware isolation. under 1s cold start.
- **Modal** — usage-based, elastic scaling, GPU support. best if you need RL/batch.

### _DIY (more control, cheapest at low volume, educational):_
- **DigitalOcean Droplet + Docker** — $6/month. you own it. unlimited sandboxes.
- **AWS EC2 + Docker** — $15/month (t3.small). IAM-based access control. ECS optional.
- **Hetzner + Docker** — €3/month. European data center. same deal.

### _one more option (for the paranoid):_
- **exe.dev** — SSH into a persistent VM. let your agent live there. pay per hour ($0.02-0.05). zero setup.

---

## the uncomfortable truth 💀

if your AI can write code, **it needs a sandbox. period.**

not "should have." not "would be nice." *needs.*

because the moment you give it real tools (git, email, AWS credentials, whatever), the stakes are real. one hallucination is not a typo. one hallucination is `rm -rf ~`. one hallucination is your AWS bill going to $50k. one hallucination is a commit message that says "I have decided to rewrite the entire codebase in LISP and delete all tests."

a sandbox is not optional. it's the trust layer. it's what makes powerful AI tools safe.

---

## tl;dr: go forth and sloplet 🚀

**if your AI can execute code, it needs a sloplet.**

here's what you're buying:
- peace of mind
- the ability to actually delegate dangerous tasks
- the ability to experiment without fear
- isolation for each request
- auditable execution logs
- the future of agentic AI

pick your flavor:
- **cheapest:** DigitalOcean ($6/month)
- **easiest:** E2B (sign up, API, done)
- **fastest:** Sprites (under 1s, real VMs)
- **most powerful:** Modal (GPUs, scale, RL)
- **most nostalgic:** exe.dev (SSH into a VM like it's 2005)

now go. build something weird. give your AI a sandbox. let it run. watch it fail safely. iterate. ship.

your AI deserves its own disaster zone. 🔥

