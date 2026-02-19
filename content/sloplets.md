+++
date = "19 Feb 2026"
title = "sloplets"
+++
# Sloplets: Your AI Deserves Its Own Disaster Zone

## The Problem: Code Execution on Your Actual Machine

Imagine a scenario where you instruct your AI assistant to summarize your emails and then make a commit to your GitHub repository. The assistant has real access to your Gmail account via `gog gmail search` and real access to your repository via `git push`. Everything seems straightforward until the model makes a critical error—perhaps it misinterprets a command and attempts to run `rm -rf /`. Without proper isolation, this single hallucination would result in catastrophic data loss on your actual machine.

Now consider the same workflow where each tool invocation executes inside a disposable Docker container. The AI attempts the same destructive command, but the container is destroyed immediately afterward. The email summary reaches your terminal safely. The commit is made successfully. Nothing is broken. This is a sloplet doing its job correctly.

## Understanding Sandboxes

A sandbox is an isolated, temporary computing environment where an AI agent can safely execute code, run system commands, install packages, and interact with real tools without risking the stability of your primary system. When a large language model needs to perform actions beyond conversation—to write code, execute scripts, or access external systems—it requires a safe execution environment. A sandbox provides exactly that: a controlled space where potentially harmful operations are contained and ephemeral.

## The Sandbox Product Landscape

Several companies have built dedicated sandbox solutions tailored for AI agents. Each approaches the problem differently, with varying trade-offs between control, cost, and ease of use.

### Product Comparison

| Product | Core Offering | Typical Cost | Key Strength |
|---------|---------------|--------------|--------------|
| **exe.dev** | Persistent virtual machines accessible via SSH | ~$10–40/month | Persistent disk state; full `sudo` access; long-running agent environments |
| **sprites.dev** (Fly.io) | Hardware-isolated ephemeral VMs with sub-second startup | Per-second CPU/memory billing | Instant VM provisioning; checkpointable state; ideal for high-throughput agent tasks |
| **E2B** | Purpose-built AI sandbox platform with multiple language SDKs | Pay-per-use or enterprise plans | Extensively battle-tested (200M+ sandboxes launched); optimized for coding agents; Fortune 100 adoption |
| **Modal** | High-performance serverless inference and job execution | Per-second compute or fixed pricing tiers | Sub-second cold starts; elastic GPU scaling; built for training and large-scale inference workloads |
| **DIY DigitalOcean + Docker** | Self-managed Droplet with Docker containerization | ~$6–15/month base VM | Complete control; lowest cost at low volume; excellent educational value; full customization |

### Permanent VMs: exe.dev

exe.dev offers bare-minimum, no-frills persistent virtual machines that you access via SSH. The disk state persists between sessions, and you have full sudo privileges. This approach is ideal for agentic workflows that require a continuous working environment where your AI can maintain state, configuration, and contextual information across multiple tasks.

The value proposition is straightforward: your AI gets a home. It is not born anew with every request; instead, it inhabits a persistent space where it can accumulate knowledge and build on previous work.

### Instant VMs: sprites.dev

sprites.dev, created by Fly.io, delivers hardware-isolated sandboxes that are ready for execution in under one second. Each Sprite is a self-contained virtual machine that can be checkpointed—frozen and restored—like a process. Billing is proportional to actual CPU and memory consumption, measured per second, making the pricing model transparent and scalable.

Fly.io's positioning is clear: "Agents run better on Sprites." This product is explicitly designed for the problem of running AI-generated code safely at scale.

### Enterprise-Grade Sandboxes: E2B

E2B (e2b.dev) has become the de facto standard sandbox platform for serious agentic workloads. The platform has launched over 200 million sandboxes and counts Fortune 100 companies among its customers. E2B provides open-source SDKs in Python and JavaScript, enabling deep integration with agent frameworks.

