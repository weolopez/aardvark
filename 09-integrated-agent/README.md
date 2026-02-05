# 09 - Integrated Coding Agent

A fully integrated **browser-based coding agent** built in Rust/WASM. This project combines all building blocks (02-08) into a single working agent that loads GitHub repositories into a virtual filesystem, accepts natural language prompts, calls the Gemini LLM, and executes tools (read, write, edit, bash, grep, find) — all running in a Web Worker.

## Features

- **6 coding tools**: `read`, `write`, `edit` (with fuzzy matching), `bash`, `grep`, `find`
- **Virtual filesystem**: In-memory file tree loaded from GitHub repositories
- **ReAct agent loop**: LLM → tool calls → tool results → LLM (up to 25 rounds)
- **Session tree**: Branching conversation history with persistence
- **System prompt**: Auto-generated from available tools and working directory
- **File explorer**: Live view of the virtual filesystem state
- **Chat UI**: Message display with tool call/result visualization

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Main Thread (Browser)                       │
│  ┌──────────────┐  ┌────────────┐  ┌───────────────────────┐ │
│  │   Chat UI     │  │ File Tree  │  │  AgentClient.js       │ │
│  └──────┬────────┘  └─────┬──────┘  └──────────┬────────────┘ │
│         └─────────────────┼─────────────────────┘              │
│                           │ postMessage                        │
├───────────────────────────┼────────────────────────────────────┤
│                    Web Worker                                  │
│                           │                                    │
│  ┌────────────────────────┴──────────────────────────────────┐ │
│  │              CodingAgent (Rust/WASM)                       │ │
│  │  ┌──────────┐ ┌─────────┐ ┌────────┐ ┌───────────────┐   │ │
│  │  │ LLM API  │ │ Session │ │ Shell  │ │ Tool Registry │   │ │
│  │  │ (Gemini) │ │ Tree    │ │ + VFS  │ │ read/write/   │   │ │
│  │  │          │ │         │ │        │ │ edit/bash/    │   │ │
│  │  │          │ │         │ │        │ │ grep/find     │   │ │
│  │  └──────────┘ └─────────┘ └────────┘ └───────────────┘   │ │
│  └───────────────────────────────────────────────────────────┘ │
│                           │                                    │
│  ┌────────────────────────┴──────────────────────────────────┐ │
│  │            JavaScript Bridge                               │ │
│  │  GitHub API (Octokit)  │  Session Persistence (localStorage)│ │
│  └───────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Build the WASM module
cd 09-integrated-agent
./build.sh

# Serve the web app
cd web && python3 -m http.server 8080

# Open http://localhost:8080
```

1. Enter your [Gemini API key](https://aistudio.google.com/app/apikey)
2. Optionally enter a GitHub repo (e.g., `weolopez/aardvark`)
3. Click **Connect Agent**
4. Chat with the agent — ask it to read files, make edits, search code, etc.

## Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `read` | Read file with line numbers, offset/limit | `path`, `offset?`, `limit?` |
| `write` | Create/overwrite file, auto-create dirs | `path`, `content` |
| `edit` | Surgical find-and-replace with fuzzy matching | `path`, `old_text`, `new_text` |
| `bash` | Execute shell commands (ls, cd, cat, etc.) | `command` |
| `grep` | Search file contents with regex | `pattern`, `path?`, `ignore_case?`, `limit?` |
| `find` | Find files by glob pattern | `pattern`, `path?`, `limit?` |

## Project Structure

```
09-integrated-agent/
├── Cargo.toml
├── build.sh
├── README.md
├── src/
│   ├── lib.rs              # WASM entry point
│   ├── agent.rs            # CodingAgent: main loop + WASM API
│   ├── llm.rs              # Gemini API client
│   ├── session.rs          # Session tree with branching
│   ├── models.rs           # All shared types
│   ├── shell.rs            # Virtual shell (ls, cd, cat, etc.)
│   ├── fs.rs               # Virtual filesystem (tree-based)
│   ├── prompt.rs           # System prompt builder
│   ├── truncate.rs         # Output truncation utilities
│   └── tools/
│       ├── mod.rs          # Tool registry and dispatch
│       ├── read.rs         # read tool
│       ├── write.rs        # write tool
│       ├── edit.rs         # edit tool (with fuzzy matching)
│       ├── bash.rs         # bash tool (virtual shell)
│       ├── grep.rs         # grep tool (regex search)
│       └── find.rs         # find tool (glob matching)
└── web/
    ├── index.html          # App shell
    ├── index.js            # UI controller
    ├── agent-client.js     # Promise-based worker API
    ├── worker.js           # Web Worker + GitHub loader
    └── style.css           # Dark theme
```

## Building Blocks Used

| Block | What It Contributes |
|-------|-------------------|
| [01-hello-worker](../01-hello-worker/) | WASM + Web Worker foundation |
| [02-gemini-worker](../02-gemini-worker/) | LLM API calling pattern |
| [03-kv-worker](../03-kv-worker/) | IndexedDB persistence pattern |
| [04-github-worker](../04-github-worker/) | GitHub repo loading |
| [05-task-worker](../05-task-worker/) | Task management (future integration) |
| [06-agent](../06-agent/) | Agent loop + tool execution pattern |
| [07-session-tree](../07-session-tree/) | Session tree with branching |
| [08-virtual-shell](../08-virtual-shell/) | Virtual filesystem + shell |

## Key Design Decisions

1. **Tools execute inside WASM** — No postMessage round-trip per tool call. The agent loop runs entirely in the worker.
2. **Single Rust crate** — All modules in one crate for simple builds and no inter-crate WASM issues.
3. **Fuzzy edit matching** — The edit tool normalizes trailing whitespace, smart quotes, and Unicode dashes before matching, just like the TypeScript original.
4. **System prompt auto-generation** — Prompt updates automatically when tools or working directory change.
5. **Non-streaming LLM** — Uses `generateContent` (not streaming) for Phase 1 simplicity.
