# Phase 1 Plan: Extract Core Components

## Overview

Phase 1 focuses on extracting the foundational components that all other components depend on. These are the "infrastructure" components that provide core services.

**Goal**: Create 5 core components that can be independently developed, tested, and integrated.

**Duration**: 2-3 weeks
**Dependencies**: None (these are the base layer)
**Deliverables**: 5 working components with tests and documentation

---

## Components to Build

### 1. Event Bus (`components/core/event-bus/`)
**Priority**: P0 (Critical - everything depends on this)
**Effort**: 2 days

**Purpose**: Pub/sub messaging system for inter-component communication

**Why First**: All other components communicate through the event bus. Without it, components can't talk to each other.

**Interface**:
```javascript
interface EventBus {
  subscribe(event: string, handler: Function): string;
  unsubscribe(subscriptionId: string): void;
  publish(event: string, data: any): void;
  once(event: string, handler: Function): void;
  clear(): void;
}
```

**Implementation Details**:
- Pure JavaScript, no external dependencies
- Synchronous publish (handlers execute immediately)
- Support for wildcard patterns (optional)
- Error isolation (one handler failing doesn't break others)
- Subscription ID generation using UUID or counter

**Key Events to Support**:
```javascript
type SystemEvents = 
  | 'system:ready'
  | 'system:error'
  | 'tool:call'
  | 'tool:result'
  | 'session:update'
  | 'storage:change'
  | 'ui:command';
```

**Testing Requirements**:
- [ ] Subscribe and receive events
- [ ] Unsubscribe stops receiving events
- [ ] Multiple subscribers receive same event
- [ ] Publish without subscribers doesn't error
- [ ] Handler errors don't break other handlers
- [ ] Clear removes all subscriptions
- [ ] Memory leak prevention (no lingering references)

**Migration Path**:
1. Create new EventBus class
2. Replace existing ad-hoc event handling
3. Update components to use EventBus

**Files to Create**:
```
components/core/event-bus/
├── src/
│   ├── index.js              # Main export
│   ├── event-bus.js          # Core implementation
│   ├── types.js              # JavaScript interfaces
│   └── constants.js          # Event name constants
├── tests/
│   ├── unit/
│   │   └── event-bus.spec.js
│   └── integration/
│       └── cross-tab.spec.js
├── README.md
├── package.json
└── tsconfig.json
```

---

### 2. OPFS Provider (`components/core/opfs-provider/`)
**Priority**: P0 (Critical - file storage)
**Effort**: 3 days

**Purpose**: Wrapper around Origin Private File System API

**Why Early**: All file operations go through OPFS. Tools need this to read/write files.

**Interface**:
```javascript
interface OPFSProvider {
  // File operations
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  
  // Directory operations
  readDir(path: string): Promise<DirEntry[]>;
  createDir(path: string): Promise<void>;
  deleteDir(path: string): Promise<void>;
  
  // Utility
  walkDir(path: string, callback: (entry: DirEntry) => void | Promise<void>): Promise<void>;
  getMetadata(path: string): Promise<FileMetadata>;
}

interface DirEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
}

interface FileMetadata {
  size: number;
  modified: Date;
  created: Date;
}
```

**Implementation Details**:
- Handle nested directory creation automatically
- Convert between FileSystem handles and content
- Error handling for permission denied, not found, etc.
- Support for both async and sync access handles (where available)
- Path normalization (resolve .., ., etc.)

**Testing Requirements**:
- [ ] Read existing file
- [ ] Write new file
- [ ] Write creates parent directories
- [ ] Delete file
- [ ] Check existence
- [ ] Read directory contents
- [ ] Walk directory tree
- [ ] Handle non-existent paths gracefully
- [ ] Error handling for permission issues
- [ ] Large file handling (>1MB)
- [ ] Concurrent operations

**Browser Compatibility**:
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 13.1+)

