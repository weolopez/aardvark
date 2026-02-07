# Technical Architecture

## Technology Stack

### Core Runtime
- **Rust** → **WASM** → **Web Worker**
- No TypeScript build system
- No npm/webpack/rollup
- Minimal 3rd party dependencies

### UI Layer
- **Lit HTML** (Web Components via CDN)
- **Tailwind CSS** (via CDN for utility classes)
- **Vanilla JavaScript** (ES2020+)
- Shadow DOM for style encapsulation
- Standard Web Platform APIs
- No React/Vue/Angular
- Composable via custom elements

### Storage
- **OPFS** (Origin Private File System) - files
- **IndexedDB** - structured data
- Native browser APIs only

### Build System
- **Cargo** (Rust)
- **wasm-bindgen** (Rust ↔ JS bridge)
- **wasm-pack** (optional, for packaging)
- No JavaScript bundlers

---

## Architecture Principles

### 1. Rust/WASM for Core Logic
All business logic runs in Rust, compiled to WASM, executing in a Web Worker:
- LLM API communication
- Session tree management
- Tool dispatch and orchestration
- Context compaction
- State management

**Why**: Performance, type safety, no JS build complexity

### 2. JavaScript for Glue and UI
JavaScript handles:
- DOM manipulation
- Event handling
- Tool execution (in main thread)
- Browser API wrappers (OPFS, IndexedDB)
- Communication with WASM

**Why**: Direct browser API access, no compilation step

### 3. Minimal Dependencies
Allowed:
- wasm-bindgen (required for Rust/JS interop)
- js-sys (Rust bindings to JS APIs)
- web-sys (Rust bindings to Web APIs)
- serde (Rust serialization)

Not allowed:
- npm packages
- JavaScript frameworks
- CSS frameworks
- Build tools (webpack, rollup, etc.)

### 4. Standard Web Platform
Use native browser features:
- Custom Elements with Lit HTML (for UI components)
- ES Modules (import/export)
- Web Workers
- Service Workers (optional)
- Native CSS

---

## Component Model

### Three Types of Components

**1. Core Components (Vanilla JS Classes)**
Foundation services that don't render UI:
- EventBus
- OPFSProvider
- IndexedDBProvider
- MessageBridge

**2. UI Components (Lit HTML Web Components)**
Visual components with reactive rendering:
- Chat UI
- Session Tree
- Tool Approval
- File Browser

**3. Tool Components (Functions)**
Executable tools in main thread:
- read, write, edit, ls, grep, find, js

---

### UI Components with Lit HTML

UI components use **Lit HTML** for efficient, expressive rendering with Shadow DOM:

```javascript
// www/components/chat-ui.js
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class ChatUi extends LitElement {
  // Static styles (rendered once, Shadow DOM scoped)
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
    }
    
    .message {
      margin-bottom: 1rem;
      padding: 0.75rem;
      border-radius: 0.5rem;
    }
    
    .message-user {
      background: #e3f2fd;
      margin-left: 2rem;
    }
    
    .input-area {
      display: flex;
      padding: 1rem;
      border-top: 1px solid #ddd;
    }
    
    textarea {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid #ccc;
      border-radius: 0.25rem;
      resize: none;
    }
    
    button {
      margin-left: 0.5rem;
      padding: 0.5rem 1rem;
      background: #1976d2;
      color: white;
      border: none;
      border-radius: 0.25rem;
      cursor: pointer;
    }
  `;

  // Reactive properties (trigger re-render when changed)
  static properties = {
    messages: { type: Array },
    inputText: { type: String },
    isLoading: { type: Boolean }
  };

  constructor() {
    super();
    this.messages = [];
    this.inputText = '';
    this.isLoading = false;
  }

  // Dynamic render (called when properties change)
  render() {
    return html`
      <div class="messages">
        ${this.messages.map(msg => this.renderMessage(msg))}
      </div>
      
      <div class="input-area">
        <textarea
          .value="${this.inputText}"
          @input="${this.handleInput}"
          @keydown="${this.handleKeydown}"
          placeholder="Type a message..."
          ?disabled="${this.isLoading}"
        ></textarea>
        <button 
          @click="${this.sendMessage}"
          ?disabled="${this.isLoading || !this.inputText.trim()}"
        >
          ${this.isLoading ? 'Loading...' : 'Send'}
        </button>
      </div>
    `;
  }

  renderMessage(msg) {
    return html`
      <div class="message message-${msg.role}">
        <div class="content">${msg.content}</div>
      </div>
    `;
  }

  handleInput(e) {
    this.inputText = e.target.value;
  }

  handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage() {
    const text = this.inputText.trim();
    if (!text || this.isLoading) return;

    this.dispatchEvent(new CustomEvent('message-send', {
      detail: { text },
      bubbles: true,
      composed: true
    }));

    this.inputText = '';
  }

  // Public API
  addMessage(role, content) {
    this.messages = [...this.messages, { role, content }];
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.updateComplete.then(() => {
      const messages = this.shadowRoot.querySelector('.messages');
      if (messages) messages.scrollTop = messages.scrollHeight;
    });
  }
}

