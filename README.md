# Coding Agent in Rust/WASM — Browser Web Worker Implementation

Reimplementing a [TypeScript coding agent](coding-agent/README.md) (pi-coding-agent) in **Rust**, compiled to **WebAssembly**, and deployed as **Web Workers** in the browser.

The original agent runs as a Node.js CLI with local filesystem access, shell execution, and direct LLM API calls. This project rebuilds it as a browser-native application where the agent runs in a Web Worker, operates on a virtual filesystem backed by GitHub, and persists state in IndexedDB.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Main Thread                       │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │  Chat UI  │  │  Tree    │  │  Task    │  │  Terminal/File   │ │
│  │           │  │  Viewer  │  │  Board   │  │  Explorer        │ │
│  └─────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬──────────┘ │
│        │              │              │                │            │
│        └──────────────┴──────────────┴────────────────┘            │
│                               │                                    │
│                        postMessage                                 │
│                               │                                    │
├───────────────────────────────┼────────────────────────────────────┤
│                        Web Worker Thread                           │
│                               │                                    │
│  ┌────────────────────────────┴─────────────────────────────────┐ │
│  │                    Agent Core - Rust/WASM                     │ │
│  │                                                               │ │
│  │  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌─────────────┐  │ │
│  │  │ LLM API │  │ Session  │  │  Virtual  │  │    Task     │  │ │
│  │  │ Client  │  │ Tree     │  │  Shell/FS │  │  Manager    │  │ │
│  │  │ 02 + 06 │  │   07     │  │    08     │  │    05       │  │ │
│  │  └─────────┘  └──────────┘  └───────────┘  └─────────────┘  │ │
│  │                                                               │ │
│  │  ┌─────────────────┐  ┌──────────────────────────────────┐   │ │
│  │  │  KV Storage     │  │  GitHub FS                       │   │ │
│  │  │  03 - IndexedDB │  │  04 - Octokit                    │   │ │
│  │  └─────────────────┘  └──────────────────────────────────┘   │ │
│  └───────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

## Building Blocks — Status

Each numbered project proves a specific capability required by the full agent. Together they cover the core architecture.

| # | Project | Purpose | Status |
|---|---------|---------|--------|
| [01](01-hello-worker/) | **Hello Worker** | Rust/WASM + Web Worker foundation | ✅ Complete |
| [02](02-gemini-worker/) | **Gemini Worker** | LLM API calls from WASM | ✅ Complete |
| [03](03-kv-worker/) | **KV Worker** | IndexedDB persistent storage | ✅ Complete |
| [04](04-github-worker/) | **GitHub Worker** | GitHub file CRUD operations | ✅ Complete |
| [05](05-task-worker/) | **Task Worker** | Task management with dependencies | ✅ Complete |
| [06](06-agent/) | **Agent** | ReAct loop with tool execution | ✅ Core Complete |
| [07](07-session-tree/) | **Session Tree** | Branching conversation history | ✅ Core Complete |
| [08](08-virtual-shell/) | **Virtual Shell** | In-memory filesystem + shell | ✅ Core Complete |
| [09](09-integrated-agent/) | **Integrated Agent** | Full coding agent combining all blocks | ✅ Built — Ready to test |

## Feature Mapping: TypeScript Agent → Rust/WASM Building Blocks

### Agent Core

| TypeScript Feature | Source | WASM Building Block | Status |
|-------------------|--------|-------------------|--------|
| Agent loop with event streaming | [`agent-loop.ts`](agent/agent-loop.ts) | [06-agent](06-agent/) `Agent::chat()` + `run_step()` | ✅ Basic loop works |
| Tool registration and execution | [`AgentTool`](agent/types.ts:157) | [06-agent](06-agent/) `set_tools()` + JS execution | ✅ Working |
| Conversation history | [`AgentState.messages`](agent/types.ts:139) | [06-agent](06-agent/) `Agent.history` | ✅ Working |
| Event stream | [`AgentEvent`](agent/types.ts:179) | [06-agent](06-agent/) step-based `postMessage` | ⚠️ Partial — not granular events |
| Streaming LLM responses | [`streamSimple()`](agent/agent-loop.ts:10) | [02-gemini-worker](02-gemini-worker/) | ❌ Non-streaming only |
| Multi-provider support | 15+ providers in TS | [02-gemini-worker](02-gemini-worker/) | ❌ Gemini only |
| Abort/cancel | `AbortSignal` | — | ❌ Not implemented |
| Steering messages | [`getSteeringMessages()`](agent/types.ts:86) | — | ❌ Not implemented |
| Follow-up messages | [`getFollowUpMessages()`](agent/types.ts:97) | — | ❌ Not implemented |
| Context transformation | [`transformContext()`](agent/types.ts:67) | — | ❌ Not implemented |

### Tools

| TypeScript Tool | Source | WASM Equivalent | Status |
|----------------|--------|----------------|--------|
| `read` — Read file | [`read.ts`](coding-agent/core/tools/read.ts) | [08-virtual-shell](08-virtual-shell/) `cat` / `read_file()` | ✅ Working |
| `write` — Write file | [`write.ts`](coding-agent/core/tools/write.ts) | [08-virtual-shell](08-virtual-shell/) `echo >` / `write_file()` | ✅ Working |
| `bash` — Shell commands | [`bash.ts`](coding-agent/core/tools/bash.ts) | [08-virtual-shell](08-virtual-shell/) `execute(cmd)` | ⚠️ Basic commands only |
| `edit` — Surgical edit | [`edit.ts`](coding-agent/core/tools/edit.ts) | — | ❌ Not implemented |
| `ls` — List directory | [`ls.ts`](coding-agent/core/tools/ls.ts) | [08-virtual-shell](08-virtual-shell/) `ls` command | ✅ Working |
| `grep` — Search contents | [`grep.ts`](coding-agent/core/tools/grep.ts) | — | ❌ Not implemented |
| `find` — Find files | [`find.ts`](coding-agent/core/tools/find.ts) | — | ❌ Not implemented |
| Truncation | [`truncate.ts`](coding-agent/core/tools/truncate.ts) | — | ❌ Not implemented |

