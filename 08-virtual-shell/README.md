# 08 - Virtual Shell: In-Memory Filesystem and Shell

A Rust/WASM **virtual filesystem and shell** that provides file operations inside the browser — replacing the coding agent's local filesystem access with an in-memory tree that can sync with GitHub.

## What This Project Teaches

- **Virtual Filesystem in Rust**: Tree-structured `FileNode` enum (File | Directory)
- **Shell Command Parsing**: Rust-based command interpreter for `ls`, `cd`, `cat`, `echo`, etc.
- **File Status Tracking**: Synced/Modified/New/Deleted states for GitHub sync
- **GitHub Integration**: Loading repository trees into the virtual filesystem
- **Structured Output**: `ShellResult { stdout, stderr, fs_changed }` for clean tool integration

## Project Structure

```
08-virtual-shell/
├── Cargo.toml           # Rust dependencies
├── src/
│   ├── lib.rs           # Module exports
│   ├── models.rs        # VirtualFile, FileStatus, ShellResult
│   ├── fs.rs            # VirtualFileSystem: tree-based file storage
│   └── shell.rs         # Shell: command parsing and execution
└── web/
    ├── index.html        # Terminal UI
    ├── index.js          # Terminal emulator interface
    ├── worker.js         # Web Worker: Shell + GitHub repo loading
    └── style.css         # Terminal styling
```

## Architecture

```
┌──────────────────────────────────────────────┐
│                Shell (Rust/WASM)               │
│                                                │
│  execute(cmd_line) → ShellResult JSON          │
│  ├── pwd                                       │
│  ├── ls [path]                                 │
│  ├── cd [path]                                 │
│  ├── mkdir <path>                              │
│  ├── touch <path>                              │
│  ├── echo [text] [> file]                      │
│  ├── cat <path>                                │
│  └── rm <path>                                 │
│                                                │
│  VirtualFileSystem                             │
│  ├── root: FileNode::Directory                 │
│  │   ├── home/                                 │
│  │   │   └── user/  ◄── default cwd           │
│  │   └── ... (loaded from GitHub)              │
│  ├── write_file(path, content)                 │
│  ├── read_file(path) → content                 │
│  ├── list_dir(path) → entries                  │
│  ├── mkdir(path)                               │
│  ├── delete(path)                              │
│  └── load_files(files_json) ◄── GitHub import  │
└──────────────────────────────────────────────┘

Worker Integration:
┌─────────────┐    postMessage     ┌──────────────┐
│  Main Thread │ ◄──────────────► │  Web Worker   │
│  (Terminal)  │   EXEC/OUTPUT     │  Shell +      │
│              │                   │  GitHub API   │
└─────────────┘                   └──────────────┘
```

## Quick Start

```bash
# Build the WASM module
cd 08-virtual-shell && wasm-pack build --target web --out-dir web/pkg

# Serve the demo
cd web && python3 -m http.server 8080

# Open http://localhost:8080
```

## API Reference

### Shell Commands

| Command | Description | Example |
|---------|-------------|---------|
| `pwd` | Print working directory | `pwd` → `/home/user` |
| `ls [path]` | List directory contents | `ls /home` → `user` |
| `cd [path]` | Change directory | `cd /home/user` |
| `mkdir <path>` | Create directory | `mkdir projects` |
| `touch <path>` | Create empty file | `touch hello.txt` |
| `echo text > file` | Write text to file | `echo hello > hi.txt` |
| `cat <path>` | Read file contents | `cat hi.txt` → `hello` |
| `rm <path>` | Delete file or directory | `rm hi.txt` |

### Rust API

| Method | Description |
|--------|-------------|
| `Shell::new()` | Create shell with default `/home/user` cwd |
| `shell.execute(cmd)` | Parse and run command, returns `ShellResult` JSON |
| `shell.get_pwd()` | Get current working directory |
| `shell.get_fs_json()` | Serialize entire filesystem tree |
| `shell.load_files(json)` | Import files from GitHub API response |

### ShellResult Format

```json
{ "stdout": "file contents here", "stderr": null, "fs_changed": false }
```

```json
{ "stdout": "", "stderr": "cat: Path not found: missing.txt", "fs_changed": false }
```

### File Status Tracking

| Status | Meaning |
|--------|---------|
| `Synced` | Matches GitHub upstream (loaded via `load_files`) |
| `Modified` | Changed locally after being synced |
| `New` | Created locally, not in GitHub |
| `Deleted` | Marked for deletion |

## Coding Agent Goal Alignment

This project replaces the coding agent's **local filesystem and bash tool** with a browser-compatible virtual equivalent. It is the WASM counterpart to the agent's four core tools: [`read`](../coding-agent/core/tools/read.ts), [`write`](../coding-agent/core/tools/write.ts), [`edit`](../coding-agent/core/tools/edit.ts), and [`bash`](../coding-agent/core/tools/bash.ts).

| Coding Agent Requirement | How This Project Addresses It |
|--------------------------|-------------------------------|
| File read operations | `cat` command / `read_file()` matches the [`readTool`](../coding-agent/core/tools/read.ts) |
| File write operations | `echo > file` / `write_file()` matches the [`writeTool`](../coding-agent/core/tools/write.ts) |
| Directory listing | `ls` command matches the [`lsTool`](../coding-agent/core/tools/ls.ts) |
| Shell command execution | `execute(cmd)` matches the [`bashTool`](../coding-agent/core/tools/bash.ts) |
| File creation | `touch`/`mkdir` for creating files and directories |
| Working directory | `cd`/`pwd` for directory navigation |
| GitHub sync | `load_files()` imports repos, `FileStatus` tracks changes |

### Mapping to TypeScript Agent Tools

| TypeScript Tool | Virtual Shell Equivalent |
|-----------------|-------------------------|
| [`readTool`](../coding-agent/core/tools/read.ts) — read file contents | `shell.execute("cat path/to/file")` or `fs.read_file()` |
| [`writeTool`](../coding-agent/core/tools/write.ts) — create/overwrite files | `shell.execute("echo content > path")` or `fs.write_file()` |
| [`editTool`](../coding-agent/core/tools/edit.ts) — surgical find/replace | ⚠️ **Not yet implemented** |
| [`bashTool`](../coding-agent/core/tools/bash.ts) — run shell commands | `shell.execute(cmd)` for supported commands |
| [`lsTool`](../coding-agent/core/tools/ls.ts) — list directory | `shell.execute("ls path")` |
| [`findTool`](../coding-agent/core/tools/find.ts) — find files by glob | ⚠️ **Not yet implemented** |
| [`grepTool`](../coding-agent/core/tools/grep.ts) — search file contents | ⚠️ **Not yet implemented** |

### What's Still Needed

- **Edit tool** — Surgical find-and-replace editing (the most important missing tool)
- **Grep command** — Content search across files (regex support)
- **Find command** — Glob-based file discovery
- **File truncation** — Large file handling with line limits (like [`truncate.ts`](../coding-agent/core/tools/truncate.ts))
- **Pipe support** — `|`, `>>`, and other shell operators
- **GitHub write-back** — Modified files can't be committed back yet (combine with [04-github-worker](../04-github-worker/))
- **Binary file support** — Currently text-only

**Status: ✅ Core Complete** — Virtual filesystem with basic shell commands and GitHub import works. Needs edit, grep, find tools for full coding agent parity.