customElements.define('chat-ui', ChatUi);
```

### Usage with Tailwind

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <script type="module">
    import { ChatUi } from './components/chat-ui.js';
    import { EventBus } from './js/event-bus.js';
    
    const eventBus = new EventBus();
    const chat = document.querySelector('chat-ui');
    
    chat.addEventListener('message-send', (e) => {
      eventBus.publish('message:send', e.detail);
    });
    
    eventBus.subscribe('message:receive', (data) => {
      chat.addMessage(data.role, data.content);
    });
  </script>
</head>
<body class="bg-gray-100 h-screen">
  <chat-ui class="h-full max-w-4xl mx-auto shadow-lg"></chat-ui>
</body>
</html>
```

### Core Components (Vanilla JS)

Non-UI components are plain JavaScript classes:

```javascript
// www/js/event-bus.js
export class EventBus extends EventTarget {
  constructor() {
    super();
    this.handlers = new Map();
  }

  subscribe(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(handler);
    return () => this.handlers.get(event).delete(handler);
  }

  publish(event, data) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error('Event handler error:', e);
        }
      });
    }
    this.dispatchEvent(new CustomEvent(event, { detail: data }));
  }
}
```

---

## Directory Structure

```
/                           # Repository root
├── Cargo.toml              # Rust workspace
├── src/                    # Rust source code
│   ├── lib.rs              # WASM entry point
│   ├── agent.rs            # Agent core (LLM loop)
│   ├── session.rs          # Session tree management
│   ├── tools.rs            # Tool dispatch
│   ├── compaction.rs       # Context compaction
│   ├── export.rs           # Session export
│   └── llm/                # LLM providers
│       ├── mod.rs
│       ├── gemini.rs
│       └── types.rs
│
├── www/                    # Web assets (no build step)
│   ├── index.html          # Main HTML
│   ├── index.js            # Main entry point
│   ├── styles.css          # Global styles
│   │
│   ├── js/                 # JavaScript modules
│   │   ├── event-bus.js    # Event system
│   │   ├── opfs.js         # OPFS wrapper
│   │   ├── indexeddb.js    # IndexedDB wrapper
│   │   ├── message-bridge.js  # Worker communication
│   │   ├── tools/          # Tool implementations
│   │   │   ├── read.js
│   │   │   ├── write.js
│   │   │   ├── edit.js
│   │   │   ├── ls.js
│   │   │   ├── grep.js
│   │   │   ├── find.js
│   │   │   └── js-exec.js
│   │   └── utils/          # Utilities
│   │       ├── dom.js
│   │       └── format.js
│   │
│   ├── components/         # UI components (vanilla JS)
│   │   ├── chat-ui.js
│   │   ├── session-tree.js
│   │   ├── tool-approval.js
│   │   └── file-browser.js
│   │
│   └── worker.js           # Web Worker entry point
│
├── pkg/                    # Generated WASM (wasm-pack output)
│   └── # Auto-generated, don't edit
│
└── plans/                  # Architecture plans
    └── # Already created
```

---

## Module System

### ES Modules (Native)
Use browser-native ES modules:

