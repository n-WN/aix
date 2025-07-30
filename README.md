# aix-cli

<div align="center">

[![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![AI](https://img.shields.io/badge/AI-SDK-%232671e5?style=for-the-badge&logoColor=white)](https://sdk.vercel.ai/docs)
[![CLI](https://img.shields.io/badge/CLI-Tool-%2323b9c2?style=for-the-badge&logoColor=white)](https://github.com/vercel/ai)

[![OpenRouter](https://img.shields.io/badge/OpenRouter-AI-5c7cfa?style=flat-square)](https://openrouter.ai)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-AI-%234f46e5?style=flat-square)](https://deepseek.com)
[![Groq](https://img.shields.io/badge/Groq-AI-%23f97316?style=flat-square)](https://groq.com)
[![MoonShot](https://img.shields.io/badge/MoonShot-Kimi-%236b46c1?style=flat-square)](https://moonshot.cn)
[![Mistral](https://img.shields.io/badge/Mistral-AI-%23fbbf24?style=flat-square)](https://mistral.ai)

</div>

> **AI Programming Challenge**: This CLI tool was built as part of an AI programming interview, demonstrating real-world AI integration patterns and CLI development practices. Inspired by [rauchg's post](https://x.com/rauchg/status/1949680770274246978) showcasing elegant AI-powered terminal experiences.
>
> **AI CLI Tool**: Convert natural language to shell commands with AI-powered assistance. Built with Bun and TypeScript for maximum performance.

## Installation

```bash
# Install globally via bun
bun add -g aix-cli

# Or via npm
npm install -g aix-cli
```

## Features

- **Multi-Provider Support**: Seamlessly switch between OpenRouter, DeepSeek, Groq, Mistral, and Kimi (Moonshot)
- **Real-time Streaming**: Live text streaming with terminal animations
- **Safety First**: Built-in dangerous command detection for the `exec` feature
- **Modern Terminal UI**: Clean output formatting
- **File Context Support**: Ask questions about files with intelligent context injection
- **Natural Language to Shell**: Convert plain English to executable commands
- **System-aware**: Automatically detects OS and provides context-aware commands

## Quick Start

```bash
# Install globally
bun add -g aix-cli

# Set your API keys
export MOONSHOT_API_KEY="your-moonshot-key"
export OPENROUTER_API_KEY="your-openrouter-key"
export DEEPSEEK_API_KEY="your-deepseek-key"
export GROQ_API_KEY="your-groq-key"
export MISTRAL_API_KEY="your-mistral-key"

# Start using
aix chat "Hello, how can I help you today?"
aix models
aix ask package.json "What dependencies does this project use?"
aix exec "find all typescript files modified today"
```

## Commands

### `chat [message]`
Chat with any AI model with optional streaming and temperature control.

```bash
aix chat "Explain quantum computing" -m deepseek/deepseek-reasoner -t 0.8 -s
```

### `ask [file] [question]`
Ask questions about files with intelligent context injection.

```bash
aix ask package.json "What dependencies does this project use?"
```

### `stream [prompt]`
Stream responses in real-time with terminal animations.

```bash
aix stream "Write a short story about AI"
```

### `exec [natural-language]`
Convert natural language to shell commands with safety checks and system-aware context.

```bash
aix exec "create a backup of all js files in src"
aix exec "find large files on macOS"
aix exec "show system information"
```

### `models`
List all available models across different providers.

## Architecture

Built with **Bun** and **TypeScript** for maximum performance and type safety. The architecture showcases:

- **Modern AI SDK Integration** using Vercel's AI SDK
- **Provider Abstraction** for seamless model switching
- **Real-time Streaming** with terminal UI animations
- **Safety-First Design** with dangerous command detection
- **Clean CLI Design** using Commander.js

> **Fun Fact**: Did you know that modern TUI tools like [Claude Code](https://deepwiki.com/search/ui_f55dc92d-8b0e-4cef-943c-8eb697b3dc81) are built with React? This project demonstrates similar terminal UI patterns with Bun's built-in capabilities.

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun --hot cli.ts

# Run tests
bun test
```

## AI Integration Patterns

This project demonstrates several advanced AI integration patterns:

1. **Provider Abstraction**: Unified interface across multiple AI providers
2. **Streaming Responses**: Real-time text streaming with terminal animations
3. **Context Injection**: Intelligent file context for better responses
4. **Natural Language Processing**: Converting human language to executable commands
5. **Safety Validation**: Multi-layer safety checks for command execution

## Usage Examples

```bash
# Creative writing with different models
aix chat "Write a haiku about coding" -m anthropic/claude-sonnet-4

# Technical questions with reasoning models
aix chat "Explain async/await in JavaScript" -m deepseek/deepseek-reasoner

# File analysis
aix ask cli.ts "What safety features does this CLI implement?"

# Batch operations
aix exec "find all TypeScript files and count lines of code"

# System-specific commands
aix exec "show disk usage on macOS"
aix exec "list all installed packages on Ubuntu"
aix exec "find large files on Windows"
```

## Environment Variables

```bash
# Required: At least one of these
MOONSHOT_API_KEY="your-moonshot-key"
OPENROUTER_API_KEY="your-openrouter-key"
DEEPSEEK_API_KEY="your-deepseek-key"
GROQ_API_KEY="your-groq-key"
MISTRAL_API_KEY="your-mistral-key"

# Optional: Set default provider and model
AIX_DEFAULT_PROVIDER="moonshot"
AIX_DEFAULT_MODEL="kimi-k2-0711-preview"
```

## Contributing

This project was built as an AI programming demonstration. Contributions are welcome!

## License

MIT License - feel free to use this as a starting point for your own AI-powered CLI tools.