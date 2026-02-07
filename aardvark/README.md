# Aardvark

A browser-based coding agent with Rust/WASM core.

## Architecture

- **Rust** → **WASM** (Web Worker) - Core logic (LLM calls, session management, tool dispatch)
- **Vanilla JavaScript** (ES2020+) - UI and glue code
- **Lit HTML** - Template rendering for web components
- **Tailwind CSS** - Utility-first styling via CDN
- **Native ES Modules** - No bundlers, no npm

## Features

- **Chat Interface** - Natural language conversation with the agent
- **File Operations** - Read, write, edit files using OPFS
- **Tool System** - Extensible tool architecture with approval workflow
- **Session Management** - Branching conversation history
- **Context Compaction** - Automatic context window management
- **Session Export** - Export to JSONL and Markdown

## Quick Start

### Prerequisites

- Rust toolchain (`cargo`, `rustc`)
- A modern web browser (Chrome, Firefox, Edge, Safari)
- A Gemini API key

### Build

```bash
# Build Rust to WASM
cargo build --target wasm32-unknown-unknown --release

# Or use wasm-pack
wasm-pack build --target web

# Serve the www directory
python3 -m http.server 8000
# or
cargo install basic-http-server
basic-http-server
```

### Usage

1. Open `http://localhost:8000` in your browser
2. Enter your Gemini API key when prompted
3. Start chatting!

## Project Structure

```
aardvark/
├── Cargo.toml              # Rust project config
├── src/                    # Rust source code
│   ├── lib.rs             # WASM entry point
│   ├── agent.rs           # Agent core logic
│   ├── session.rs         # Session tree management
│   ├── tools.rs           # Tool dispatch
│   ├── compaction.rs      # Context compaction
│   ├── export.rs          # Session export
│   └── llm/               # LLM providers
│
├── www/                    # Web assets
│   ├── index.html         # Main HTML
│   ├── js/                # JavaScript modules
│   │   ├── app.js        # Main application
│   │   ├── core/         # Core components
│   │   ├── tools/        # Tool implementations
│   │   └── ui/           # UI components
│   └── css/              # Global styles
│
├── plans/                  # Architecture documentation
└── docs/                   # Additional documentation
```

## Component Architecture

### Core Components (Vanilla JS)

- `EventBus` - Pub/sub messaging
- `OPFSProvider` - File system access
- `IndexedDBProvider` - Structured storage
- `MessageBridge` - Worker communication

### UI Components (Lit HTML)

- `ChatUi` - Chat interface
- `SessionTreeUi` - Session branching visualization
- `ToolApprovalUi` - Tool review and approval

### Tools (JavaScript Functions)

- `read` - Read files with line numbers
- `write` - Write/create files
- `edit` - Surgical find-and-replace
- `ls` - List directory contents
- `grep` - Search file contents
- `find` - Find files by pattern
- `js` - Execute JavaScript code

## Technology Stack

- **Rust 1.75+** with wasm-bindgen
- **WebAssembly** (wasm32-unknown-unknown target)
- **Lit HTML 3.0** (via CDN)
- **Tailwind CSS** (via CDN)
- **Origin Private File System (OPFS)**
- **IndexedDB**
- **Web Workers**

## Development

### Running Tests

```bash
# Rust tests
cargo test

# JavaScript tests
# Open www/tests/index.html in browser
```

### Adding a New Tool

1. Create a file in `www/js/tools/{tool-name}.js`
2. Export the tool function and schema
3. Register the tool in the agent

Example:

```javascript
// www/js/tools/my-tool.js
export async function myTool(args, context) {
  // Implementation
  return result;
}

export const myToolSchema = {
  name: 'my-tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string' }
    },
    required: ['param1']
  }
};
```

## License

MIT