```html
<!-- index.html -->
<script type="module" src="index.js"></script>
```

```javascript
// index.js
import { EventBus } from './js/event-bus.js';
import { ChatUI } from './components/chat-ui.js';
import init, { Agent } from '../pkg/coding_agent.js';

async function main() {
  await init();
  
  const eventBus = new EventBus();
  const agent = new Agent();
  const chatUI = new ChatUI(document.getElementById('chat'), eventBus);
  
  // Wire up
  eventBus.subscribe('message:send', (data) => {
    agent.send_message(data.text);
  });
}

main();
```

### Rust → WASM → JS
Rust exposes functions to JavaScript via wasm-bindgen:

```rust
// src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Agent {
    // ...
}

#[wasm_bindgen]
impl Agent {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        // ...
    }
    
    pub fn send_message(&mut self, text: String) {
        // ...
    }
    
    pub fn get_available_tools(&self) -> JsValue {
        // Returns JSON array
    }
}
```

Generated JavaScript usage:
```javascript
import init, { Agent } from '../pkg/coding_agent.js';

await init();
const agent = new Agent();
agent.send_message("Hello");
```

---

## Communication Flow

### WASM (Worker) ↔ JavaScript (Main)

```
┌─────────────────────────────────────────────────────────────┐
│  Main Thread (JavaScript)                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Chat UI    │  │ Tool Runner  │  │ Message Bridge   │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│         │                 │                    │            │
│         └─────────────────┴────────────────────┘            │
│                           │                                  │
│                    postMessage                               │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────┐
│  Web Worker (WASM/Rust)    │                                  │
│  ┌────────────────────────┴──────────────────────────────┐  │
│  │                    Agent Core                         │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐    │  │
│  │  │ Session  │  │  Tools   │  │   LLM Client     │    │  │
│  │  │ Manager  │  │ Dispatcher│  │                  │    │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘    │  │
│  └─────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Message Flow**:
1. User sends message → Chat UI → Event Bus
2. Event Bus → Message Bridge → postMessage to Worker
3. Worker (WASM) receives message → Agent Core processes
4. Agent calls LLM → gets response
5. Agent needs tool → Message Bridge → postMessage to Main
6. Main (Tool Runner) executes tool → returns result
7. Result → Message Bridge → Worker
8. Worker continues → sends final response
9. Response → Message Bridge → Chat UI displays

---

## Implementation Patterns

### Pattern 1: Rust Structs with wasm-bindgen

```rust
// src/session.rs
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct Node {
    id: String,
    role: String,
    content: String,
    parent_id: Option<String>,
    children: Vec<String>,
}

#[wasm_bindgen]
pub struct SessionTree {
    nodes: HashMap<String, Node>,
    root_id: String,
    current_id: String,
}

#[wasm_bindgen]
impl SessionTree {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        // Initialize
    }
    
    pub fn append_message(&mut self, role: String, content: String) -> String {
        // Add node, return node ID
    }
    
    pub fn get_history_json(&self) -> JsValue {
        // Return JSON string for JS
        serde_wasm_bindgen::to_value(&self.get_history()).unwrap()
    }
}
```

### Pattern 2: JavaScript Wrappers for Browser APIs

```javascript
// www/js/opfs.js
export class OPFS {
  async readFile(path) {
    const root = await navigator.storage.getDirectory();
    const parts = path.split('/').filter(p => p);
    
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    return await file.text();
  }
  