### Session Management

| TypeScript Feature | Source | WASM Equivalent | Status |
|-------------------|--------|----------------|--------|
| Tree-structured sessions | [`session-manager.ts`](coding-agent/core/session-manager.ts) | [07-session-tree](07-session-tree/) `SessionTree` | ✅ Working |
| Branching | `/tree` command | [07-session-tree](07-session-tree/) `branch(entry_id)` | ✅ Working |
| History reconstruction | `buildSessionContext()` | [07-session-tree](07-session-tree/) `get_history()` | ✅ Working |
| Persistence to JSONL | `appendFileSync()` | — | ❌ Needs IndexedDB via [03-kv-worker](03-kv-worker/) |
| Compaction | [`compaction.ts`](coding-agent/core/compaction/compaction.ts) | — | ❌ Not implemented |
| Branch summary | `BranchSummaryEntry` | — | ❌ Not implemented |
| Multi-session management | Session listing/search | — | ❌ Not implemented |
| Model/thinking changes | `ModelChangeEntry` | — | ❌ Not implemented |

### Infrastructure

| TypeScript Feature | Source | WASM Equivalent | Status |
|-------------------|--------|----------------|--------|
| Non-blocking execution | Node.js async | [01-hello-worker](01-hello-worker/) Web Workers | ✅ Working |
| HTTP from WASM | — | [02-gemini-worker](02-gemini-worker/) `web-sys` fetch | ✅ Working |
| Persistent storage | Filesystem | [03-kv-worker](03-kv-worker/) IndexedDB | ✅ Working |
| Remote file access | Local FS | [04-github-worker](04-github-worker/) GitHub API | ✅ Working |
| Task orchestration | Not in TS agent | [05-task-worker](05-task-worker/) | ✅ Working (new capability) |
| System prompt | [`system-prompt.ts`](coding-agent/core/system-prompt.ts) | — | ❌ Not implemented as module |

## What's Left to Do

### Phase 1: Critical Path to Working Agent

These items are required to have a functional coding agent in the browser:

- [ ] **Edit tool in virtual shell** — Implement surgical find-and-replace editing in [08-virtual-shell](08-virtual-shell/). This is the most-used tool in the coding agent.
- [ ] **Streaming LLM responses** — Switch from `generateContent` to `streamGenerateContent` in [06-agent](06-agent/) for real-time token output.
- [ ] **Session persistence** — Connect [07-session-tree](07-session-tree/) to [03-kv-worker](03-kv-worker/) IndexedDB for sessions that survive page reloads.
- [ ] **Integrated agent project** — Create `09-integrated-agent/` that combines 06 + 07 + 08 into a single working agent with tools registered.
- [ ] **System prompt module** — Port [`system-prompt.ts`](coding-agent/core/system-prompt.ts) to Rust for proper prompt construction with tool descriptions.

### Phase 2: Feature Parity

These items bring the browser agent closer to the TypeScript agent's full capabilities:

- [ ] **Grep tool** — Content search across virtual filesystem files with regex support.
- [ ] **Find tool** — Glob-based file discovery in the virtual filesystem.
- [ ] **Event streaming** — Replace step-based responses with granular `AgentEvent` stream matching [`AgentEvent`](agent/types.ts:179).
- [ ] **Abort/cancel support** — Wire up cancellation through the Web Worker message protocol.
- [ ] **Context management** — Implement `transformContext()` for token-aware context pruning.
- [ ] **Compaction** — Summarize old context to stay within token limits, matching [`compaction.ts`](coding-agent/core/compaction/compaction.ts).
- [ ] **Multi-provider LLM** — Abstract LLM calls behind a provider trait; add Anthropic and OpenAI.
- [ ] **GitHub write-back** — Push modified virtual files back to GitHub via [04-github-worker](04-github-worker/).

### Phase 3: Polish and Extensions

- [ ] **Unified chat UI** — Single-page application combining chat, tree visualization, file explorer, and terminal.
- [ ] **Steering and follow-up messages** — Mid-turn interruption and queued message support.
- [ ] **Multi-session management** — List, search, resume, fork sessions.
- [ ] **File truncation** — Handle large files with line/byte limits.
- [ ] **Skills and prompt templates** — Port the extensibility system.
- [ ] **Token counting** — Track and display token usage for cost awareness.
- [ ] **Pipe and redirect operators** — Extended shell syntax (`|`, `>>`, `&&`).

## Building

Each project has its own `build.sh` or can be built with:

```bash
cd <project-dir>
wasm-pack build --target web --out-dir www/pkg  # or web/pkg for 07/08
```

Serve any project's web directory:

```bash
cd <project-dir>/www  # or web/
python3 -m http.server 8080
```

## Reference Architecture

The TypeScript agent this project reimplements:

- **[`agent/`](agent/)** — Core agent loop, types, event streaming (`@mariozechner/pi-agent-core`)
- **[`coding-agent/`](coding-agent/)** — Full coding agent with tools, sessions, UI, and extensions (`@mariozechner/pi-coding-agent`)