The platform excels at supporting diverse use cases: deep research tasks, computer-use agents that simulate browser interactions, coding agents that generate and execute multi-file projects, and reinforcement learning environments. The industrial-grade reliability and extensive feature set make E2B the trusted choice for production AI systems.

### Elastic Compute: Modal

Modal positions itself as high-performance infrastructure for AI workloads. The platform achieves sub-second cold starts, provides elastic GPU scaling, and automatically scales to zero when idle. Modal markets itself as "100x faster than Docker" and is used by major AI labs for reinforcement learning environments, evaluation harnesses, and MCP (Model Context Protocol) servers.

Key differentiator is GPU support at scale. If your agent needs to run GPU-accelerated tasks or if you are managing high-volume inference, Modal's infrastructure is purpose-built for that demand.

## The DIY Approach: Sloplets

The insight that drives the sloplet concept is this: you do not need a specialized commercial sandbox product. A simple combination of a low-cost virtual machine and Docker provides everything required for safe AI code execution. The term "sloplet" is deliberate—it refers to AI slop (output from large language models) running on a Droplet (DigitalOcean's term for a basic VM).

### Implementation

A typical DIY sloplet stack consists of:

1. **Base infrastructure:** A $6–15 per month DigitalOcean Droplet (or equivalent AWS EC2 instance) running a Linux distribution.
2. **Containerization:** Docker installed on the Droplet.
3. **Execution model:** For each agent task requiring code execution, spawn an ephemeral Docker container using the pattern: `docker run --rm --network=none --memory=512m --cpus=0.5 <image>`.
4. **Lifecycle:** Each container is destroyed immediately after the task completes.
5. **Persistent layer:** Agent state (workspace files, configuration, logs) resides on the Droplet's filesystem, shared across containers via volumes.

OpenClaw implements this exact pattern. The gateway daemon spawns sibling Docker containers by mounting the host's Docker socket (`/var/run/docker.sock`), a technique known as Docker-outside-of-Docker (DooD). This allows the agent orchestrator running inside a container to create and manage child containers for task execution.

### Security Configuration

A robust DIY sloplet enforces several security boundaries:

- **Dropped Linux capabilities:** Running containers with `capDrop: ["ALL"]` removes dangerous system capabilities.
- **Resource limits:** Strict memory and CPU constraints prevent resource exhaustion attacks.
- **Network isolation:** Containers start with no external network access unless explicitly configured.
- **Non-root execution:** Code runs under an unprivileged user account.
- **Ephemeral filesystems:** Temporary storage uses tmpfs or is destroyed post-execution.
- **GPU passthrough:** GPU access is enabled only when explicitly required for the task.

### Cost Analysis

At low task volumes, the DIY approach is substantially cheaper than managed services. A $6–10 per month Droplet can reliably host your entire agent infrastructure and spawn dozens of concurrent ephemeral containers. You are paying for persistent compute and network bandwidth, not per-execution fees. For a personal AI assistant or small team workload, this cost envelope is compelling.

## Sandbox Architectures: Strengths and Limitations

While the DIY sloplet approach with Docker is effective for many use cases, it's important to understand that different sandbox architectures have distinct trade-offs. The choice of sandbox type—containers, lightweight VMs, full VMs, or platform-managed services—depends heavily on your isolation requirements, threat model, and operational constraints.

### Why Docker Containers Alone Are Insufficient

Docker containers provide process-level isolation using Linux namespaces, cgroups, and seccomp. They are lightweight, fast to spawn, and excellent for resource-constrained environments. However, containers share the kernel with the host and sibling containers. This creates several risk vectors:

1. **Kernel exploits:** A vulnerability in the Linux kernel affects all containers on the same host. A sophisticated attacker can escape a container via a kernel bug.
2. **Shared kernel resources:** Memory limits and CPU shares can be exceeded or exploited by misbehaving processes; truly strict isolation requires additional OS-level controls.
3. **Privilege escalation paths:** Even with capabilities dropped and no `sudo` access, a container with access to the Docker socket or other privileged resources can escape and compromise the host.
4. **Noisy neighbor problems:** In high-concurrency environments, one container's resource consumption can starve other containers of CPU, memory, or I/O.

For personal use or small-scale agent deployments, these risks are often acceptable. The threat model is: "What if my agent's code has a bug or the LLM hallucinated a destructive command?" In that case, container isolation is sufficient. But if the threat model includes: "What if a malicious actor has crafted a container image specifically to break out?" then containers alone are insufficient.

This is why serious platforms like E2B use kernel-level isolation (via KVM or Firecracker microVMs), and why enterprises often mandate full virtual machine isolation for untrusted code execution.

### Lightweight VMs: The Firecracker Model

Firecracker, developed by AWS, is a lightweight hypervisor that boots minimal Linux VMs (called microVMs) in under 100 milliseconds with minimal memory overhead. Firecracker provides **true hardware-level isolation**—the hypervisor enforces boundaries that even a kernel exploit cannot breach. Each microVM has its own kernel, so a kernel vulnerability in one VM does not affect others.

E2B and sprites.dev both use Firecracker or similar hypervisors. The trade-off is modest: startup time increases from milliseconds (containers) to ~100ms (microVMs), and per-VM memory overhead is ~20-50 MB. The security win—genuine hardware-level isolation—justifies this overhead for production systems.

### Full Virtual Machines: Complete Isolation

Full VMs (running on QEMU, KVM, or hypervisors like Hyper-V) provide maximum isolation but at significant cost: boot times of several seconds and memory overhead per VM. exe.dev's persistent VMs are full VMs, as are most traditional cloud instances. Full VMs are overkill for ephemeral sandbox tasks (why boot a 2GB VM for a 100ms task?) but excellent for persistent agent environments where the overhead is amortized.

### Platform-Managed Services: DigitalOcean App Platform as a Sandbox

The DigitalOcean App Platform (a platform-as-a-service offering similar to Heroku) can technically serve as a sandbox for agent code execution, though it was not originally designed for this purpose. Here's how it could work and where its limitations lie:

**How it could be used:**

1. **Deploy a listener service:** Create a long-running service on App Platform that accepts execution requests via HTTP.
2. **Spawn child processes:** The listener spawns child processes to execute agent code, optionally in isolated Docker containers.
3. **Return results:** Results are streamed back to the caller.

**Key advantages:**

- **Managed infrastructure:** No need to manage base VMs, patches, or orchestration; DigitalOcean handles that.
- **Automatic scaling:** App Platform auto-scales based on load, reducing cold-start concerns for bursty workloads.
- **Built-in logging and monitoring:** Integrated observability without additional setup.
- **Simple deployment:** Git-based deployments via `doctl` or web UI.

**Critical limitations:**

1. **Ephemeral filesystem:** App Platform containers have read-only or ephemeral filesystems. Persistent agent state (workspace files, session logs) must be stored externally (e.g., DigitalOcean Spaces, a managed database). This adds complexity and latency compared to local disk access on a persistent VM.
2. **Billing misalignment:** App Platform charges a monthly base fee per service plus per-unit compute usage. For low-frequency agent tasks, this is expensive compared to a $6/month Droplet. For high-frequency tasks, it may be cheaper, but the pricing model is opaque.
3. **Limited customization:** You cannot install arbitrary system packages (e.g., `ffmpeg`, `graphviz`) without building a custom Docker image; base images are limited and upgrades are managed by DigitalOcean.
4. **Cold starts and function duration limits:** Some App Platform services have strict execution time limits (typically 5–30 minutes per request). Long-running agent tasks may timeout.
5. **No GPU support:** As of early 2026, App Platform does not offer GPU acceleration, making it unsuitable for agents that need to run computationally intensive tasks (code compilation, ML inference, etc.).
6. **Hidden costs:** Egress bandwidth, external storage access, and database queries all add up. A Droplet with local storage avoids these surprise costs.

**When App Platform *could* be appropriate:**

- Lightweight, stateless HTTP-based agent tasks that return results quickly.
- Tasks that do not require persistent workspace state or rapid disk I/O.
- Scenarios where you want a fully managed, zero-ops experience and cost is secondary.

**When App Platform is inappropriate:**

- Any agent that maintains workspace files, session logs, or build artifacts on disk.
- Agents that spawn many concurrent child processes (the overhead and resource constraints make this expensive).
- Agents that require GPU, specialized system tools, or fine-grained resource control.

For most personal AI assistant use cases, the DIY Droplet + Docker approach offers better cost, control, and performance than App Platform. App Platform shines for traditional microservices; it is a poor fit for sandbox-based agent execution.

## How Agents Use Sandboxes

Understanding where sandboxes fit into an agentic system clarifies their necessity:

```
┌─────────────────────────────────────────┐
│         User Makes a Request            │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│   Agent (LLM) Reasons and Plans         │
│   "I need to execute this code"         │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Agentic Platform Spawns a Sandbox      │
│  (Docker container, E2B env, etc.)      │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│     Code Executes in Isolation          │
│     (exec tool → sandboxed process)     │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Result Returned to Agent               │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Agent Continues Reasoning              │
│  or Responds to User                    │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Sandbox Destroyed                      │
│  (Container terminated, state lost)     │
└─────────────────────────────────────────┘
```

**The inference layer** (models on OpenAI, Anthropic, Groq, or locally via Ollama) generates plans and issues tool-call requests. The **agentic platform** (OpenClaw, LangGraph, CrewAI, etc.) routes these tool calls appropriately. Any tool call that involves code execution is directed to the sandbox. The sandbox executes the request in complete isolation and returns the result. The agent incorporates this result into its reasoning and proceeds.

## Why Sandboxes Are Non-Negotiable for Personal AI Assistants

When you grant an AI assistant access to real, valuable tools—your email, your repositories, your financial APIs, your file system—you are accepting genuine risk. An AI system can hallucinate. It can misinterpret context. It can generate a destructive command.

Without sandboxes, each hallucination is a potential disaster. With sandboxes, a hallucination is merely an ephemeral anomaly. The container fails. The command is never executed against your real infrastructure. You debug the issue, iterate, and try again.

The approval gate (requiring human confirmation for sensitive operations) combined with sandbox isolation (ensuring failed operations have no lasting impact) makes it possible for an AI assistant to be genuinely powerful without being genuinely dangerous. This is the foundation of trustworthy AI agency.

## Market Signals

The sandbox market is maturing rapidly. E2B has scaled to 200 million launched sandboxes. Fly.io's release of Sprites signaled the market opportunity for instant, per-second-priced VMs. Modal continues to expand its infrastructure for enterprise AI workloads. Meanwhile, serious teams building agents—from AI research labs to AI-native startups—are standardizing on sandbox-first architectures.

This convergence points to a broader pattern: every sophisticated agentic platform will eventually need a sandbox layer. OpenAI's Code Interpreter runs code in a sandbox. Anthropic's Computer Use feature operates in a sandbox. GitHub Copilot Workspace executes generated code in a sandbox. The market is converging on sandboxes as a fundamental primitive for agent execution.

## Conclusion

If your AI assistant can write or execute code—and it should be able to—it needs a sloplet. Whether you choose a commercial sandbox platform (E2B, Modal, Sprites) or build your own from a Droplet and Docker depends on your scale, budget, and tolerance for operational complexity. But the choice is not whether to use a sandbox; it is which sandbox architecture best serves your needs.

The sloplet concept celebrates the simplicity and cost-effectiveness of the DIY approach while acknowledging the maturity and convenience of commercial alternatives. In either case, the isolation layer is non-negotiable. Your AI deserves a disaster zone where it can safely explore its capabilities.
