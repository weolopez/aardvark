# Master Plan: Composable Web Components Architecture

## Philosophy

Following Unix philosophy:
- **Small**: Each component does one thing well
- **Composable**: Components work together through standard interfaces
- **Reusable**: Components can be used in different contexts
- **Testable**: Each component can be tested in isolation
- **Deployable**: Each component can be independently deployed

## Component Architecture

Each component is a self-contained web component with:
- **Interface**: Standardized input/output contracts
- **State**: Internal state management
- **Events**: Publish/subscribe event system
- **Testing**: Unit and integration tests
- **Documentation**: API docs and usage examples

## Component Registry

```
components/
├── core/                          # Foundation components (no dependencies)
│   ├── opfs-provider/            # OPFS access wrapper
│   ├── indexeddb-provider/       # IndexedDB access wrapper
│   ├── event-bus/                # Pub/sub event system
│   ├── message-bridge/           # Worker ↔ Main thread messaging
│   └── api-client/               # LLM API client
│
├── storage/                       # Data persistence components
│   ├── file-store/               # OPFS file operations
│   ├── session-store/            # Session tree storage
│   ├── tool-store/               # Tool definitions storage
│   └── settings-store/           # Configuration storage
│
├── tools/                         # Tool execution components
│   ├── read-tool/                # File reading tool
│   ├── write-tool/               # File writing tool
│   ├── edit-tool/                # File editing tool
│   ├── ls-tool/                  # Directory listing tool
│   ├── grep-tool/                # Content search tool
│   ├── find-tool/                # File discovery tool
│   └── js-tool/                  # JavaScript execution tool
│
├── agent/                         # Agent orchestration components
│   ├── session-manager/          # Session tree management
│   ├── tool-dispatcher/          # Tool routing and execution
│   ├── compaction-engine/        # Context compaction
│   ├── context-builder/          # Build LLM context from session
│   └── export-manager/           # Session export functionality
│
├── ui/                            # User interface components
│   ├── chat-ui/                  # Chat interface
│   ├── session-tree-ui/          # Session branching visualization
│   ├── tool-approval-ui/         # Tool approval interface
│   ├── file-browser-ui/          # File explorer (optional)
│   └── export-ui/                # Export dialog
│
└── integrations/                  # External service components
    ├── github-loader/            # GitHub repository loading
    └── llm-provider/             # LLM API integration
```

## Component Specification Template

Each component follows this structure:

```typescript
// Component Interface
interface ComponentInterface {
  // Inputs
  initialize(config: Config): Promise<void>;
  
  // Operations
  execute(input: Input): Promise<Output>;
  
  // Events
  on(event: string, handler: Function): void;
  off(event: string, handler: Function): void;
  
  // Lifecycle
  destroy(): Promise<void>;
}

// Standard Events
interface ComponentEvents {
  'ready': { timestamp: number };
  'error': { error: Error; context: any };
  'state-change': { previous: State; current: State };
}
```

## Core Components

### 1. Event Bus (`components/core/event-bus/`)

**Purpose**: Pub/sub messaging between components

**Interface**:
```typescript
interface EventBus {
  subscribe(event: string, handler: Function): string; // Returns subscription ID
  unsubscribe(subscriptionId: string): void;
  publish(event: string, data: any): void;
  once(event: string, handler: Function): void;
}
```

**Events**:
- `tool:call` - Tool execution requested
- `tool:result` - Tool execution completed
- `session:update` - Session state changed
- `storage:change` - Storage data changed
- `ui:command` - UI command received

**Testing**:
```typescript
describe('EventBus', () => {
  it('should deliver messages to subscribers', () => {
    const bus = new EventBus();
    const handler = jest.fn();
    bus.subscribe('test', handler);
    bus.publish('test', { data: 'value' });
    expect(handler).toHaveBeenCalledWith({ data: 'value' });
  });
});
```

**Deployment**: Standalone web component
```html
<event-bus id="main-bus"></event-bus>
<script>
  const bus = document.getElementById('main-bus');
  bus.subscribe('tool:call', (data) => console.log(data));
</script>
```

---

### 2. Message Bridge (`components/core/message-bridge/`)

**Purpose**: Communication between Web Worker and Main Thread