**Files to Create**:
```
components/core/opfs-provider/
├── src/
│   ├── index.js
│   ├── opfs-provider.js
│   ├── types.js
│   └── utils/
│       └── path.js           # Path normalization
├── tests/
│   ├── unit/
│   │   └── opfs-provider.spec.js
│   └── integration/
│       └── large-files.spec.js
├── README.md
├── package.json
└── tsconfig.json
```

---

### 3. IndexedDB Provider (`components/core/indexeddb-provider/`)
**Priority**: P0 (Critical - structured data storage)
**Effort**: 3 days

**Purpose**: Structured data storage for sessions, settings, and metadata

**Why Early**: Session tree and settings need persistent storage.

**Interface**:
```javascript
interface IndexedDBProvider {
  // Basic CRUD
  get(store: string, key: string): Promise<any>;
  set(store: string, key: string, value: any): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  
  // Batch operations
  getAll(store: string): Promise<any[]>;
  getAllKeys(store: string): Promise<string[]>;
  
  // Querying
  query(store: string, index: string, range: IDBKeyRange): Promise<any[]>;
  
  // Transaction support
  transaction(stores: string[], mode: 'readonly' | 'readwrite'): Transaction;
  
  // Schema
  createStore(name: string, options: StoreOptions): Promise<void>;
  createIndex(store: string, name: string, keyPath: string): Promise<void>;
}

interface StoreOptions {
  keyPath?: string;
  autoIncrement?: boolean;
}

interface Transaction {
  get(store: string, key: string): Promise<any>;
  set(store: string, key: string, value: any): Promise<void>;
  delete(store: string, key: string): Promise<void>;
  commit(): Promise<void>;
  abort(): void;
}
```

**Schema Design**:
```javascript
{
  version: 1,
  stores: {
    sessions: {
      keyPath: 'sessionId',
      indexes: [
        { name: 'created', keyPath: 'created' },
        { name: 'modified', keyPath: 'modified' }
      ]
    },
    pending_tools: {
      keyPath: 'toolId',
      indexes: [
        { name: 'status', keyPath: 'status' },
        { name: 'created', keyPath: 'created' }
      ]
    },
    history: {
      keyPath: 'id',
      indexes: [
        { name: 'sessionId', keyPath: 'sessionId' },
        { name: 'timestamp', keyPath: 'timestamp' }
      ]
    },
    settings: {
      keyPath: 'key'
    }
  }
}
```

**Implementation Details**:
- Promise-based wrapper around IndexedDB API
- Automatic schema migration support
- Transaction handling
- Connection pooling (reuse connections)
- Index optimization

**Testing Requirements**:
- [ ] Basic CRUD operations
- [ ] Batch operations
- [ ] Index querying
- [ ] Transactions (commit/abort)
- [ ] Schema migration
- [ ] Error handling (quota exceeded, etc.)
- [ ] Concurrent access
- [ ] Large data handling

**Migration Path**:
1. Design schema for existing data
2. Create migration from current storage
3. Provide fallback for browsers without IndexedDB

**Files to Create**:
```
components/core/indexeddb-provider/
├── src/
│   ├── index.js
│   ├── indexeddb-provider.js
│   ├── types.js
│   ├── schema.js             # Database schema definition
│   └── migrations/
│       └── v1.js             # Initial schema
├── tests/
│   ├── unit/
│   │   └── indexeddb-provider.spec.js
│   └── integration/
│       └── migrations.spec.js
├── README.md
├── package.json
└── tsconfig.json
```

---

### 4. Message Bridge (`components/core/message-bridge/`)
**Priority**: P1 (High - enables worker communication)
**Effort**: 2 days

**Purpose**: A simple communication layer that forwards messages between the Web Worker and the Main Thread, integrating with the Event Bus.

**Why Important**: The agent runs in a Web Worker and the UI in the Main Thread. This component bridges the two contexts, allowing for decoupled communication through the Event Bus on each side.

