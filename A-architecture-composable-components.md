# Master Plan: Composable Components Architecture

## Philosophy

Following Unix philosophy:
- **Small**: Each component does one thing well
- **Composable**: Components work together through standard interfaces
- **Reusable**: Components can be used in different contexts
- **Testable**: Each component can be tested in isolation
- **Deployable**: Each component can be independently deployed

## Technology Stack

- **Rust** → **WASM** (Web Worker) - Core logic
- **Vanilla JavaScript** (ES2020+) - UI and glue code
- **Lit HTML** - Template rendering for web components
- **Tailwind CSS** - Utility-first styling via CDN
- **Standard Web Platform APIs** - No frameworks
- **Native ES Modules** - No bundlers

## Component Architecture

Each component is a self-contained web component using Lit HTML with:
- **Interface**: Standardized input/output contracts
- **State**: Internal state management with reactive updates
- **Events**: Standard DOM events + custom events
- **Rendering**: Static (initial) + Dynamic (updates) separation
- **Testing**: Browser-based unit and integration tests
- **Documentation**: API docs and usage examples

## Component Registry

```
components/
├── core/                          # Foundation components (vanilla JS)
│   ├── event-bus/                # Pub/sub event system
│   ├── opfs-provider/            # OPFS access wrapper
│   ├── indexeddb-provider/       # IndexedDB access wrapper
│   └── message-bridge/           # Worker ↔ Main thread messaging
│
├── rust/                          # Rust/WASM components
│   ├── agent-core/               # LLM loop, session management
│   ├── session-manager/          # Session tree (Rust)
│   ├── tool-dispatcher/          # Tool routing (Rust)
│   ├── compaction-engine/        # Context compaction (Rust)
│   └── export-manager/           # Session export (Rust)
│
├── tools/                         # Tool execution (JS in main thread)
│   ├── read-tool/
│   ├── write-tool/
│   ├── edit-tool/
│   ├── ls-tool/
│   ├── grep-tool/
│   ├── find-tool/
│   └── js-tool/
│
└── ui/                            # UI web components (Lit HTML)
    ├── chat-ui/
    ├── session-tree-ui/
    ├── tool-approval-ui/
    ├── file-browser-ui/
    └── export-ui/
```

---

## Web Component Model with Lit HTML

Components use **Lit HTML** for efficient, expressive rendering:

### Component Structure

Components use **Lit HTML** for rendering and **Tailwind CSS** for styling:

```javascript
// components/ui/chat-ui/chat-ui.js
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class ChatUi extends LitElement {
  // No static styles - using Tailwind classes!

  // Reactive properties (dynamic rendering when changed)
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

  // Dynamic render with Tailwind classes
  render() {
    return html`
      <div class="flex flex-col h-full bg-white">
        <!-- Messages List -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          ${this.messages.map(msg => this.renderMessage(msg))}
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
            @click="${this.sendMessage}" 
            ?disabled="${this.isLoading || !this.inputText.trim()}">
            ${this.isLoading ? html`<span class="animate-pulse">Loading...</span>` : 'Send'}
          </button>
        </div>
      </div>
    `;
  }

  // Helper template with Tailwind classes
  renderMessage(msg) {
    return html`
      <div class="${msg.role === 'user' 
        ? 'ml-8 bg-blue-50' 
        : 'mr-8 bg-gray-50'} 
        p-3 rounded-lg shadow-sm">
        <div class="text-sm text-gray-500 mb-1">
          ${msg.role === 'user' ? 'You' : 'Assistant'}
        </div>
        <div class="text-gray-800 whitespace-pre-wrap">${msg.content}</div>
        ${msg.toolCalls ? this.renderToolCalls(msg.toolCalls) : ''}
      </div>
    `;
  }

  renderToolCalls(toolCalls) {
    return html`
      <div class="tool-calls">
        ${toolCalls.map(call => html`
          <div class="tool-call">
            <span class="tool-name">${call.name}</span>
            <pre>${JSON.stringify(call.arguments, null, 2)}</pre>
          </div>
        `)}
      </div>
    `;
  }

  // Event handlers
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

    // Dispatch custom event
    this.dispatchEvent(new CustomEvent('message-send', {
      detail: { text },
      bubbles: true,
      composed: true
    }));

    // Clear input
    this.inputText = '';
  }

  // Public API methods
  addMessage(role, content, toolCalls = null) {
    this.messages = [...this.messages, { role, content, toolCalls, timestamp: Date.now() }];
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.updateComplete.then(() => {
      const messagesEl = this.shadowRoot.querySelector('.messages');
      if (messagesEl) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    });
  }
}

// Register custom element
customElements.define('chat-ui', ChatUi);
```