  async writeFile(path, content) {
    // Similar implementation
  }
}
```

### Pattern 3: UI Components with Lit HTML + Tailwind

```javascript
// www/components/chat-ui.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class ChatUi extends LitElement {
  // No static styles needed - using Tailwind classes!
  
  static properties = {
    messages: { type: Array },
    inputText: { type: String },
    isLoading: { type: Boolean }
  };

  constructor() {
    super();
    this.messages = [];
    this.inputText = '';
    this.isLoading = false;
  }

  render() {
    return html`
      <div class="flex flex-col h-full bg-white">
        <!-- Messages List -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          ${this.messages.map(msg => html`
            <div class="${msg.role === 'user' 
              ? 'ml-8 bg-blue-50' 
              : 'mr-8 bg-gray-50'} 
              p-3 rounded-lg shadow-sm">
              <div class="text-sm text-gray-500 mb-1">
                ${msg.role === 'user' ? 'You' : 'Assistant'}
              </div>
              <div class="text-gray-800 whitespace-pre-wrap">${msg.content}</div>
            </div>
          `)}
        </div>
        
        <!-- Input Area -->
        <div class="flex p-4 border-t border-gray-200 bg-white">
          <textarea
            class="flex-1 p-3 border border-gray-300 rounded-lg resize-none 
                   focus:outline-none focus:ring-2 focus:ring-blue-500
                   disabled:bg-gray-100"
            .value="${this.inputText}"
            @input="${this.handleInput}"
            @keydown="${this.handleKeydown}"
            placeholder="Type a message..."
            rows="2"
            ?disabled="${this.isLoading}"
          ></textarea>
          <button 
            class="ml-3 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium
                   hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
                   disabled:bg-gray-400 disabled:cursor-not-allowed
                   transition-colors duration-200"
            @click="${this.send}"
            ?disabled="${this.isLoading || !this.inputText.trim()}">
            ${this.isLoading 
              ? html`<span class="animate-pulse">Loading...</span>` 
              : 'Send'}
          </button>
        </div>
      </div>
    `;
  }

  handleInput(e) {
    this.inputText = e.target.value;
  }

  handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  send() {
    const text = this.inputText.trim();
    if (!text || this.isLoading) return;

    this.dispatchEvent(new CustomEvent('message-send', {
      detail: { text },
      bubbles: true,
      composed: true
    }));

    this.inputText = '';
  }

  addMessage(role, content) {
    this.messages = [...this.messages, { role, content }];
    // Auto-scroll
    this.updateComplete.then(() => {
      const container = this.shadowRoot.querySelector('.overflow-y-auto');
      if (container) container.scrollTop = container.scrollHeight;
    });
  }
}

customElements.define('chat-ui', ChatUi);
```

---

## Styling Strategy with Tailwind CSS

### Tailwind via CDN

Tailwind CSS is loaded via CDN and used for all styling:

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
  <!-- Tailwind CSS -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- Tailwind Configuration -->
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: '#1976d2',
            'user-msg': '#e3f2fd',
            'assistant-msg': '#f5f5f5',
          }
        }
      }
    }
  </script>
</head>
<body>
  <chat-ui></chat-ui>
  
  <script type="module" src="index.js"></script>
</body>
</html>
```

### Using Tailwind with Lit Components

Apply Tailwind classes in Lit templates:

```javascript
class ChatUi extends LitElement {
  render() {
    return html`
      <div class="flex flex-col h-full bg-white">
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          ${this.messages.map(msg => html`
            <div class="${msg.role === 'user' 
              ? 'ml-8 bg-user-msg' 
              : 'mr-8 bg-assistant-msg'} 
              p-3 rounded-lg shadow-sm">
              <div class="text-gray-800">${msg.content}</div>
            </div>
          `)}
        </div>
        
        <div class="flex p-4 border-t border-gray-200">
          <textarea 
            class="flex-1 p-2 border border-gray-300 rounded resize-none 
                   focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Type a message..."
            ?disabled="${this.isLoading}"
          ></textarea>
          <button 
            class="ml-2 px-4 py-2 bg-primary text-white rounded 
                   hover:bg-blue-700 disabled:bg-gray-400"
            ?disabled="${this.isLoading}">
            Send
          </button>
        </div>
      </div>
    `;
  }
}
```

### Tailwind Benefits

- **Utility-first**: Rapid development with predefined classes
- **CDN loaded**: No build step, no npm, works immediately
- **Configurable**: Custom colors and themes via config
- **Responsive**: Built-in responsive modifiers (`md:`, `lg:`)
- **Dark mode**: Built-in dark mode support
- **Consistent**: Design system out of the box

### Common Patterns

