+++
date = "2026-05-21T12:00:00"
title = "opencode + qwen3-Coder-30B on Ollama on my 3090"
author = "khayyam"
draft = false
+++

I've been exploring the [opencode](https://opencode.ai) AI assistant system as part of my ongoing AI infrastructure setup. After setting it up, I wanted to document how I integrated it into my existing Docker-based environment.

## What is opencode?

[opencode](https://opencode.ai) is an open-source, self-hosted AI assistant that aims to provide a more secure and flexible alternative to cloud-based solutions. It allows for local execution of AI models while providing a rich interface for task automation and code execution.

## The Setup

### Environment

My base environment:
- **Host system**: Linux with Docker Engine 
- **Hardware**: NVIDIA GPU (GTX 1080 Ti, 11GB VRAM) and RTX 3090 (24GB VRAM)
- **Infrastructure**: Multiple Docker Compose stacks managed by a top-level compose file
- **AI ecosystem**: Ollama for local LLM inference

### Integration with existing Docker setup

I integrated opencode into my existing Docker Compose setup by adding it to the docker-compose.ai.yml file that manages AI-related services. The configuration includes:

1. **Docker Build Context**: The service is built from the `./opencode` directory
2. **Volume Mounts**:
   - Mounts config.json for opencode configuration
   - Mounts the workspace directory (`/home/khayyam`) for file access
   - Mounts Docker socket (`/var/run/docker.sock`) for container management capabilities
   - Persists opencode data to a named volume for persistence

3. **Environment Variables**:
   - Sets server password from environment variable
   - Points OLLAMA_BASE_URL to the local gateway service
   - Inherits GitHub tokens from environment variables

4. **Network and Port Configuration**:
   - Exposes port 4096 locally
   - Depends on ollama-gateway service for LLM inference

5. **Resource Constraints**:
   - CPU and memory limits as per other services
   - Health checks for monitoring

## Key Configuration Elements

### Docker Socket Access

One of the most important aspects of opencode's setup is its need for Docker socket access to orchestrate containers. This is essential for its code execution and automation features:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

### Persistent Storage

For maintaining configuration and state information across restarts, I used a persisted volume:

```yaml
volumes:
  - opencode-data:/root/.local/share/opencode
```

## Leveraging Qwen3-Coder-30B on Ollama

My specific setup includes using the Qwen3-Coder-30B model with Ollama, running on a high-end RTX 3090 GPU. The key integration points include:

1. **Model Serving**: The Ollama service that hosts Qwen3-Coder-30B is configured to run on the 3090 GPU
2. **Resource Allocation**: The model service is allocated sufficient GPU memory and CPU resources
3. **Integration with opencode**: opencode uses the same OLLAMA_BASE_URL to access the Qwen3-Coder-30B model

This allows opencode to leverage the powerful code generation capabilities of Qwen3-Coder-30B for tasks requiring sophisticated code understanding and generation.

## Why This Setup Works

The integration works well with my existing infrastructure because:
- It leverages the same Ollama services I was already using via the ollama-gateway
- It shares the same Docker network and resource constraints
- It integrates seamlessly with my existing monitoring and backup routines
- The container-based approach allows for easy updates and version management

## Benefits

1. **Security**: All operations happen locally with no data leaving the system
2. **Customizability**: Full control over configuration and behavior
3. **Integration**: Works well with existing Docker tools
4. **Cost-effective**: No ongoing API fees beyond hardware
5. **Extensible**: Can easily add new tools and capabilities

This setup demonstrates how opencode can be integrated into an existing sophisticated Docker-based infrastructure, providing a powerful, secure AI assistant solution that leverages high-end local models for code generation tasks.