### Static vs Dynamic Rendering

**Static (One-time)**:
- Component structure
- CSS styles
- Event listener setup

**Dynamic (Reactive)**:
- Message list updates
- Input value changes
- Loading state toggles
- Conditional rendering

### Usage

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import { ChatUi } from './components/ui/chat-ui/chat-ui.js';
    import { EventBus } from './components/core/event-bus/event-bus.js';
    
    // Initialize event bus
    const eventBus = new EventBus();
    
    // Get reference to chat UI
    const chatUi = document.querySelector('chat-ui');
    
    // Listen for messages
    chatUi.addEventListener('message-send', (e) => {
      const { text } = e.detail;
      eventBus.publish('message:send', { text });
    });
    
    // Listen for agent responses
    eventBus.subscribe('message:receive', (data) => {
      chatUi.addMessage(data.role, data.content, data.toolCalls);
    });
  </script>
</head>
<body>
  <chat-ui></chat-ui>
</body>
</html>
```

---

## Core Components

### 1. Event Bus (`components/core/event-bus/`)

**Purpose**: Pub/sub messaging between components

**Implementation**:
```javascript
// components/core/event-bus/event-bus.js
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
    
    // Return unsubscribe function
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
    
    // Also dispatch as DOM event for Lit components
    this.dispatchEvent(new CustomEvent(event, { detail: data }));
  }

  once(event, handler) {
    const wrappedHandler = (data) => {
      this.unsubscribe(event, wrappedHandler);
      handler(data);
    };
    this.subscribe(event, wrappedHandler);
  }
}
```

**Testing**:
```javascript
// Browser-based test
describe('EventBus', () => {
  it('delivers messages to subscribers', () => {
    const bus = new EventBus();
    let received = null;
    bus.subscribe('test', (data) => { received = data; });
    bus.publish('test', { value: 42 });
    assert.equal(received.value, 42);
  });
});
```

---

### 2. OPFS Provider (`components/core/opfs-provider/`)

**Purpose**: Wrapper around Origin Private File System API

**Implementation**:
```javascript
// components/core/opfs-provider/opfs-provider.js
export class OPFSProvider {
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
    const root = await navigator.storage.getDirectory();
    const parts = path.split('/').filter(p => p);
    
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async readDir(path) {
    const root = await navigator.storage.getDirectory();
    const parts = path.split('/').filter(p => p);
    
    let dir = root;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part);
    }
    
    const entries = [];
    for await (const [name, handle] of dir.entries()) {
      entries.push({
        name,
        path: path ? `${path}/${name}` : name,
        type: handle.kind,
        handle
      });
    }
    return entries;
  }

  async exists(path) {
    try {
      await this.readFile(path);
      return true;
    } catch {
      return false;
    }
  }
}
```

---

### 3. IndexedDB Provider (`components/core/indexeddb-provider/`)

**Purpose**: Structured data storage

**Implementation**:
```javascript
// components/core/indexeddb-provider/indexeddb-provider.js
export class IndexedDBProvider {
  constructor(dbName = 'agent-db', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create stores
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionsStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
          sessionsStore.createIndex('created', 'created', { unique: false });
        }
        