**Interface**:
```typescript
interface MessageBridge {
  // Main Thread API
  postToWorker(message: WorkerMessage): void;
  onMessageFromWorker(handler: (msg: WorkerResponse) => void): void;
  
  // Worker API  
  postToMain(message: WorkerResponse): void;
  onMessageFromMain(handler: (msg: WorkerMessage) => void): void;
}

interface WorkerMessage {
  id: string;
  type: 'init' | 'chat' | 'branch' | 'load_repo' | 'get_history' | 'get_tree' | 'approve_tool' | 'reject_tool';
  payload: any;
}

interface WorkerResponse {
  id: string;
  type: 'ready' | 'step' | 'tool_call' | 'tool_result' | 'done' | 'error' | 'tool_pending';
  payload: any;
}
```

**Testing**:
- Mock worker for main thread tests
- Mock main thread for worker tests
- Message serialization/deserialization tests

**Deployment**: 
```html
<!-- Main Thread -->
<message-bridge worker-url="worker.js"></message-bridge>

<!-- Worker -->
<message-bridge endpoint="main"></message-bridge>
```

---

### 3. OPFS Provider (`components/core/opfs-provider/`)

**Purpose**: Wrapper around Origin Private File System

**Interface**:
```typescript
interface OPFSProvider {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readDir(path: string): Promise<DirEntry[]>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
  walkDir(path: string, callback: (entry: DirEntry) => void): Promise<void>;
}

interface DirEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
}
```

**Events**:
- `file:read` - File was read
- `file:write` - File was written
- `dir:change` - Directory contents changed

**Testing**:
- Mock OPFS for unit tests
- Integration tests with real OPFS
- Permission error handling tests

**Deployment**:
```html
<opfs-provider id="fs"></opfs-provider>
<script>
  const fs = document.getElementById('fs');
  const content = await fs.readFile('src/main.rs');
</script>
```

---

### 4. IndexedDB Provider (`components/core/indexeddb-provider/`)

**Purpose**: Structured data storage

**Interface**:
```typescript
interface IndexedDBProvider {
  get(store: string, key: string): Promise<any>;
  set(store: string, key: string, value: any): Promise<void>;
  getAll(store: string): Promise<any[]>;
  query(store: string, index: string, range: IDBKeyRange): Promise<any[]>;
  delete(store: string, key: string): Promise<void>;
  clear(store: string): Promise<void>;
}
```

**Schema**:
```javascript
{
  sessions: { keyPath: 'sessionId' },
  pending_tools: { keyPath: 'toolId' },
  history: { keyPath: 'id', indexes: ['sessionId'] },
  settings: { keyPath: 'key' }
}
```

**Testing**:
- Mock IndexedDB for unit tests
- Migration tests for schema changes
- Transaction rollback tests

---

### 5. API Client (`components/core/api-client/`)

**Purpose**: LLM API communication

**Interface**:
```typescript
interface APIClient {
  initialize(config: APIConfig): void;
  sendRequest(request: LLMRequest): Promise<LLMResponse>;
  streamRequest(request: LLMRequest, onChunk: (chunk: string) => void): Promise<void>;
  abort(): void;
}

interface APIConfig {
  provider: 'gemini' | 'openai' | 'anthropic';
  apiKey: string;
  model: string;
  baseUrl?: string;
}

interface LLMRequest {
  messages: Message[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}
```

**Features**:
- Provider abstraction (Gemini, OpenAI, Anthropic)
- Streaming support
- Retry logic with exponential backoff
- Token counting estimation

**Testing**:
- Mock providers for unit tests
- Retry logic tests
- Error handling tests

---

## Storage Components

### 6. File Store (`components/storage/file-store/`)

**Dependencies**: `opfs-provider`, `event-bus`

**Purpose**: High-level file operations with caching

**Interface**:
```typescript
interface FileStore {
  read(path: string, options?: ReadOptions): Promise<FileContent>;
  write(path: string, content: string): Promise<void>;
  list(path: string): Promise<FileInfo[]>;
  search(pattern: string): Promise<SearchResult[]>;
  watch(path: string, callback: (event: WatchEvent) => void): string; // Returns watcher ID
  unwatch(watcherId: string): void;
}

interface FileContent {
  path: string;
  content: string;
  lines: string[];
  size: number;
  modified: Date;
}

interface ReadOptions {
  offset?: number;  // Line number
  limit?: number;   // Max lines
}
```

**Features**:
- Line-based access with offset/limit
- File watching for changes
- Content caching
- Search indexing

**Events**:
- `file:changed` - File modified
- `file:created` - New file created
- `file:deleted` - File deleted

---

### 7. Session Store (`components/storage/session-store/`)

