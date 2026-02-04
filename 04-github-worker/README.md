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
