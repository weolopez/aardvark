# Phase 4: Rust/WASM Agent Core

## Executive Summary

**Goal:** Replace the temporary JavaScript agent with a high-performance, type-safe Rust/WASM core that handles the cognitive architecture of the system: session management, LLM orchestration, and tool dispatching.

**Duration:** 2 Weeks
**Dependencies:** Phase 3 (Tool System) complete

## 4.1 Rust Project & WASM Infrastructure

**Objective:** Set up the Rust environment and compilation pipeline.

### Tasks

1.  **Initialize Crate**
    *   Create `agent-core` Rust library.
    *   Configure `Cargo.toml` with `crate-type = ["cdylib"]`.
    *   Add dependencies: `wasm-bindgen`, `serde`, `serde_json`, `js-sys`, `web-sys`.

2.  **Build Pipeline**
    *   Set up `wasm-pack` build scripts.
    *   Configure output directory `aardvark/pkg`.
    *   Create a test harness for running Rust unit tests in the browser (headless chrome/firefox via `wasm-pack test`).

3.  **Bridge Skeleton**
    *   Implement basic `greet()` function to verify WASM load.
    *   Create `Worker` wrapper in JavaScript to load the WASM module.

**Deliverables:**
*   Compilable Rust project.
*   `npm run build:wasm` script working.
*   Browser console logs "WASM Initialized".

## 4.2 Data Structures (Session Tree)

**Objective:** Implement the branching conversation history structure.

### Tasks

1.  **Node Struct**
    *   Fields: `id`, `role`, `content`, `parent_id`, `children_ids`, `tool_calls`.
    *   Serialization: `serde` implementation for JSON export.

2.  **SessionTree Struct**
    *   Fields: `nodes` (HashMap), `root_id`, `current_head_id`.
    *   Methods: `add_message`, `branch`, `get_history`, `navigate`.

3.  **Testing**
    *   Unit tests for tree traversal and branching logic.
    *   Verify history reconstruction from leaf nodes.

**Deliverables:**
*   `SessionTree` Rust module.
*   Unit tests passing.

## 4.3 Tool System Integration (The "Brain")

**Objective:** Map text LLM outputs to concrete tool executions.

### Tasks

1.  **Tool Definition Structs**
    *   Map SKILL.md metadata to Rust structs.
    *   Implement conversion to Gemini "Function Declaration" JSON format.

2.  **Tool Dispatcher**
    *   Registry: `HashMap<String, ToolDefinition>`.
    *   Scan logic: Import definitions from JavaScript side (passed via JS interop).
    *   Dispatch logic: `execute_tool(name, args)` -> calls back into JavaScript `ToolRunner`.

3.  **Parsers**
    *   Parse LLM JSON responses into `ToolCall` structs.
    *   Handle edge cases (invalid JSON, missing args).

**Deliverables:**
*   `ToolRegistry` module.
*   JSON schema generation for Gemini.

## 4.4 The Agent Loop (LLM Integration)

**Objective:** The main event loop that drives the conversation.

### Tasks

1.  **Agent Config**
    *   Struct to hold `api_key`, `model`, `system_prompt`.

2.  **Chat Loop Implementation (`chat()` function)**
    *   **Input:** User message.
    *   **Step 1:** Append user message to SessionTree.
    *   **Step 2:** Retrieve history context.
    *   **Step 3:** Call Gemini API (via `fetch` in `web-sys` or JS callback).
    *   **Step 4:** Parse response.
    *   **Step 5 (Loop):** If tool calls -> execute tools -> append results -> call LLM again.
    *   **Step 6:** If final text -> append to SessionTree -> return.

3.  **State Management**
    *   Handle "thinking" state.
    *   Error recovery (API failures).

**Deliverables:**
*   `Agent` struct with `chat()` method exposed to JS.
*   Integration with Gemini API.

## 4.5 Advanced Features (Compaction & Export)

**Objective:** Manage context window and data portability.

### Tasks

1.  **Context Compaction**
    *   Token counting estimator (char count heuristic or BPBE tokenizer if WASM compatible).
    *   Algorithm: Summarize older nodes when history > N messages.
    *   Persist summaries in specific "Summary Nodes" in the tree.

2.  **Export Manager**
    *   `export_jsonl()`: Dump linear history.
    *   `export_tree()`: Dump full branching state.
    *   `export_markdown()`: Readable transcript.

**Deliverables:**
*   `Compaction` module.
*   `Export` module.

## 4.6 Integration & Validation

**Objective:** Connect the Rust brain to the JavaScript body.

### Tasks

1.  **JS/WASM Interop Layer**
    *   Expose `Agent` class to JavaScript.
    *   Wire up `ToolRunner` (JS) to be callable from `Agent` (Rust).
    *   Wire up `IndexedDB` persistence callbacks (Rust -> JS -> DB).

2.  **End-to-End Test**
    *   Load the full app.
    *   Initialize Agent (WASM).
    *   Send "Hello".
    *   Verify response flows through Rust core.

**Deliverables:**
*   Fully integrated `agent-worker.js`.
*   Passing integration tests.

## Technical Stack

*   **Language:** Rust (2021 edition)
*   **Compilation:** `wasm-pack` -> `pkg` (ES modules)
*   **Async Runtime:** `wasm-bindgen-futures`
*   **HTTP Client:** `reqwest` (WASM feature) or `web_sys::window().fetch`

## File Structure

```
aardvark/
├── agent-core/             # NEW: Rust crate
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs          # WASM bindgen exports
│       ├── agent.rs        # Main loop
│       ├── session.rs      # Tree data structure
│       ├── tools.rs        # Dispatcher & Registry
│       └── llm.rs          # Gemini API client
└── ...
```