**Dependencies**: `indexeddb-provider`, `event-bus`

**Purpose**: Session tree persistence

**Interface**:
```typescript
interface SessionStore {
  createSession(): Promise<string>; // Returns sessionId
  getSession(sessionId: string): Promise<Session>;
  saveSession(session: Session): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  listSessions(): Promise<SessionSummary[]>;
  
  // Node operations
  appendNode(sessionId: string, parentId: string, node: Node): Promise<Node>;
  getBranch(sessionId: string, nodeId: string): Promise<Node[]>;
  branchFrom(sessionId: string, nodeId: string): Promise<string>; // Returns new branch sessionId
}

interface Session {
  sessionId: string;
  root: Node;
  currentNodeId: string;
  created: Date;
  modified: Date;
}

interface Node {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  parentId?: string;
  children: string[];
  timestamp: Date;
}
```

**Features**:
- Full tree persistence
- Branching support
- Efficient parent/child queries
- Export to JSONL/Markdown

---

### 8. Tool Store (`components/storage/tool-store/`)

**Dependencies**: `opfs-provider`, `indexeddb-provider`

**Purpose**: Tool definition management

**Interface**:
```typescript
interface ToolStore {
  // Discovery
  scanTools(): Promise<ToolSummary[]>;
  getTool(name: string): Promise<ToolDefinition>;
  
  // Approval workflow
  submitTool(tool: ToolDefinition): Promise<string>; // Returns pendingToolId
  approveTool(pendingToolId: string): Promise<void>;
  rejectTool(pendingToolId: string): Promise<void>;
  getPendingTools(): Promise<PendingTool[]>;
  
  // CRUD
  createTool(tool: ToolDefinition): Promise<void>;
  updateTool(name: string, tool: Partial<ToolDefinition>): Promise<void>;
  deleteTool(name: string): Promise<void>;
}

interface ToolDefinition {
  name: string;
  description: string;
  version: string;
  allowedTools?: string[];
  content: string; // Full SKILL.md content
}
```

**Storage**:
- Approved tools: OPFS `.tools/{name}/SKILL.md`
- Pending tools: IndexedDB `pending_tools` store

---

## Tool Components

### 9. Read Tool (`components/tools/read-tool/`)

**Dependencies**: `file-store`

**Purpose**: Read files with line numbers

**Schema** (for LLM):
```json
{
  "name": "read",
  "description": "Read file contents with optional line offset and limit",
  "parameters": {
    "type": "object",
    "properties": {
      "path": { "type": "string" },
      "offset": { "type": "number", "description": "1-indexed line number" },
      "limit": { "type": "number", "description": "Maximum lines to read" }
    },
    "required": ["path"]
  }
}
```

**Output Format**:
```
1 | fn main() {
2 |     println!("Hello");
3 | }
```

---

### 10. Write Tool (`components/tools/write-tool/`)

**Dependencies**: `file-store`

**Purpose**: Write or create files

**Features**:
- Auto-create parent directories
- Overwrite protection (optional)
- Backup on overwrite

---

### 11. Edit Tool (`components/tools/edit-tool/`)

**Dependencies**: `file-store`

**Purpose**: Surgical find-and-replace

**Features**:
- Exact match (primary)
- Fuzzy match fallback (whitespace normalization, smart quotes)
- Uniqueness validation
- Diff generation

**Algorithm**:
1. Read file content
2. Try exact match: `content.indexOf(oldText)`
3. If no match, try fuzzy: `normalize(content).indexOf(normalize(oldText))`
4. If multiple matches, return error
5. Perform replacement
6. Generate unified diff
7. Write back

---

### 12. Ls Tool (`components/tools/ls-tool/`)

**Dependencies**: `file-store`

**Purpose**: List directory contents

**Output Format**:
```
drwxr-xr-x  src/
-rw-r--r--  Cargo.toml
-rw-r--r--  README.md
```

---

### 13. Grep Tool (`components/tools/grep-tool/`)

**Dependencies**: `file-store`

**Purpose**: Search file contents

**Features**:
- Regex pattern matching
- Case-insensitive option
- Path filtering
- Limit results

**Output Format**:
```
src/main.rs:42: fn main() {
src/lib.rs:15: pub fn helper() {
```

---

### 14. Find Tool (`components/tools/find-tool/`)

**Dependencies**: `file-store`

**Purpose**: Find files by pattern

**Features**:
- Glob pattern matching
- Directory traversal
- Path filtering