```javascript
// Layout
html`<div class="flex flex-col h-screen">...</div>`

// Spacing
html`<div class="p-4 m-2 space-y-4">...</div>`

// Typography
html`<h1 class="text-2xl font-bold text-gray-800">...</h1>`

// Colors
html`<button class="bg-blue-500 hover:bg-blue-700 text-white">...</button>`

// Responsive
html`<div class="w-full md:w-1/2 lg:w-1/3">...</div>`

// State
html`<input class="focus:ring-2 disabled:opacity-50">`

// Dark mode
html`<div class="bg-white dark:bg-gray-800">...</div>`
```

### Style Encapsulation Note

Since Tailwind uses global utility classes, Shadow DOM encapsulation doesn't hide styles. This is fine because:
- Tailwind classes are utilities, not component-specific
- No style conflicts (utilities are atomic)
- Consistent design system across all components
- Override via higher specificity or !important if needed

---

## Build Process

### Development

```bash
# 1. Build Rust to WASM
cargo build --target wasm32-unknown-unknown

# OR with wasm-pack (if desired)
wasm-pack build --target web

# 2. Serve with any static server
# Python
python3 -m http.server 8000

# Node (if you have it)
npx serve .

# Rust (cargo install basic-http-server)
basic-http-server .
```

### Production

```bash
# Build optimized WASM
cargo build --release --target wasm32-unknown-unknown

# Or with wasm-pack
wasm-pack build --release --target web

# Deploy www/ directory to any static host
# - GitHub Pages
# - Netlify
# - Vercel
# - Cloudflare Pages
```

---

## Testing Strategy

### Rust Tests (Unit)

```rust
// src/session.rs
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_append_message() {
        let mut tree = SessionTree::new();
        let id = tree.append_message("user".to_string(), "Hello".to_string());
        
        assert!(!id.is_empty());
        let history = tree.get_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].content, "Hello");
    }
}
```

Run: `cargo test`

### JavaScript Tests (Browser)

Since we have no build system, tests run in browser:

```html
<!-- www/tests/index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Tests</title>
  <style>
    .test-pass { color: green; }
    .test-fail { color: red; }
  </style>
</head>
<body>
  <h1>Tests</h1>
  <div id="results"></div>
  
  <script type="module">
    import { EventBus } from '../js/event-bus.js';
    import { OPFS } from '../js/opfs.js';
    
    const results = document.getElementById('results');
    
    async function test(name, fn) {
      try {
        await fn();
        results.innerHTML += `<div class="test-pass">✓ ${name}</div>`;
      } catch (e) {
        results.innerHTML += `<div class="test-fail">✗ ${name}: ${e.message}</div>`;
      }
    }
    
    // EventBus tests
    await test('EventBus subscribe and publish', () => {
      const bus = new EventBus();
      let received = false;
      bus.subscribe('test', () => received = true);
      bus.publish('test', {});
      if (!received) throw new Error('Message not received');
    });
    
    // More tests...
  </script>
</body>
</html>
```

### Integration Tests

```html
<!-- www/tests/integration.html -->
<script type="module">
  // Full workflow tests
  // - Initialize agent
  // - Send message
  // - Tool execution
  // - Session persistence
</script>
```

---

## Migration from Current Code

### Step 1: Restructure Repository
```bash
mkdir -p www/js/tools www/components
mv existing-js/* www/js/
```

### Step 2: Create Rust Modules
Create `src/` structure with:
- `lib.rs` - WASM entry
- `agent.rs` - Main agent logic
- `session.rs` - Session tree
- `tools.rs` - Tool dispatch
- `llm/` - LLM providers

### Step 3: Move Logic from JS to Rust
Gradually migrate:
1. Session tree management (JS → Rust)
2. Tool dispatch logic (JS → Rust)
3. LLM API calls (JS → Rust)
4. Context compaction (JS → Rust)

### Step 4: Create JavaScript Glue
For each Rust module, create JS wrapper:
```javascript
// www/js/agent.js
import init, { Agent } from '../pkg/coding_agent.js';

export async function createAgent() {
  await init();
  return new Agent();
}
```