**Interface**:
```javascript
// A generic message format for cross-thread communication
interface BridgeMessage {
  // The event name to be published on the destination Event Bus
  event: string; 
  // The data payload for the event
  data: any;
}

// Main Thread API
interface MessageBridgeMain {
  // Posts a message to the worker, which will be published on the worker's Event Bus
  postToWorker(message: BridgeMessage): void;
  terminate(): void;
}

// Worker API
interface MessageBridgeWorker {
  // Posts a message to the main thread, which will be published on the main thread's Event Bus
  postToMain(message: BridgeMessage): void;
}
```

**Implementation Details**:
- The main-thread bridge listens for messages from the worker and `publish()`es them to the main-thread `EventBus`.
- The main-thread bridge has a method to `subscribe()` to the local `EventBus` for specific events that should be forwarded to the worker.
- The worker-side bridge does the reverse: listens for messages from the main thread and publishes them to the worker's `EventBus`.
- This design removes any direct request/response logic from the bridge itself, making it a pure message forwarder. All stateful communication is handled by other components via the event bus.
- Automatic reconnection on worker crash.
- Message serialization (handle complex objects).
- Error propagation from worker to main.

**Features**:
- Decouples worker and main thread via Event Bus integration.
- Error boundary and propagation.
- Timeout handling for messages is no longer a bridge concern; it's up to the components that send and receive events.

**Testing Requirements**:
- [ ] Send message from main to worker, verify event is published on worker's Event Bus.
- [ ] Send message from worker to main, verify event is published on main's Event Bus.
- [ ] Ensure errors from the worker are propagated to the main thread and published on the Event Bus.
- [ ] Worker termination.
- [ ] Reconnection after crash.

**Files to Create**:
```
components/core/message-bridge/
├── src/
│   ├── index.js
│   ├── message-bridge-main.js    # Main thread side
│   ├── message-bridge-worker.js  # Worker side
│   └── types.js                  # Shared message types
├── tests/
│   ├── unit/
│   │   ├── message-bridge-main.spec.js
│   │   └── message-bridge-worker.spec.js
│   └── integration/
│       └── worker-communication.spec.js
├── README.md
├── package.json
└── tsconfig.json
```

---

### 5. API Client (`components/core/api-client/`)
**Priority**: P1 (High - enables LLM communication)
**Effort**: 4 days

**Purpose**: LLM API communication with multiple provider support

**Interface**:
```javascript
interface APIClient {
  initialize(config: APIConfig): void;
  sendRequest(request: LLMRequest): Promise<LLMResponse>;
  streamRequest(request: LLMRequest, onChunk: (chunk: string) => void): Promise<void>;
  abort(): void;
  getTokenCount(text: string): number;
}

interface APIConfig {
  provider: 'gemini' | 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

interface LLMRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  finishReason: string;
}

interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}
```

**Provider Implementations**:
1. **Gemini** (Primary for Phase 1)
   - REST API
   - Streaming support
   - Tool calling

2. **OpenAI** (Secondary)
   - Compatible with many providers
   - Streaming
   - Tools

3. **Anthropic** (Future)
   - Claude API
   - Streaming
   - Tools

**Implementation Details**:
- Provider abstraction layer
- Retry logic with exponential backoff
- Streaming parser
- Token counting (approximate for each provider)
- Error classification (retryable vs fatal)

**Testing Requirements**:
- [ ] Send request (mock provider)
- [ ] Receive response
- [ ] Streaming chunks
- [ ] Retry on failure
- [ ] Abort in-progress request
- [ ] Error handling (network, auth, rate limit)
- [ ] Token counting
- [ ] Provider switching

**Note on API Keys**:
- Never store keys in code
- Accept via config only
- Support for environment variables

