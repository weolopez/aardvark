# 03 - KV Worker

IndexedDB-based Key-Value database using a **hybrid JavaScript/Rust architecture**.

## What This Project Teaches

- **Hybrid Architecture**: When to use JS vs Rust
- **IndexedDB**: Browser-based persistent storage
- **Data Validation**: Rust for validation and transformation
- **Search**: Rust-powered search across all entries
- **Request/Response IDs**: Handling concurrent operations

## The Hybrid Pattern

This is the **key learning** of this project:

```
┌─────────────────────────────────────────────────────────┐
│                    Web Worker                           │
│                                                         │
│  ┌─────────────────┐     ┌─────────────────────────┐   │
│  │   JavaScript    │     │      Rust/WASM          │   │
│  │                 │     │                         │   │
│  │  • IndexedDB    │────▶│  • validate_key()       │   │
│  │  • Transactions │     │  • validate_value()     │   │
│  │  • Cursors      │◀────│  • search_values()      │   │
│  │  • Callbacks    │     │  • transform_value()    │   │
│  └─────────────────┘     └─────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Why hybrid?**
- IndexedDB has a callback-based API that's awkward in Rust
- Rust excels at data processing, validation, and search
- Use the right tool for each job!

## Project Structure

```
03-kv-worker/
├── Cargo.toml       # Rust dependencies
├── build.sh         # Build script
├── README.md        # This file
├── src/
│   └── lib.rs       # Rust: validation, search, transformation
└── www/
    ├── index.html   # Demo UI
    ├── worker.js    # IndexedDB operations + WASM integration
    ├── KVDatabase.js # Clean client-side API
    └── pkg/         # Generated WASM (after build)
```

## Quick Start

```bash
# Build the WASM module
./build.sh

# Serve the demo
cd www && python3 -m http.server 8080

# Open http://localhost:8080
```

## API Reference

### KVDatabase Class

```javascript
import { KVDatabase } from './KVDatabase.js';

const db = new KVDatabase('my-app', 'settings');

// CRUD operations
await db.set('user', { name: 'Alice', email: 'alice@example.com' });
const user = await db.get('user');
await db.remove('user');
await db.clear();

// List keys
const keys = await db.keys();

// Search (uses Rust)
const matches = await db.find('alice');

// Subscriptions
const unsubscribe = db.subscribe((change) => {
    console.log(change.action, change.key, change.value);
});
```

## Rust Functions

| Function | Description |
|----------|-------------|
| `validate_key(key)` | Check key is valid (not empty, not too long) |
| `validate_value(json)` | Check value is valid JSON, not too large |
| `transform_value(json)` | Normalize/transform value before storing |
| `search_values(entries, query)` | Search all entries for matching text |
| `filter_by_prefix(entries, prefix)` | Filter entries by key prefix |
| `sort_entries(entries, asc)` | Sort entries by key |
| `get_stats(entries)` | Get count and size statistics |
| `merge_objects(base, patch)` | Deep merge two JSON objects |

## Worker Messages

| Type | Description |
|------|-------------|
| `get` | Get value by key |
| `set` | Set key-value pair |
| `remove` | Delete a key |
| `keys` | List all keys |
| `clear` | Clear all data |
| `find` | Search entries (Rust-powered) |
| `filterByPrefix` | Filter by key prefix |
| `getStats` | Get store statistics |
| `merge` | Partial update (merge objects) |

## Request/Response Pattern

To handle concurrent operations, each request has a unique ID:

```javascript
// Client
const id = nextId++;
pending.set(id, { resolve, reject });
worker.postMessage({ id, type: 'get', key: 'foo' });

// Worker
self.onmessage = (event) => {
    const { id, type, key } = event.data;
    const value = await getValue(key);
    self.postMessage({ id, success: true, value });
};

// Client receives response
worker.onmessage = (event) => {
    const { id, success, value } = event.data;
    const { resolve, reject } = pending.get(id);
    pending.delete(id);
    resolve(value);
};
```

## Key Code Examples

**JavaScript - IndexedDB Operations:**
```javascript
async function getValue(dbName, storeName, key) {
    const db = await openDatabase(dbName, storeName);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
```

**Rust - Search:**
```rust
#[wasm_bindgen]
pub fn search_values(entries_json: &str, search_str: &str) -> String {
    let entries: Vec<KVEntry> = serde_json::from_str(entries_json)?;
    let search_lower = search_str.to_lowercase();
    
    let matches: Vec<&KVEntry> = entries
        .iter()
        .filter(|entry| {
            entry.key.to_lowercase().contains(&search_lower) ||
            serde_json::to_string(&entry.value)
                .unwrap_or_default()
                .to_lowercase()
                .contains(&search_lower)
        })
        .collect();
    
    serde_json::to_string(&matches).unwrap()
}
```

## Why IndexedDB in JavaScript?

IndexedDB's API is heavily callback-based:

```javascript
const request = indexedDB.open('db', 1);
request.onerror = () => { /* handle error */ };
request.onsuccess = () => { /* use database */ };
request.onupgradeneeded = () => { /* create stores */ };
```

This pattern is natural in JavaScript but awkward in Rust, where you'd need to:
- Use `wasm-bindgen` closures that get complex
- Handle the callback-to-Promise conversion
- Deal with IDB's transaction model

By keeping IndexedDB in JavaScript and validation/search in Rust, we get the best of both worlds!

## Coding Agent Goal Alignment

This project establishes the **persistent storage layer** required for session management, settings, and cached data — equivalent to the TypeScript agent's filesystem-based storage.

| Coding Agent Requirement | How This Project Addresses It |
|--------------------------|-------------------------------|
| Session persistence | KV store can persist session tree entries (used by [07-session-tree](../07-session-tree/)) |
| Settings storage | Key-value pairs for model selection, thinking level, API keys |
| Search across stored data | Rust-powered `search_values()` for finding sessions, tasks, files |
| Concurrent operations | Request/response ID pattern handles parallel reads/writes safely |
| Subscription/events | `subscribe()` pattern mirrors [`Agent.subscribe()`](../agent/README.md:24) |

### Mapping to TypeScript Agent

| TypeScript Agent | Rust/WASM Equivalent |
|------------------|---------------------|
| `~/.pi/agent/sessions/` JSONL files | IndexedDB `KVDatabase` stores |
| [`appendFileSync()`](../coding-agent/core/session-manager.ts:6) for session writes | `db.set(key, value)` |
| [`readFileSync()`](../coding-agent/core/session-manager.ts:12) for session reads | `db.get(key)` |
| [`readdirSync()`](../coding-agent/core/session-manager.ts:11) for session listing | `db.keys()` / `db.find()` |
| `settings-manager.ts` key-value settings | Direct KV storage equivalent |

### The Hybrid Pattern is Key

The hybrid JS/Rust architecture established here is reused by [04-github-worker](../04-github-worker/) and [05-task-worker](../05-task-worker/). It recognizes that browser APIs like IndexedDB are best accessed from JavaScript, while data processing, validation, and search run faster and safer in Rust.

**Status: ✅ Complete** — Persistent storage with subscription support is operational.

## Next Steps

Continue to **04-github-worker** to build a GitHub file explorer using the same hybrid pattern with Octokit.