**Output**: List of file paths

---

### 15. Js Tool (`components/tools/js-tool/`)

**Dependencies**: `file-store`

**Purpose**: Execute JavaScript code

**Sandbox**:
```javascript
// Available globals
const sandbox = {
  read: (path) => fileStore.read(path),
  write: (path, content) => fileStore.write(path, content),
  grep: (pattern, path) => grepTool.execute({ pattern, path }),
  find: (pattern) => findTool.execute({ pattern }),
  console: { log: (msg) => captureOutput(msg) }
};

// Execution
const fn = new Function('read', 'write', 'grep', 'find', 'console', userCode);
return fn(sandbox.read, sandbox.write, sandbox.grep, sandbox.find, sandbox.console);
```

**Security**:
- No access to `window`, `document`, `fetch`
- Timeout protection
- Output size limits

---

## Agent Components

### 16. Session Manager (`components/agent/session-manager/`)

**Dependencies**: `session-store`, `event-bus`

**Purpose**: Manage conversation state and branching

**Interface**:
```typescript
interface SessionManager {
  createSession(): Promise<Session>;
  loadSession(sessionId: string): Promise<Session>;
  saveMessage(sessionId: string, message: Message): Promise<void>;
  branch(sessionId: string, nodeId: string): Promise<string>; // Returns new sessionId
  getHistory(sessionId: string): Promise<Message[]>;
  getTree(sessionId: string): Promise<TreeView>;
}
```

**Features**:
- Tree navigation
- Branch creation
- History reconstruction
- Export integration

---

### 17. Tool Dispatcher (`components/agent/tool-dispatcher/`)

**Dependencies**: `tool-store`, `event-bus`, all tool components

**Purpose**: Route tool calls to appropriate handlers

**Interface**:
```typescript
interface ToolDispatcher {
  registerTool(tool: ToolComponent): void;
  unregisterTool(name: string): void;
  dispatch(call: ToolCall): Promise<ToolResult>;
  getAvailableTools(): ToolSchema[];
}

interface ToolCall {
  id: string;
  name: string;
  arguments: any;
}

interface ToolResult {
  toolCallId: string;
  success: boolean;
  output?: string;
  error?: string;
}
```

**Features**:
- Dynamic tool registration
- Error handling
- Execution timeout
- Result formatting

---

### 18. Compaction Engine (`components/agent/compaction-engine/`)

**Dependencies**: `session-manager`, `api-client`

**Purpose**: Automatic context window management

**Interface**:
```typescript
interface CompactionEngine {
  initialize(config: CompactionConfig): void;
  checkCompaction(session: Session): Promise<boolean>;
  compact(session: Session): Promise<Session>;
  getTokenCount(messages: Message[]): number;
}

interface CompactionConfig {
  enabled: boolean;
  proactiveThreshold: number;    // 0.0 - 1.0
  preserveRecentMessages: number;
  modelLimits: Record<string, number>;
}
```

**Algorithm**:
1. Calculate total tokens
2. If above threshold:
   a. Identify messages to preserve (recent N)
   b. Summarize older messages using LLM
   c. Insert summary message
   d. Continue with compressed context

**Summarization Prompt**:
```
Summarize the following conversation concisely, preserving key information:
- User intents and requests
- Actions taken by assistant
- Important decisions or findings

Conversation:
{messages}
```

---

### 19. Context Builder (`components/agent/context-builder/`)

**Dependencies**: `session-manager`, `tool-store`

**Purpose**: Build LLM context from session

**Interface**:
```typescript
interface ContextBuilder {
  buildContext(session: Session, options?: BuildOptions): LLMContext;
  addSystemPrompt(context: LLMContext, prompt: string): LLMContext;
  addTools(context: LLMContext, tools: ToolSchema[]): LLMContext;
}

interface LLMContext {
  messages: Message[];
  tools?: ToolSchema[];
  systemPrompt?: string;
}
```

**Features**:
- Message formatting
- Tool schema generation
- System prompt injection
- Context window management

---

### 20. Export Manager (`components/agent/export-manager/`)

**Dependencies**: `session-manager`

**Purpose**: Export sessions to various formats

**Interface**:
```typescript
interface ExportManager {
  exportToJsonl(session: Session): string;
  exportToMarkdown(session: Session): string;
  exportToHtml(session: Session): string;
  download(content: string, filename: string, type: string): void;
}
```

---

## UI Components

### 21. Chat UI (`components/ui/chat-ui/`)