**Files to Create**:
```
components/core/api-client/
├── src/
│   ├── index.js
│   ├── api-client.js
│   ├── types.js
│   ├── providers/
│   │   ├── base.js
│   │   ├── gemini.js
│   │   ├── openai.js
│   │   └── anthropic.js
│   └── utils/
│       ├── retry.js
│       └── tokens.js
├── tests/
│   ├── unit/
│   │   ├── api-client.spec.js
│   │   └── providers/
│   │       └── gemini.spec.js
│   └── integration/
│       └── streaming.spec.js
├── README.md
├── package.json
└── tsconfig.json
```

---

## Implementation Order

### Week 1: Foundation

**Day 1-2: Event Bus**
- Create project structure
- Implement core event bus
- Write unit tests
- Write integration tests
- Create documentation
- **Milestone**: Event bus working with all tests passing

**Day 3-5: OPFS Provider**
- Implement file operations
- Implement directory operations
- Implement walk and metadata
- Write comprehensive tests
- Handle edge cases
- **Milestone**: Can read/write files and directories

### Week 2: Storage & Communication

**Day 6-8: IndexedDB Provider**
- Design schema
- Implement CRUD operations
- Implement transactions
- Add migration support
- Write tests
- **Milestone**: Can store and retrieve structured data

**Day 9-11: Message Bridge**
- Implement main thread side
- Implement worker side
- Add request/response correlation
- Handle errors and timeouts
- Write tests
- **Milestone**: Main thread and worker can communicate

### Week 3: API & Integration

**Day 12-15: API Client**
- Implement provider abstraction
- Implement Gemini provider
- Add streaming support
- Add retry logic
- Write tests
- **Milestone**: Can make API calls to LLM

**Day 16-17: Integration**
- Create integration tests combining all components
- Fix any integration issues
- Performance testing
- Documentation review
- **Milestone**: All components work together

**Day 18-21: Buffer**
- Bug fixes
- Documentation improvements
- Migration of existing code (if time permits)
- Performance optimization
- **Final Milestone**: Phase 1 Complete

---

## Testing Strategy

### Unit Tests (per component)
- Use Jest or Vitest
- Mock dependencies
- 100% code coverage goal
- Run in Node.js (with polyfills for browser APIs)

### Integration Tests
- Test component interactions
- Use real browser APIs (OPFS, IndexedDB)
- Run in headless browser (Playwright or Puppeteer)

### Test Utilities
Create shared test utilities:
```javascript
// components/core/test-utils/
export function createMockEventBus(): EventBus;
export function createMockOPFS(): OPFSProvider;
export function createMockIndexedDB(): IndexedDBProvider;
export function setupTestEnvironment(): Promise<void>;
export function teardownTestEnvironment(): Promise<void>;
```

---

## Migration Strategy

### Step 1: Create Components in Isolation
Build each component in `components/core/{name}/` without touching existing code.

### Step 2: Create Adapters
Build adapters to bridge old code with new components:
```javascript
// adapters/event-bus-adapter.js
// Wraps old event handling to use new EventBus
```

### Step 3: Gradual Migration
Replace one module at a time:
1. Replace ad-hoc events with EventBus
2. Replace raw OPFS calls with OPFSProvider
3. Replace storage with IndexedDBProvider
4. Add MessageBridge
5. Add APIClient

### Step 4: Remove Old Code
Once all code uses new components:
- Remove old implementations
- Update imports
- Clean up

---

## Documentation Requirements

Each component must have:

1. **README.md**
   - Purpose and overview
   - Installation
   - Quick start example
   - API reference
   - Configuration options

2. **API.md**
   - Complete interface documentation
   - Type definitions
   - Event documentation

3. **EXAMPLES.md**
   - Common use cases
   - Code examples
   - Best practices

4. **CHANGELOG.md**
   - Version history
   - Breaking changes
   - Migration guide

---

## Definition of Done

Phase 1 is complete when:

- [ ] All 5 core components implemented
- [ ] All unit tests passing (>90% coverage)
- [ ] All integration tests passing
- [ ] Documentation complete for each component
- [ ] Components published to npm (or ready for publishing)
- [ ] Example app demonstrating all components working together
- [ ] Performance benchmarks established
- [ ] Browser compatibility verified

