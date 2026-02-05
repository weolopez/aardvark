# 01 - Hello Worker

The simplest possible Rust + WASM + Web Worker example.

## What This Project Teaches

- **`#[wasm_bindgen]`**: How to expose Rust functions to JavaScript
- **Web Workers**: Running code in a background thread
- **ES Modules**: Using `import` with WASM in workers
- **postMessage**: Communication between main thread and worker

## Project Structure

```
01-hello-worker/
├── Cargo.toml       # Rust project config
├── build.sh         # Build script
├── README.md        # This file
├── src/
│   └── lib.rs       # Rust code
└── www/
    ├── index.html   # Demo page
    ├── worker.js    # Web Worker
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

## Rust Functions

| Function | Description |
|----------|-------------|
| `greet(name)` | Returns a greeting message |
| `add(a, b)` | Adds two numbers |
| `reverse_string(text)` | Reverses a string |
| `count_words(text)` | Counts words in text |
| `is_prime(n)` | Checks if number is prime |

## How It Works

```
Main Thread (index.html)
    │
    │ postMessage({ type: 'greet', payload: { name: 'World' } })
    ▼
Web Worker (worker.js)
    │
    │ import { greet } from './pkg/hello_worker.js'
    │ const result = greet('World')
    │
    ▼ postMessage({ result: 'Hello, World!' })
Main Thread
```

## Key Code

**Rust (src/lib.rs):**
```rust
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}
```

**Worker (www/worker.js):**
```javascript
import init, { greet } from './pkg/hello_worker.js';

await init();  // Load WASM

self.onmessage = (event) => {
    const result = greet(event.data.name);
    self.postMessage({ result });
};
```

**Main Thread (index.html):**
```javascript
const worker = new Worker('./worker.js', { type: 'module' });

worker.postMessage({ type: 'greet', payload: { name: 'World' } });

worker.onmessage = (event) => {
    console.log(event.data.result);  // "Hello, World!"
};
```

## Why Web Workers?

1. **Non-blocking**: Heavy computation doesn't freeze the UI
2. **True parallelism**: Workers run on separate threads
3. **Clean separation**: Worker code is isolated from main thread
4. **Perfect for WASM**: Ideal environment for CPU-intensive Rust code

## Coding Agent Goal Alignment

This project establishes the **foundational infrastructure** required to run a Rust-based coding agent in the browser. Every subsequent building block depends on the patterns proven here.

| Coding Agent Requirement | How This Project Addresses It |
|--------------------------|-------------------------------|
| Non-blocking agent execution | Web Workers run the agent on a separate thread, keeping the UI responsive |
| Rust/WASM runtime | Proves `wasm-bindgen` + `wasm-pack` toolchain compiles and loads correctly |
| Main thread ↔ Agent communication | `postMessage` protocol is the backbone for all future agent events |
| ES Module loading in workers | `{ type: 'module' }` workers enable clean WASM imports |

**Status: ✅ Complete** — All foundational patterns are established and reused by every subsequent project.

## Next Steps

Continue to [02-gemini-worker](../02-gemini-worker/) to learn how to make HTTP requests from WASM.