        if (!db.objectStoreNames.contains('pending_tools')) {
          db.createObjectStore('pending_tools', { keyPath: 'toolId' });
        }
        
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id' });
          historyStore.createIndex('sessionId', 'sessionId', { unique: false });
        }
      };
    });
  }

  async get(store, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readonly');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.get(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async set(store, key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.put({ ...value, [objectStore.keyPath]: key });
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAll(store) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readonly');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
}
```

---

### 4. Message Bridge (`components/core/message-bridge/`)

**Purpose**: Communication between Web Worker (WASM) and Main Thread

**Main Thread Side**:
```javascript
// components/core/message-bridge/message-bridge-main.js
export class MessageBridgeMain extends EventTarget {
  constructor(workerScript) {
    super();
    this.worker = new Worker(workerScript, { type: 'module' });
    this.pendingRequests = new Map();
    this.messageId = 0;
    
    this.worker.onmessage = (e) => this.handleMessage(e.data);
    this.worker.onerror = (e) => this.handleError(e);
  }

  postToWorker(type, payload) {
    const id = ++this.messageId;
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }

  handleMessage(message) {
    const { id, type, payload, error } = message;
    
    if (id && this.pendingRequests.has(id)) {
      const { resolve, reject } = this.pendingRequests.get(id);
      this.pendingRequests.delete(id);
      
      if (error) {
        reject(new Error(error));
      } else {
        resolve(payload);
      }
    } else {
      // Broadcast message (e.g., tool_call from agent)
      this.dispatchEvent(new CustomEvent(type, { detail: payload }));
    }
  }

  handleError(error) {
    console.error('Worker error:', error);
    this.dispatchEvent(new CustomEvent('error', { detail: error }));
  }

  terminate() {
    this.worker.terminate();
  }
}
```

**Worker Side**:
```javascript
// components/core/message-bridge/message-bridge-worker.js
export class MessageBridgeWorker {
  constructor() {
    self.onmessage = (e) => this.handleMessage(e.data);
  }

  handleMessage(message) {
    const { id, type, payload } = message;
    
    // Process message and post response
    this.processMessage(type, payload)
      .then(result => {
        self.postMessage({ id, type: 'response', payload: result });
      })
      .catch(error => {
        self.postMessage({ id, type: 'error', error: error.message });
      });
  }

  async processMessage(type, payload) {
    // Implemented by consumer
    throw new Error('processMessage must be implemented');
  }

  postToMain(type, payload) {
    self.postMessage({ type, payload });
  }
}
```

---

## Rust/WASM Components

### Rust Components Interface

Rust components are compiled to WASM and expose functions via wasm-bindgen:

```rust
// src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct AgentCore {
    session: SessionTree,
    tool_dispatcher: ToolDispatcher,
}

#[wasm_bindgen]
impl AgentCore {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            session: SessionTree::new(),
            tool_dispatcher: ToolDispatcher::new(),
        }
    }

    pub fn send_message(&mut self, text: String) -> JsValue {
        // Process message
        let response = self.process_message(text);
        serde_wasm_bindgen::to_value(&response).unwrap()
    }

    pub fn get_available_tools(&self) -> JsValue {
        let tools = self.tool_dispatcher.get_tools();
        serde_wasm_bindgen::to_value(&tools).unwrap()
    }
}
```

**Usage from JavaScript**:
```javascript
import init, { AgentCore } from '../pkg/agent_core.js';

await init();
const agent = new AgentCore();
const response = agent.send_message("Hello");
```

---

## Tool Components

Tools are JavaScript functions executed in the main thread:

```javascript
// components/tools/read-tool/read-tool.js
export async function readTool(args, context) {
  const { path, offset = 1, limit } = args;
  const { opfs } = context;
  
  const content = await opfs.readFile(path);
  const lines = content.split('\n');
  
  const start = Math.max(0, offset - 1);
  const end = limit ? Math.min(lines.length, start + limit) : lines.length;
  const selectedLines = lines.slice(start, end);
  
  return selectedLines
    .map((line, i) => `${start + i + 1} | ${line}`)
    .join('\n');
}

export const readToolSchema = {
  name: 'read',
  description: 'Read file contents with optional line offset and limit',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      offset: { type: 'number', description: '1-indexed line number' },
      limit: { type: 'number', description: 'Maximum lines to read' }
    },
    required: ['path']
  }
};
```

---

## UI Components

All UI components use **Lit HTML** for rendering:

### Chat UI
```javascript
import { ChatUi } from './components/ui/chat-ui/chat-ui.js';