---

## Risks and Mitigation

### Risk 1: OPFS Browser Support
**Risk**: OPFS might have edge cases in different browsers
**Mitigation**: 
- Test in Chrome, Firefox, Safari
- Have IndexedDB fallback for file storage
- Document browser requirements

### Risk 2: IndexedDB Migration Complexity
**Risk**: Migrating existing data to new schema
**Mitigation**:
- Design schema carefully upfront
- Write migration scripts
- Test migration on sample data

### Risk 3: Worker Communication Complexity
**Risk**: Message passing between worker and main can be tricky
**Mitigation**:
- Use request/response correlation
- Extensive error handling
- Good debugging tools

### Risk 4: API Rate Limits
**Risk**: Integration tests might hit rate limits
**Mitigation**:
- Mock APIs for most tests
- Use test API keys
- Limit concurrent requests

---

## Success Criteria

Phase 1 is successful if:

1. Components can be used independently
2. Components can be composed together
3. Tests provide confidence in correctness
4. Documentation enables others to use components
5. Performance is acceptable
6. Migration path is clear

---

## Next Steps After Phase 1

Once Phase 1 is complete:

1. **Phase 2**: Extract Storage Components
   - file-store (builds on opfs-provider)
   - session-store (builds on indexeddb-provider)
   - tool-store

2. **Phase 3**: Extract Tool Components
   - read, write, edit, ls, grep, find, js tools

3. **Phase 4**: Extract Agent Components
   - session-manager
   - tool-dispatcher
   - compaction-engine

4. **Phase 5**: Extract UI Components
   - chat-ui
   - session-tree-ui
   - tool-approval-ui

---

## Resources Needed

- **Developers**: 1-2 developers
- **Time**: 2-3 weeks
- **Testing**: Browser testing environment
- **Documentation**: Technical writer (optional, devs can write)

---

## Questions to Resolve

1. Should we use a monorepo or separate repos for components?
   - **Recommendation**: Monorepo for Phase 1-2, evaluate separate repos later

2. Which package manager? npm, pnpm, yarn?
   - **Recommendation**: pnpm for better monorepo support

3. Should components be web components (Custom Elements) or just JavaScript classes?
   - **Recommendation**: Start with JavaScript classes, add Custom Elements wrapper later if needed

4. How do we handle versioning?
   - **Recommendation**: All components start at v0.1.0, use semantic versioning

5. Do we need a build step for each component?
   - **Recommendation**: Yes, build to dist/ with ES modules and UMD bundles

---

## Appendix: Component Template

Create a script to scaffold new components:

```bash
#!/bin/bash
# scripts/create-component.sh

COMPONENT_NAME=$1
COMPONENT_CATEGORY=$2

mkdir -p components/$COMPONENT_CATEGORY/$COMPONENT_NAME/{src,tests/{unit,integration}}

# Create package.json
cat > components/$COMPONENT_CATEGORY/$COMPONENT_NAME/package.json << EOF
{
  "name": "@agent/$COMPONENT_NAME",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.js",
  "scripts": {
    "build": "tsc",
    "test": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration"
  }
}
EOF

# Create src/index.js
cat > components/$COMPONENT_CATEGORY/$COMPONENT_NAME/src/index.js << EOF
export * from './$COMPONENT_NAME';
export * from './types';
EOF

# Create other files...
```

Usage:
```bash
./scripts/create-component.sh event-bus core
./scripts/create-component.sh read-tool tools
```

---

## Summary

Phase 1 creates the foundation for everything that follows. These 5 components provide the essential services that all other components need:

- **Event Bus**: Communication
- **OPFS Provider**: File storage
- **IndexedDB Provider**: Structured storage
- **Message Bridge**: Worker communication
- **API Client**: LLM integration

With these in place, we can build the rest of the system as composable layers on top of this solid foundation.
