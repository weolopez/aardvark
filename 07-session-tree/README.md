# 07 - Session Tree: Branching Conversation History

A Rust/WASM implementation of a **tree-structured session manager** that enables branching conversations — the same model used by the TypeScript coding agent's session system.

## What This Project Teaches

- **Tree-structured data in Rust**: HashMap-based node storage with `parent_id` linking
- **Branching conversations**: Jump to any point in history and continue from there
- **History traversal**: Walk `leaf → root` to reconstruct the current branch
- **D3.js visualization**: Interactive tree rendering to inspect and navigate branches
- **UUID generation in WASM**: Using `uuid` crate with `js` feature for browser-compatible randomness

## Project Structure

```
07-session-tree/
├── Cargo.toml           # Rust dependencies (uuid, chrono, serde)
├── src/
│   ├── lib.rs           # WASM bindings: SessionTree struct
│   ├── models.rs        # SessionEntry, SessionHeader, MessageEntry
│   └── session.rs       # SessionManager: append, branch, get_history
└── web/
    ├── index.html        # Session explorer UI
    ├── index.js          # D3.js tree visualization + chat history
    └── style.css         # Dark theme styling
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Session Tree (Rust/WASM)             │
│                                                   │
│  entries: HashMap<String, SessionEntry>            │
│  root_id: String                                  │
│  leaf_id: String  ◄── current position pointer    │
│                                                   │
│  append_message(role, content) → new_id           │
│  branch(entry_id) → moves leaf_id                 │
│  get_history() → leaf → root traversal            │
│  get_tree() → full HashMap for visualization      │
└─────────────────────────────────────────────────┘

Tree Structure (in-memory):

    [session header: root_id]
           │
    [user: "Build a React app"]
           │
    [assistant: "What kind?"]
         ╱        ╲
  [user: "Todo"]   [user: "3D game"]     ◄── branches
        │                 │
  [assistant: ...]   [assistant: ...]
```

## Quick Start

```bash
# Build the WASM module
cd 07-session-tree && wasm-pack build --target web --out-dir web/pkg

# Serve the demo
cd web && python3 -m http.server 8080

# Open http://localhost:8080
```

## API Reference

### Rust (WASM)

| Method | Description |
|--------|-------------|
| `SessionTree::new(cwd)` | Create session with root header |
| `tree.append_message(role, content)` | Add message as child of current leaf, returns new ID |
| `tree.branch(entry_id)` | Move leaf pointer to any existing entry |
| `tree.get_history()` | Get linear history from root to current leaf |
| `tree.get_tree()` | Get full tree as Map for visualization |
| `tree.get_leaf_id()` | Current position in the tree |
| `tree.get_root_id()` | Session root node |

### Session Entry Types

```rust
enum SessionEntry {
    Header(SessionHeader),   // Root node with cwd, timestamp
    Message(MessageEntry),   // Content node with role, content, parent_id
}
```

### JavaScript Usage

```javascript
import init, { SessionTree } from './pkg/session_tree.js';

await init();
const tree = new SessionTree("/home/user/project");

// Build conversation
const m1 = tree.append_message("user", "Hello");
const m2 = tree.append_message("assistant", "Hi! How can I help?");

// Branch from m2 (alternative response)
tree.branch(m2);
const m3_alt = tree.append_message("user", "Different question");

// Get current branch history
const history = tree.get_history(); // root → m1 → m2 → m3_alt
```

## Coding Agent Goal Alignment

This project implements the **session management system** — directly equivalent to [`session-manager.ts`](../coding-agent/core/session-manager.ts), which is one of the largest and most complex files in the TypeScript coding agent (1400+ lines).

| Coding Agent Requirement | How This Project Addresses It |
|--------------------------|-------------------------------|
| Tree-structured sessions | `HashMap<String, SessionEntry>` with `parent_id` links matches JSONL tree format |
| Branching (`/tree` command) | `branch(entry_id)` moves the leaf pointer, equivalent to the TS `/tree` command |
| Linear history reconstruction | `get_history()` traverses leaf→root, matching `buildSessionContext()` |
| Session header with metadata | `SessionHeader { id, timestamp, cwd }` matches [`SessionHeader`](../coding-agent/core/session-manager.ts:29) |
| Message entries | `MessageEntry { id, parent_id, role, content }` matches [`SessionMessageEntry`](../coding-agent/core/session-manager.ts:49) |

### Mapping to TypeScript Agent

| TypeScript Session Manager | Rust Session Tree Equivalent |
|---------------------------|------------------------------|
| [`SessionHeader`](../coding-agent/core/session-manager.ts:29) | `SessionHeader` struct |
| [`SessionMessageEntry`](../coding-agent/core/session-manager.ts:49) | `MessageEntry` struct |
| JSONL file with `id`/`parentId` fields | `HashMap<String, SessionEntry>` |
| `buildSessionContext()` traversal | `get_history()` leaf→root walk |
| `/tree` command navigation | `branch(entry_id)` |
| `appendFileSync()` to JSONL | `append_message()` to HashMap |

### What's Still Needed

- **Persistence** — Currently in-memory only; needs IndexedDB storage via [03-kv-worker](../03-kv-worker/) pattern
- **Compaction support** — No [`CompactionEntry`](../coding-agent/core/session-manager.ts:65) equivalent for summarizing old context
- **Branch summary** — No [`BranchSummaryEntry`](../coding-agent/core/session-manager.ts:76) for capturing context when branching
- **Model/thinking level change entries** — Only `session` and `message` types; TS has `model_change`, `thinking_level_change`
- **Session listing and search** — No multi-session management; single session only
- **Fork to new session** — `parent_session` field exists but isn't fully implemented

**Status: ✅ Core Complete** — Tree structure with branching and history traversal works. Needs persistence and advanced entry types.