// In HTML
<chat-ui></chat-ui>

// In JS
const chat = document.querySelector('chat-ui');
chat.addEventListener('message-send', (e) => {
  console.log('User said:', e.detail.text);
});
```

### Session Tree UI
```javascript
import { SessionTreeUi } from './components/ui/session-tree-ui/session-tree-ui.js';

class SessionTreeUi extends LitElement {
  static properties = {
    session: { type: Object },
    selectedNode: { type: String }
  };

  render() {
    return html`
      <div class="tree">
        ${this.renderNode(this.session.root)}
      </div>
    `;
  }

  renderNode(node) {
    return html`
      <div class="node" ?selected="${node.id === this.selectedNode}">
        <span @click="${() => this.selectNode(node.id)}">
          ${node.content.substring(0, 50)}...
        </span>
        ${node.children?.map(child => this.renderNode(child))}
      </div>
    `;
  }
}
```

---

## Testing Strategy

### Browser-Based Testing

No npm/jest - tests run directly in browser:

```html
<!-- tests/index.html -->
<!DOCTYPE html>
<html>
<head>
  <title>Component Tests</title>
  <style>
    .pass { color: green; }
    .fail { color: red; }
  </style>
</head>
<body>
  <h1>Tests</h1>
  <div id="results"></div>
  
  <script type="module">
    import { EventBus } from '../components/core/event-bus/event-bus.js';
    import { OPFSProvider } from '../components/core/opfs-provider/opfs-provider.js';
    
    const results = document.getElementById('results');
    let passCount = 0;
    let failCount = 0;
    
    function test(name, fn) {
      try {
        fn();
        results.innerHTML += `<div class="pass">✓ ${name}</div>`;
        passCount++;
      } catch (e) {
        results.innerHTML += `<div class="fail">✗ ${name}: ${e.message}</div>`;
        failCount++;
      }
    }
    
    function assertEqual(actual, expected, msg) {
      if (actual !== expected) {
        throw new Error(`${msg || 'Assertion failed'}: expected ${expected}, got ${actual}`);
      }
    }
    
    // EventBus tests
    test('EventBus subscribe and publish', () => {
      const bus = new EventBus();
      let received = null;
      bus.subscribe('test', (data) => { received = data; });
      bus.publish('test', { value: 42 });
      assertEqual(received.value, 42);
    });
    
    test('EventBus unsubscribe', () => {
      const bus = new EventBus();
      let count = 0;
      const unsubscribe = bus.subscribe('test', () => count++);
      bus.publish('test');
      unsubscribe();
      bus.publish('test');
      assertEqual(count, 1);
    });
    
    // Summary
    results.innerHTML += `<hr><div>Passed: ${passCount}, Failed: ${failCount}</div>`;
  </script>
</body>
</html>
```

### Integration Tests

Test component interactions:

```html
<!-- tests/integration.html -->
<script type="module">
  import { EventBus } from '../components/core/event-bus/event-bus.js';
  import { ChatUi } from '../components/ui/chat-ui/chat-ui.js';
  
  async function testChatWorkflow() {
    const eventBus = new EventBus();
    const chat = document.createElement('chat-ui');
    document.body.appendChild(chat);
    
    let messageSent = false;
    chat.addEventListener('message-send', () => {
      messageSent = true;
    });
    
    // Simulate user input
    chat.inputText = 'Hello';
    chat.sendMessage();
    
    assert(messageSent, 'Message should be sent');
  }