**Dependencies**: `event-bus`

**Purpose**: Message display and input

**Features**:
- Message rendering (user, assistant, tool calls, tool results)
- Code highlighting
- Markdown rendering
- Image display
- Message input with multiline support
- @file references

**Events**:
- `message:send` - User sent message
- `message:edit` - User edited message
- `command:invoke` - User invoked /command

---

### 22. Session Tree UI (`components/ui/session-tree-ui/`)

**Dependencies**: `session-manager`, `event-bus`

**Purpose**: Visualize and navigate session branches

**Features**:
- Tree visualization
- Branch selection
- Node labeling
- Search/filter
- Fork creation

---

### 23. Tool Approval UI (`components/ui/tool-approval-ui/`)

**Dependencies**: `tool-store`, `event-bus`

**Purpose**: Review and approve pending tools

**Features**:
- SKILL.md preview
- Syntax highlighting
- Diff view (for updates)
- Approve/Reject buttons
- Bulk operations

---

## Integration Components

### 24. GitHub Loader (`components/integrations/github-loader/`)

**Dependencies**: `opfs-provider`, `event-bus`

**Purpose**: Load repositories from GitHub

**Interface**:
```typescript
interface GitHubLoader {
  loadRepository(owner: string, repo: string, branch?: string): Promise<LoadResult>;
  getFileTree(owner: string, repo: string): Promise<FileTreeEntry[]>;
  downloadFile(url: string): Promise<string>;
}

interface LoadResult {
  fileCount: number;
  bytesDownloaded: number;
  errors: string[];
}
```

**Features**:
- Tree API for file listing
- Blob download
- Parallel downloads
- Progress reporting
- Error handling

---

## Component Composition

### Example: Building the Full Agent

```typescript
// 1. Initialize core
const eventBus = new EventBus();
const opfsProvider = new OPFSProvider();
const indexeddbProvider = new IndexedDBProvider();
const messageBridge = new MessageBridge();
const apiClient = new APIClient();

// 2. Initialize storage
const fileStore = new FileStore({ opfsProvider, eventBus });
const sessionStore = new SessionStore({ indexeddbProvider, eventBus });
const toolStore = new ToolStore({ opfsProvider, indexeddbProvider });

// 3. Initialize tools
const tools = {
  read: new ReadTool({ fileStore }),
  write: new WriteTool({ fileStore }),
  edit: new EditTool({ fileStore }),
  ls: new LsTool({ fileStore }),
  grep: new GrepTool({ fileStore }),
  find: new FindTool({ fileStore }),
  js: new JsTool({ fileStore })
};

// 4. Initialize agent
const sessionManager = new SessionManager({ sessionStore, eventBus });
const toolDispatcher = new ToolDispatcher({ eventBus });
Object.values(tools).forEach(tool => toolDispatcher.registerTool(tool));

const compactionEngine = new CompactionEngine({ 
  sessionManager, 
  apiClient,
  config: { enabled: true, proactiveThreshold: 0.8 }
});

const contextBuilder = new ContextBuilder({ sessionManager, toolStore });
const exportManager = new ExportManager({ sessionManager });

// 5. Initialize UI
const chatUi = new ChatUi({ eventBus });
const sessionTreeUi = new SessionTreeUi({ sessionManager, eventBus });
const toolApprovalUi = new ToolApprovalUi({ toolStore, eventBus });

// 6. Wire up message bridge
messageBridge.onMessageFromWorker(async (msg) => {
  switch (msg.type) {
    case 'tool_call':
      const result = await toolDispatcher.dispatch(msg.payload);
      messageBridge.postToWorker({ 
        id: msg.id, 
        type: 'tool_result', 
        payload: result 
      });
      break;
    // ... handle other message types
  }
});

// 7. Start
await Promise.all([
  opfsProvider.initialize(),
  indexeddbProvider.initialize(),
  messageBridge.initialize()
]);

eventBus.publish('system:ready', { timestamp: Date.now() });
```

## Testing Strategy

### Unit Tests
Each component has isolated unit tests with mocked dependencies:

