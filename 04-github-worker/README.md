# 04 - GitHub Worker

GitHub file operations using **Octokit** via a Web Worker, following the hybrid JavaScript/Rust architecture.

## What This Project Teaches

- **Hybrid Architecture**: Using JavaScript libraries (Octokit) with Rust/WASM
- **GitHub API Integration**: Authentication, CRUD operations, search
- **Path Normalization**: Handling URLs, API paths, relative paths (in Rust)
- **Content Encoding**: Base64 encode/decode for GitHub API (in Rust)
- **File Caching**: Local cache with modification tracking

## Architecture

```
Main Thread (GitHubFS.js)
    │
    ▼ postMessage({ id, type, payload })
Web Worker (worker.js)
    ├── JavaScript: Octokit API calls
    │   - Authentication
    │   - HTTP requests
    │
    └── Rust/WASM: Data processing
        - Path normalization
        - Base64 encoding/decoding
        - Validation
        - Search/filtering
    │
    ▼ postMessage({ id, success, data, error })
Main Thread
```

## Quick Start

```bash
./build.sh
cd www && python3 -m http.server 8080
# Open http://localhost:8080
```

## API Reference

```javascript
import { GitHubFS } from './GitHubFS.js';

const fs = new GitHubFS();
await fs.ready();

// Configuration
await fs.setConfig({ owner: 'user', repo: 'repo', auth: 'token' });

// File Operations
const file = await fs.getFile('path/to/file.js');
const dir = await fs.getDirectory('path/to/dir');
await fs.saveFile('path', 'content', 'commit message');
```

## Rust Functions

| Function | Purpose |
|----------|---------|
| `parse_config()` | Parse JSON config, apply defaults |
| `validate_config()` | Check required fields |
| `normalize_path()` | Handle URLs, API paths, relative paths |
| `encode_content()` | Base64 encode for GitHub API |
| `decode_content()` | Base64 decode from GitHub API |
| `parse_file_response()` | Convert API response to GitHubFile |
| `validate_file()` | Validate file data before save |
| `search_files()` | Search cached files by content |

## Path Normalization Examples

```
https://raw.githubusercontent.com/user/repo/main/path/file.js → path/file.js
https://github.com/user/repo/blob/main/path/file.js → path/file.js
/path/to/file.js → path/to/file.js
```

## Coding Agent Goal Alignment

This project provides **remote file access via the GitHub API** — enabling the browser-based agent to read and write files in GitHub repositories, replacing the TypeScript agent's local filesystem access.

| Coding Agent Requirement | How This Project Addresses It |
|--------------------------|-------------------------------|
| File read operations | `getFile()` reads files from GitHub, equivalent to the [`readTool`](../coding-agent/core/tools/read.ts) |
| File write operations | `saveFile()` commits files to GitHub, equivalent to the [`writeTool`](../coding-agent/core/tools/write.ts) |
| Directory listing | `getDirectory()` lists repo contents, equivalent to the [`lsTool`](../coding-agent/core/tools/ls.ts) |
| Content search | `search_files()` searches cached files, equivalent to the [`grepTool`](../coding-agent/core/tools/grep.ts) |
| Path handling | `normalize_path()` handles URL/path variants safely in Rust |

### Mapping to TypeScript Agent Tools

| TypeScript Tool | GitHub Worker Equivalent |
|-----------------|-------------------------|
| `read(path)` | `fs.getFile(path)` — reads from GitHub API |
| `write(path, content)` | `fs.saveFile(path, content, message)` — commits to GitHub |
| `ls(path)` | `fs.getDirectory(path)` — lists repo directory |
| `grep(pattern)` | `search_files()` in Rust over cached content |
| `bash(command)` | Not applicable (see [08-virtual-shell](../08-virtual-shell/)) |

### What's Still Needed

- **File content caching** — Currently fetches on demand; needs a local cache layer (combine with [03-kv-worker](../03-kv-worker/))
- **Batch operations** — No multi-file commit support yet
- **Branch management** — Only default branch; needs branch creation/switching

**Status: ✅ Complete** — GitHub file CRUD is operational with hybrid JS/Rust architecture.