</script>
```

---

## Directory Structure

```
project/
├── Cargo.toml              # Rust workspace
├── src/                    # Rust source
│   ├── lib.rs              # WASM entry
│   ├── agent.rs            # Agent core
│   ├── session.rs          # Session tree
│   ├── tools.rs            # Tool dispatch
│   └── compaction.rs       # Context compaction
│
├── www/                    # Web assets
│   ├── index.html          # Main HTML
│   ├── index.js            # Entry point
│   ├── styles.css          # Global styles
│   │
│   ├── components/         # Components
│   │   ├── core/
│   │   │   ├── event-bus/
│   │   │   │   ├── event-bus.js
│   │   │   │   └── README.md
│   │   │   ├── opfs-provider/
│   │   │   │   └── opfs-provider.js
│   │   │   ├── indexeddb-provider/
│   │   │   │   └── indexeddb-provider.js
│   │   │   └── message-bridge/
│   │   │       ├── message-bridge-main.js
│   │   │       └── message-bridge-worker.js
│   │   │
│   │   ├── tools/
│   │   │   ├── read-tool.js
│   │   │   ├── write-tool.js
│   │   │   ├── edit-tool.js
│   │   │   ├── ls-tool.js
│   │   │   ├── grep-tool.js
│   │   │   ├── find-tool.js
│   │   │   └── js-tool.js
│   │   │
│   │   └── ui/
│   │       ├── chat-ui/
│   │       │   ├── chat-ui.js
│   │       │   └── README.md
│   │       ├── session-tree-ui/
│   │       │   └── session-tree-ui.js
│   │       ├── tool-approval-ui/
│   │       │   └── tool-approval-ui.js
│   │       └── export-ui/
│   │           └── export-ui.js
│   │
│   ├── tests/
│   │   ├── index.html
│   │   └── integration.html
│   │
│   └── worker.js           # Web Worker entry
│
├── pkg/                    # Generated WASM (gitignored)
│
└── plans/
    └── # Architecture plans
```

---

## Build Process

### Development

```bash
# 1. Build Rust to WASM
cargo build --target wasm32-unknown-unknown --release

# Or use wasm-pack (optional)
wasm-pack build --target web

# 2. Serve with Python
python3 -m http.server 8000

# Or use Rust alternative
cargo install basic-http-server
basic-http-server
```

### Production

```bash
# Build optimized WASM
cargo build --release --target wasm32-unknown-unknown

# Deploy www/ directory to static host
# - GitHub Pages
# - Netlify
# - Cloudflare Pages
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
web-sys = { version = "0.3", features = ["console", "Window", "Worker", "WorkerGlobalScope"] }
uuid = { version = "1.0", features = ["v4", "js"] }
chrono = { version = "0.4", features = ["serde"] }
getrandom = { version = "0.2", features = ["js"] }
```

### JavaScript
- **Lit HTML**: Web components via CDN
  ```javascript
  import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
  ```
- **Tailwind CSS**: Utility classes via CDN
  ```html
  <script src="https://cdn.tailwindcss.com"></script>
  ```
- No npm dependencies
- No build step for JavaScript

---

## Migration Path

### Phase 1: Setup Infrastructure
1. Create directory structure
2. Set up Rust project with wasm-bindgen
3. Add Lit HTML via CDN
4. Create basic EventBus

### Phase 2: Core Components
1. Implement OPFSProvider
2. Implement IndexedDBProvider
3. Implement MessageBridge
4. Write tests

### Phase 3: Rust Components
1. Port session management to Rust
2. Port tool dispatch to Rust
3. Port compaction to Rust
4. Add WASM bindings

### Phase 4: UI Components
1. Create ChatUi with Lit
2. Create SessionTreeUi with Lit
3. Create ToolApprovalUi with Lit
4. Wire up event handling

### Phase 5: Integration
1. Connect all components
2. End-to-end testing
3. Performance optimization
4. Documentation

---

## Summary

**Stack**:
- Rust → WASM for core logic
- Vanilla JavaScript for glue code
- Lit HTML for UI components
- Tailwind CSS for styling (via CDN)
- Native ES Modules
- No npm, no bundlers, no TypeScript

**Benefits**:
- Type safety in Rust
- Efficient rendering with Lit
- Rapid UI development with Tailwind
- Minimal dependencies (2 CDNs)
- Fast development cycle
- Easy deployment

**Component Model**:
- Core: Vanilla JS classes
- UI: Lit HTML web components + Tailwind CSS
- Tools: JS functions
- Logic: Rust/WASM

This architecture follows Unix philosophy while using modern web standards.
