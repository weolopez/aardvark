# Phase 4: Rust/WASM Agent Core (Zero-Lib Edition)

## Executive Summary

**Goal:** Implement the high-performance, zero-dependency Rust agent core running inside a dedicated Web Worker.

**Constraints:**
1.  **Zero 3rd Party JS Libraries:** No `npm install`. Use raw `fetch`, `IndexedDB`, `Worker` APIs.
2.  **Synchronous I/O:** Rust calls JS host functions synchronously for OPFS file operations.
3.  **Unified Worker:** Rust (Brain) and JS Tools (Hands) coexist in the same worker thread.

**Duration:** 2 Weeks
**Dependencies:** Phase 3 (Tool System concepts - logic moves to Rust/JS Host)

---

## 4.1 Web Worker Infrastructure (The "Shell")

**Objective:** Create the vanilla JS environment that hosts the WASM module and provides the "OS" services.

### Tasks

1.  **`worker.js` Scaffolding**
    *   Initialize `wasm_bindgen` (using the standard generated JS snippet).
    *   Set up `onmessage` handler to receive events from Main Thread (`UI`).
    *   Initialize OPFS Root Handle (`navigator.storage.getDirectory()`).

2.  **Sync I/O Host Functions**
    *   Implement `hostReadFile(path)`:
        *   Open file handle -> `createSyncAccessHandle()` -> `read` buffer -> `TextDecoder` -> return string.
    *   Implement `hostWriteFile(path, content)`:
        *   Open file handle -> `createSyncAccessHandle()` -> `truncate(0)` -> `write` buffer -> `flush` -> close.
    *   Implement `hostListDir(path)`:
        *   Iterate `dirHandle.entries()` -> return JSON string of paths.

3.  **Network Host Functions**
    *   Implement `hostFetch(url, options)`:
        *   Wrapper around `fetch()` that returns a Promise for Rust `wasm-bindgen-futures` to await.

**Deliverables:**
*   `worker.js` capable of synchronous file read/write in OPFS.
*   `index.html` that spawns the worker and sends a "Hello" test message.

## 4.2 Rust Core Setup

**Objective:** Initialize the Rust crate with necessary bindgen configuration for the "Host Layer".

### Tasks

1.  **Crate Config**
    *   `Cargo.toml`: Add `wasm-bindgen`, `js-sys`, `web-sys` (features: `console`).
    *   **NO** heavy async runtimes (tokio). Use `wasm-bindgen-futures`.

2.  **Extern Definitions**
    *   Define the import block for the JS host functions:
        ```rust
        #[wasm_bindgen]
        extern "C" {
            #[wasm_bindgen(js_name = "hostReadFile")]
            fn host_read_file(path: &str) -> String;
            // ...
        }
        ```

3.  **Bootstrap**
    *   `lib.rs`: Expose `init_agent(api_key: String)` to JS.

**Deliverables:**
*   Compilable Rust project that calls `host_read_file` and logs the result to console.

## 4.3 GitHub Loader (Zero-Lib)

**Objective:** Implement the shallow load strategy using raw REST API calls.

### Tasks

1.  **Tree Fetcher (Rust)**
    *   Function `load_repo(owner, repo)`:
        *   Call `hostFetch("https://api.github.com/repos/.../git/trees/main?recursive=1")`.
        *   Parse JSON response (using `serde_json`).

2.  **Blob Fetcher & Writer (Rust Loop)**
    *   Iterate over file list.
    *   Batch requests (e.g., 5 parallel fetches).
    *   Call `hostFetchBlob(sha)`.
    *   Decode Base64 (using a minimal Rust crate or JS helper).
    *   Call `hostWriteFile(path, content)`.

**Deliverables:**
*   Ability to load a small repo (e.g., `weolopez/aardvark`) into OPFS purely from the Worker.

## 4.4 The Agent Brain (Sync Logic)

**Objective:** Implement the Session Tree and Tool Execution loop.

### Tasks

1.  **Session Tree (Rust)**
    *   Struct `SessionNode` { `id`, `role`, `content`, `parent_id` }.
    *   Methods: `append_user_message`, `append_model_message`.

2.  **LLM Client (Rust)**
    *   Construct JSON body for Gemini API.
    *   Call `hostFetch("https://generativelanguage.googleapis.com/...")`.
    *   Parse response for `functionCall`.

3.  **Tool Execution Loop (The "Sync" Magic)**
    *   If LLM returns `functionCall: { name: "read_file", args: { path: "main.js" } }`:
        *   Rust calls `host_read_file("main.js")`.
        *   **IMMEDIATELY** gets string return value (no await).
        *   Rust appends `tool_result` to history.
        *   Rust calls LLM again with updated history.

**Deliverables:**
*   Full chat loop working in console logs.
*   "Read this file" -> Agent reads file -> Agent answers user.

## 4.5 Dynamic Tools (JS Sandbox)

**Objective:** Allow the Agent to write and execute scripts on the fly.

### Tasks

1.  **Host Function: `hostRunScript`**
    *   JS side:
        ```javascript
        function hostRunScript(code) {
           const f = new Function('read', 'write', code);
           // Execute and capture output
        }
        ```

2.  **Rust Wrapper**
    *   Expose `run_script` tool to LLM.
    *   Description: "Execute JavaScript code. Use read(path) and write(path, content) globals."

**Deliverables:**
*   Agent successfully executes: `const c = read('README.md'); write('COPY.md', c);`

## 4.6 IndexedDB Persistence (Raw API)

**Objective:** Save session state without `idb` library.

### Tasks

1.  **JS Helper Class**
    *   `class RawDB { open(), put(store, key, val), get(store, key) }`
    *   Wrap `IDBRequest` events in Promises for the Rust side to await (persistence is async, logic is sync).

2.  **Rust Integration**
    *   After every turn, call `host_save_session(json_blob)`.

**Deliverables:**
*   Reloading the page restores the session tree.

## Technical Stack

*   **Rust:** `wasm-bindgen`, `serde`, `serde_json` (minimal features).
*   **JS:** Vanilla ES Modules, Web Workers, OPFS `createSyncAccessHandle`.
*   **Build:** `wasm-pack build --target web`.

## File Structure

```
aardvark/
├── worker/
│   ├── worker.js           # The JS Host Layer
│   └── raw-db.js           # Zero-dependency IDB wrapper
├── agent-core/             # Rust crate
│   ├── src/
│   │   ├── lib.rs
│   │   ├── host.rs         # Extern "C" definitions
│   │   ├── github.rs       # REST API logic
│   │   └── llm.rs          # Gemini logic
│   └── Cargo.toml
└── index.html              # Minimal UI
```