```typescript
// Example: read-tool.spec.ts
describe('ReadTool', () => {
  let tool: ReadTool;
  let mockFileStore: jest.Mocked<FileStore>;

  beforeEach(() => {
    mockFileStore = {
      read: jest.fn()
    } as any;
    tool = new ReadTool({ fileStore: mockFileStore });
  });

  it('should read file with line numbers', async () => {
    mockFileStore.read.mockResolvedValue({
      content: 'line1\nline2\nline3',
      lines: ['line1', 'line2', 'line3']
    });

    const result = await tool.execute({ path: 'test.txt' });
    
    expect(result).toBe('1 | line1\n2 | line2\n3 | line3');
  });

  it('should respect offset and limit', async () => {
    mockFileStore.read.mockResolvedValue({
      content: 'line1\nline2\nline3\nline4',
      lines: ['line1', 'line2', 'line3', 'line4']
    });

    const result = await tool.execute({ path: 'test.txt', offset: 2, limit: 1 });
    
    expect(result).toBe('2 | line2');
  });
});
```

### Integration Tests
Test component interactions:

```typescript
// Example: tool-dispatcher.integration.spec.ts
describe('ToolDispatcher Integration', () => {
  it('should route tool calls to correct tool', async () => {
    const eventBus = new EventBus();
    const fileStore = new FileStore({ /* ... */ });
    const dispatcher = new ToolDispatcher({ eventBus });
    
    const readTool = new ReadTool({ fileStore });
    dispatcher.registerTool(readTool);

    const result = await dispatcher.dispatch({
      id: '1',
      name: 'read',
      arguments: { path: 'test.txt' }
    });

    expect(result.success).toBe(true);
  });
});
```

### E2E Tests
Full user workflows:

```typescript
// Example: full-workflow.e2e.spec.ts
describe('Full Agent Workflow', () => {
  it('should complete conversation with tool calls', async () => {
    const agent = await createTestAgent();
    
    // User sends message
    await agent.sendMessage('Read the main.rs file');
    
    // Agent calls read tool
    await agent.waitForToolCall('read');
    
    // Tool returns result
    await agent.provideToolResult({ content: 'fn main() {}' });
    
    // Agent responds
    const response = await agent.waitForResponse();
    expect(response).toContain('fn main()');
  });
});
```

## Deployment Strategy

### Individual Component Deployment
Each component can be deployed as:
1. **npm package**: `npm install @agent/read-tool`
2. **CDN**: `<script src="https://cdn.agent.dev/read-tool.js">`
3. **Git submodule**: `git submodule add ...`

### Versioning
- Semantic versioning for each component
- Compatibility matrix (which versions work together)
- Automated dependency updates

### Documentation
Each component includes:
- `README.md` - Usage and API
- `API.md` - Complete interface documentation
- `EXAMPLES.md` - Usage examples
- `CHANGELOG.md` - Version history

## Development Workflow

### Creating a New Component

```bash
# 1. Generate component scaffold
npm run create-component -- --name my-tool --category tools

# 2. Implement interface
cd components/tools/my-tool
cat > src/my-tool.ts << 'EOF'
export class MyTool implements ToolComponent {
  async execute(input: MyToolInput): Promise<MyToolOutput> {
    // Implementation
  }
}
EOF

# 3. Write tests
npm run test

# 4. Build
npm run build

# 5. Document
npm run docs

# 6. Publish
npm publish
```

### Component Checklist

Before a component is considered complete:
- [ ] Interface defined and documented
- [ ] Implementation complete
- [ ] Unit tests (100% coverage)
- [ ] Integration tests
- [ ] README with examples
- [ ] Performance benchmarks
- [ ] Browser compatibility verified
- [ ] Security review (if applicable)

## Migration from Monolithic

### Phase 1: Extract Core
1. Create `event-bus` component
2. Create `opfs-provider` component
3. Create `indexeddb-provider` component
4. Migrate existing code to use components

### Phase 2: Extract Tools
1. Port each tool to standalone component
2. Add comprehensive tests
3. Update tool dispatcher

### Phase 3: Extract Agent Logic
1. Create `session-manager` component
2. Create `compaction-engine` component
3. Create `context-builder` component

### Phase 4: Extract UI
1. Create `chat-ui` component
2. Create `session-tree-ui` component
3. Create `tool-approval-ui` component

### Phase 5: Polish
1. Performance optimization
2. Documentation
3. Examples
4. Community contribution guidelines

## Conclusion

This architecture enables:
- **Independent development**: Teams can work on components in parallel
- **Selective adoption**: Users can use only the components they need
- **Easy testing**: Each component is testable in isolation
- **Long-term maintainability**: Small, focused components are easier to maintain
- **Community contributions**: Clear interfaces make it easy to contribute new components

The Unix philosophy applied to web components: small pieces, loosely joined, working together through standard interfaces.