### Step 5: Update UI Components
Convert existing UI to Lit HTML web components:
```javascript
// Old: Functional style
function renderChat() { ... }

// New: Lit component
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

class ChatUi extends LitElement {
  static styles = css`...`;
  static properties = { messages: Array };
  render() { return html`...`; }
}
```

---

## Dependencies

### Rust (Cargo.toml)
```toml
[dependencies]
wasm-bindgen = "0.2"
wasm-bindgen-futures = "0.4"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
serde-wasm-bindgen = "0.6"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console", "Window", ...] }
uuid = { version = "1.0", features = ["v4", "js"] }
chrono = { version = "0.4", features = ["serde"] }
getrandom = { version = "0.2", features = ["js"] }
regex = "1.0"  # For tool parsing

[dependencies.web-sys]
version = "0.3"
features = [
  "console",
  "Window",
  "Worker",
  "WorkerGlobalScope",
  "MessageEvent",
  "Headers",
  "Request",
  "RequestInit",
  "RequestMode",
  "Response",
]
```

### JavaScript (via CDN)
- **Lit HTML**: Web components framework
  ```javascript
  import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
  ```
- **Tailwind CSS**: Utility-first CSS framework
  ```html
  <script src="https://cdn.tailwindcss.com"></script>
  ```
- No npm packages
- No build step for JavaScript

---

## Deployment

### Static Hosting
Deploy `www/` directory to any static host:

1. **GitHub Pages**
   ```bash
   git subtree push --prefix www origin gh-pages
   ```

2. **Netlify**
   - Drag and drop `www/` folder
   - Or connect Git repo

3. **Vercel**
   ```bash
   cd www && vercel
   ```

### Requirements
- HTTPS (required for OPFS)
- COOP/COEP headers for SharedArrayBuffer (if needed):
  ```
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  ```

---

## Development Workflow

### 1. Start Development Server
```bash
# Terminal 1: Build WASM in watch mode
cargo watch -i .gitignore -i "pkg/*" -s "wasm-pack build --target web --dev"

# Terminal 2: Serve static files
python3 -m http.server 8000
# or
cargo install basic-http-server && basic-http-server
```

### 2. Edit Rust Code
- Edit `src/*.rs`
- wasm-pack rebuilds automatically
- Refresh browser to see changes

### 3. Edit JavaScript Code
- Edit `www/js/*.js`
- Refresh browser (no build step!)

### 4. Debug
- **Rust**: `console.log` via `web_sys::console::log_1`
- **Browser**: Chrome DevTools
  - Sources panel shows Rust code via source maps
  - Console shows WASM errors

---

## Performance Considerations

### 1. Minimize JS↔WASM Calls
Batch operations in Rust, don't call per-item:
```rust
// Bad: Called from JS for each item
#[wasm_bindgen]
pub fn process_item(item: &str) { ... }

// Good: Process entire batch in Rust
#[wasm_bindgen]
pub fn process_items(items: JsValue) {
    let items: Vec<String> = serde_wasm_bindgen::from_value(items).unwrap();
    for item in items { ... }
}
```

### 2. Use Transferable Objects
For large data, use ArrayBuffer transfer:
```javascript
worker.postMessage({ data: largeArrayBuffer }, [largeArrayBuffer]);
```

### 3. Lazy Loading
Load components on demand:
```javascript
async function showFileBrowser() {
  const { FileBrowser } = await import('./components/file-browser.js');
  new FileBrowser(container);
}
```

---

## Summary

**Key Principles**:
1. Rust/WASM for core logic (performance, types)
2. Vanilla JS for UI (simplicity, no build)
3. No npm dependencies (minimal complexity)
4. Standard web platform (future-proof)
5. Event-driven architecture (loose coupling)

**Stack**:
- Rust → WASM (wasm-bindgen)
- Vanilla JavaScript (ES2020+)
- Lit HTML (web components via CDN)
- Tailwind CSS (utility classes via CDN)
- OPFS + IndexedDB
- Native ES Modules
- No build tools, no npm

**Benefits**:
- No build complexity for JS
- Type safety in Rust
- Rapid UI development with Tailwind
- Component encapsulation with Lit
- Minimal dependencies (2 CDNs)
- Fast development cycle
- Easy deployment
