# AGENTS.md

## Project Overview

Rust/WASM agent implementing the ReAct (Reason + Act) loop — an LLM agent with tool execution capabilities. This crate compiles to WebAssembly and runs in a Web Worker environment.

## Build Commands

```bash
# Build the WASM module for web target
wasm-pack build --target web --out-dir www/pkg

# Build in release mode (optimized)
wasm-pack build --release --target web --out-dir www/pkg

# Check code without building
cargo check

# Build for native target (for testing)
cargo build
```

## Test Commands

```bash
# Run all tests
cargo test

# Run a single test
cargo test test_name_here

# Run tests with output visible
cargo test -- --nocapture

# Run tests for a specific module
cargo test llm::
```

## Lint Commands

```bash
# Run Clippy (linting)
cargo clippy

# Run Clippy with all features
cargo clippy --all-features

# Run Clippy and treat warnings as errors
cargo clippy -- -D warnings

# Format code
cargo fmt

# Check formatting without modifying
cargo fmt -- --check
```

## Code Style Guidelines

### Imports Order
1. Standard library imports (none in this WASM project)
2. External crate imports (grouped by crate)
3. Internal module imports

```rust
// External crates first
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, RequestMode, Response};

// Internal modules last
use llm::{ChatMessage, FunctionCall, GeminiRequest};
```

### Struct Definitions
- Use `#[derive(...)]` on separate lines for clarity
- Group related derives together
- Use `#[serde(...)]` attributes for JSON mapping

```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum Part {
    Text { text: String },
    #[serde(rename = "functionCall")]
    FunctionCall { function_call: FunctionCall },
}
```

### Naming Conventions
- **Structs/Enums**: `PascalCase` (e.g., `GeminiRequest`, `FunctionCall`)
- **Functions/Methods**: `snake_case` (e.g., `run_step`, `add_tool_result`)
- **Constants**: `SCREAMING_SNAKE_CASE`
- **Type aliases**: `PascalCase`
- **Fields**: `snake_case`, avoid trailing underscores unless avoiding keywords

### Error Handling
- Use `Result<T, JsValue>` for WASM-exposed functions
- Convert errors to descriptive strings with context:
  ```rust
  serde_json::from_str(tools_json)
      .map_err(|e| JsValue::from_str(&format!("Failed to parse tools: {}", e)))?
  ```
- Use `?` operator for early returns
- Provide meaningful error messages with context

### Async Patterns
- Mark WASM-exposed async methods with `pub async fn`
- Use `JsFuture` for JavaScript promise interop
- Propagate errors using `?`:
  ```rust
  let resp_value = JsFuture::from(global.fetch_with_request(&req))
      .await
      .map_err(|e| format!("Network request failed: {:?}", e))?;
  ```

### WASM Bindings
- Use `#[wasm_bindgen]` on structs that need JS exposure
- Use `#[wasm_bindgen(constructor)]` for JS `new()` support
- Return `JsValue` for flexibility in JS interop

### Section Comments
Use visual separators for logical groupings:
```rust
// ============================================================================
// Public Types
// ============================================================================
```

### Type Safety
- Use strong typing with structs/enums over raw `serde_json::Value`
- Derive `Clone` for types that may need copying
- Use `Option<T>` for nullable fields with `#[serde(skip_serializing_if = "Option::is_none")]`

## Project Structure

```
src/
├── lib.rs      # Main Agent struct, WASM exports, chat loop
└── llm.rs      # Gemini API types and HTTP client
```

## Running the Demo

```bash
# Build WASM module
wasm-pack build --target web --out-dir www/pkg

# Serve the demo
cd www && python3 -m http.server 8080

# Open http://localhost:8080
```

## Dependencies

Key crates:
- `wasm-bindgen`: JavaScript interoperability
- `serde/serde_json`: JSON serialization
- `web-sys`: Web API bindings
- `js-sys`: JavaScript global bindings

## Environment

- Runs in Web Worker context (uses `WorkerGlobalScope`)
- Target: `wasm32-unknown-unknown`
- Output: ES modules in `www/pkg/`
