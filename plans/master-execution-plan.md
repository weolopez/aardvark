# Master Execution Plan: Aardvark Browser Coding Agent

## Executive Summary

This plan provides a complete roadmap from the current Phase 1 foundation to a fully functional browser-based coding agent as defined in ARCHITECTURE.md. The system uses a composable component architecture with Rust/WASM core logic, vanilla JavaScript tooling, and web-native storage (OPFS + IndexedDB).

**Current Status:** Phase 1 Complete (5 core infrastructure components)
**Total Phases:** 6 phases
**Estimated Timeline:** 10-12 weeks
**Team Size:** 1-2 developers

---

## Phase Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: Core Infrastructure ✓ COMPLETE                       │
│  Event Bus, OPFS Provider, IndexedDB Provider,                 │
│  Message Bridge, API Client                                    │
│  Duration: 3 weeks | Status: DONE                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: Storage Layer (Weeks 4-5)                            │
│  High-level storage abstractions on top of core providers      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: Tool System (Weeks 6-7)                              │
│  Built-in tools, tool runner, dynamic tool support             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: Rust/WASM Agent Core (Weeks 8-9)                     │
│  Agent logic, session management, LLM integration              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 5: UI Components (Weeks 10-11)                          │
│  Chat interface, session tree, tool approval UI                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 6: Integration & Delivery (Week 12)                     │
│  System integration, testing, optimization, deployment         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core Infrastructure ✓ COMPLETE

**Status:** DONE  
**Duration:** 3 weeks  
**Components:** 5/5 complete

### Completed Components

| Component | Status | Tests | Demo | Docs |
|-----------|--------|-------|------|------|
| Event Bus | ✅ Complete | ✅ 14 tests | ✅ Interactive | ✅ README |
| OPFS Provider | ✅ Complete | ✅ 10 tests | ✅ File browser | ✅ README |
| IndexedDB Provider | ✅ Complete | ✅ 9 tests | ✅ Data browser | ✅ README |
| Message Bridge | ✅ Complete | ✅ 8 tests | ✅ Worker demo | ✅ README |
| API Client | ✅ Complete | ✅ 12 tests | ✅ Chat demo | ✅ README |

### Integration Tests
- ✅ 12 cross-component integration tests
- ✅ 5 performance benchmarks
- ✅ Browser compatibility verification

### Deliverables
- [x] All 5 core components implemented
- [x] Unit tests for each component (>90% coverage)
- [x] Integration tests passing
- [x] Interactive demos for each component
- [x] Documentation complete

---

## Phase 2: Storage Components

**Status:** NOT STARTED  
**Duration:** 2 weeks (Weeks 4-5)  
**Dependencies:** Phase 1  
**Goal:** Build high-level storage abstractions

### 2.1 File Store

**Purpose:** Repository file management on top of OPFS

**Interface:**
```javascript
interface FileStore {
  // Repository management
  createRepo(name: string): Promise<void>;
  deleteRepo(name: string): Promise<void>;
  listRepos(): Promise<string[]>;
  
  // File operations within repo
  read(repo: string, path: string): Promise<string>;
  write(repo: string, path: string, content: string): Promise<void>;
  delete(repo: string, path: string): Promise<void>;
  exists(repo: string, path: string): Promise<boolean>;
  
  // Directory operations
  list(repo: string, path: string): Promise<DirEntry[]>;
  walk(repo: string, path: string): Promise<string[]>;
  
  // GitHub integration
  loadFromGitHub(repo: string, owner: string, repo: string): Promise<void>;
}
```

**Features:**
- Multi-repository support
- GitHub repository loading
- File tree caching
- Change notifications via Event Bus

**Files to Create:**
```
components/storage/file-store/
├── src/
│   ├── index.js
│   ├── file-store.js
│   └── github-loader.js
├── tests/
│   ├── unit/
│   │   └── file-store.spec.html
│   └── integration/
│       └── github-loading.spec.html
├── demo/
│   └── index.html
└── README.md
```

**Week 4, Days 1-5:**
- Day 1-2: Core file operations
- Day 3: GitHub loader integration
- Day 4: Multi-repo support
- Day 5: Tests and documentation

### 2.2 Session Store

**Purpose:** Session tree persistence and management

**Interface:**
```javascript
interface SessionStore {
  // Session CRUD
  createSession(metadata: SessionMetadata): Promise<string>;
  getSession(sessionId: string): Promise<Session>;
  updateSession(sessionId: string, updates: Partial<Session>): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  listSessions(): Promise<SessionSummary[]>;
  
  // Node operations
  addNode(sessionId: string, parentId: string, node: Node): Promise<string>;
  updateNode(sessionId: string, nodeId: string, updates: Partial<Node>): Promise<void>;
  getNode(sessionId: string, nodeId: string): Promise<Node>;
  getPath(sessionId: string, nodeId: string): Promise<Node[]>;
  
  // Tree operations
  getTree(sessionId: string): Promise<SessionTree>;
  getHistory(sessionId: string, nodeId: string): Promise<Node[]>;
  branch(sessionId: string, fromNodeId: string): Promise<string>;
}

interface Session {
  sessionId: string;
  name: string;
  repo?: string;
  root: Node;
  currentNodeId: string;
  created: number;
  modified: number;
}

interface Node {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parentId?: string;
  children: string[];
  toolCalls?: ToolCall[];
  timestamp: number;
}
```

**Features:**
- Hierarchical session trees
- Branching support
- History reconstruction
- Event notifications

**Week 4, Days 6-10:**
- Day 6: Basic CRUD operations
- Day 7: Tree and path operations
- Day 8: Branching support
- Day 9: History reconstruction
- Day 10: Tests and documentation

### 2.3 Tool Store

**Purpose:** Tool definitions and pending approvals

**Interface:**
```javascript
interface ToolStore {
  // Tool discovery
  scanTools(repo: string): Promise<ToolDefinition[]>;
  getTool(repo: string, name: string): Promise<ToolDefinition>;
  
  // Pending tools (approval queue)
  addPendingTool(tool: PendingTool): Promise<string>;
  getPendingTool(toolId: string): Promise<PendingTool>;
  listPendingTools(): Promise<PendingTool[]>;
  approveTool(toolId: string): Promise<void>;
  rejectTool(toolId: string): Promise<void>;
  
  // SKILL.md parsing
  parseSkillMd(content: string): Promise<{ frontmatter: object, instructions: string }>;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
  allowedTools: string[];
  version: string;
  repo: string;
  skillMdPath: string;
}

interface PendingTool {
  toolId: string;
  name: string;
  description: string;
  skillMdContent: string;
  status: 'pending' | 'approved' | 'rejected';
  created: number;
  requestedBy: 'llm' | 'user';
}
```

**Features:**
- OPFS .tools/ directory scanning
- SKILL.md parsing (YAML frontmatter + markdown)
- Approval workflow
- Tool versioning

**Week 5, Days 1-5:**
- Day 1: Tool scanning from OPFS
- Day 2: SKILL.md parser
- Day 3: Pending approval system
- Day 4: Tool registry caching
- Day 5: Tests and documentation

### 2.4 History Store

**Purpose:** Tool execution history

**Interface:**
```javascript
interface HistoryStore {
  recordExecution(record: ExecutionRecord): Promise<void>;
  getExecutions(sessionId: string, options?: QueryOptions): Promise<ExecutionRecord[]>;
  getExecution(executionId: string): Promise<ExecutionRecord>;
  getStats(sessionId: string): Promise<ExecutionStats>;
}

interface ExecutionRecord {
  executionId: string;
  sessionId: string;
  nodeId: string;
  toolName: string;
  arguments: object;
  result: ToolResult;
  timestamp: number;
  duration: number;
}
```

**Week 5, Days 6-10:**
- Day 6: Basic recording
- Day 7: Querying and filtering
- Day 8: Statistics aggregation
- Day 9: Tests
- Day 10: Documentation and demos

### Phase 2 Deliverables

- [ ] File Store with GitHub integration
- [ ] Session Store with branching
- [ ] Tool Store with SKILL.md support
- [ ] History Store
- [ ] All components tested
- [ ] Interactive demos
- [ ] Documentation

---

## Phase 3: Tool System

**Status:** NOT STARTED  
**Duration:** 2 weeks (Weeks 6-7)  
**Dependencies:** Phase 2  
**Goal:** Implement tool execution system

### 3.1 Built-in Tools

**Tools to Implement:**

#### read-tool
```javascript
// Read file contents with line numbers
read({ path: string, offset?: number, limit?: number }): Promise<string>
```

#### write-tool
```javascript
// Write or overwrite file
write({ path: string, content: string }): Promise<void>
```

#### edit-tool
```javascript
// Surgical find-and-replace
edit({ path: string, oldText: string, newText: string }): Promise<void>
```

#### ls-tool
```javascript
// List directory contents
ls({ path: string, detailed?: boolean }): Promise<string>
```

#### grep-tool
```javascript
// Search file contents
grep({ pattern: string, path?: string, ignoreCase?: boolean }): Promise<string>
```

#### find-tool
```javascript
// Find files by pattern
find({ pattern: string, path?: string }): Promise<string[]>
```

#### js-tool
```javascript
// Execute JavaScript code
js({ code: string }): Promise<any>
// Available globals: read, write, grep, find, console
```

**Week 6:**
- Days 1-2: read, write, edit tools
- Days 3-4: ls, grep, find tools
- Day 5: js tool

### 3.2 Tool Runner

**Purpose:** Execute tools in main thread

**Interface:**
```javascript
interface ToolRunner {
  execute(toolName: string, args: object, context: ToolContext): Promise<ToolResult>;
  registerTool(name: string, implementation: ToolFunction): void;
  loadDynamicTool(repo: string, name: string): Promise<void>;
}

interface ToolContext {
  fileStore: FileStore;
  eventBus: EventBus;
  repo: string;
}

interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

**Features:**
- Built-in tool registry
- Dynamic tool loading from SKILL.md
- Sandboxed execution (no access to window/document)
- Error handling and timeouts

**Week 6, Days 6-10:**
- Day 6: Core runner architecture
- Day 7: Built-in tool registration
- Day 8: Dynamic tool loading
- Day 9: Sandboxing and security
- Day 10: Tests and docs

### 3.3 Skill Md Parser

**Purpose:** Parse SKILL.md tool definitions

**Interface:**
```javascript
interface SkillMdParser {
  parse(content: string): {
    frontmatter: {
      name: string;
      description: string;
      allowedTools?: string[];
      version?: string;
    };
    instructions: string;
  };
}
```

**Week 7, Days 1-2:**
- YAML frontmatter parsing
- Markdown content extraction
- Validation

### 3.4 Dynamic Tool Executor

**Purpose:** Execute tools defined in SKILL.md

**Interface:**
```javascript
interface DynamicToolExecutor {
  execute(skillMd: string, args: object, context: ToolContext): Promise<ToolResult>;
}
```

**Features:**
- Parse SKILL.md instructions
- Execute as JavaScript
- Access to allowed tools only
- Timeout protection

**Week 7, Days 3-5:**
- Instruction parsing
- Execution environment
- Tool access control

### Phase 3 Deliverables

- [ ] 7 built-in tools implemented
- [ ] Tool Runner with registry
- [ ] SKILL.md parser
- [ ] Dynamic tool executor
- [ ] All tools tested
- [ ] Security review

---

## Phase 4: Rust/WASM Agent Core

**Status:** NOT STARTED  
**Duration:** 2 weeks (Weeks 8-9)  
**Dependencies:** Phase 3  
**Goal:** Core agent logic in Rust/WASM

### 4.1 Project Setup

**Week 8, Day 1:**
```bash
# Initialize Rust project
cargo init --lib agent-core
cd agent-core

# Add dependencies to Cargo.toml
```

**Dependencies:**
```toml
[dependencies]
wasm-bindgen = "0.2"
wasm-bindgen-futures = "0.4"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
serde-wasm-bindgen = "0.6"
js-sys = "0.3"
web-sys = { version = "0.3", features = ["console"] }
uuid = { version = "1.0", features = ["v4", "js"] }
chrono = { version = "0.4", features = ["serde"] }
getrandom = { version = "0.2", features = ["js"] }
```

### 4.2 Session Tree (Rust)

**Purpose:** Branching conversation history

**Interface:**
```rust
#[wasm_bindgen]
pub struct SessionTree {
    session_id: String,
    root: Node,
    current: String, // node id
}

#[wasm_bindgen]
impl SessionTree {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self;
    
    pub fn append_message(&mut self, role: String, content: String, tool_calls: Option<JsValue>) -> String;
    pub fn branch(&mut self, from_node_id: String) -> String;
    pub fn get_history(&self) -> JsValue; // Returns Vec<Message>
    pub fn get_tree(&self) -> JsValue; // Returns full tree
    pub fn set_current(&mut self, node_id: String);
}
```

**Week 8, Days 2-4:**
- Node structure
- Tree operations
- History reconstruction
- Branching support

### 4.3 Agent Core

**Purpose:** Main LLM loop and orchestration

**Interface:**
```rust
#[wasm_bindgen]
pub struct AgentCore {
    api_key: String,
    model: String,
    session: SessionTree,
    config: AgentConfig,
}

#[wasm_bindgen]
impl AgentCore {
    #[wasm_bindgen(constructor)]
    pub fn new(api_key: String, model: String) -> Self;
    
    // Main chat loop
    pub async fn chat(&mut self, message: String) -> JsValue;
    
    // Tool management
    pub fn scan_tools(&self) -> JsValue; // Returns Vec<Tool>
    pub async fn execute_tool(&self, name: String, args: String) -> JsValue;
    
    // Session management
    pub fn get_session(&self) -> JsValue;
    pub fn load_session(&mut self, session_json: String);
    
    // Events (via callbacks)
    pub fn on_step(&mut self, callback: js_sys::Function);
    pub fn on_tool_call(&mut self, callback: js_sys::Function);
    pub fn on_done(&mut self, callback: js_sys::Function);
}
```

**Features:**
- LLM conversation loop
- Tool discovery and dispatch
- Session persistence callbacks
- Step-by-step progress events

**Week 8, Days 5-10:**
- Day 5: Core structure
- Day 6: LLM integration
- Day 7: Tool dispatch
- Day 8: Event system
- Day 9: Error handling
- Day 10: Testing

### 4.4 Tool Dispatcher

**Purpose:** Route tool calls to appropriate handlers

**Interface:**
```rust
pub struct ToolDispatcher {
    tools: HashMap<String, ToolDefinition>,
}

impl ToolDispatcher {
    pub fn register_tool(&mut self, tool: ToolDefinition);
    pub async fn dispatch(&self, name: &str, args: &str) -> Result<ToolResult, ToolError>;
    pub fn get_available_tools(&self) -> Vec<ToolDefinition>;
}
```

**Week 9, Days 1-2:**
- Tool registry
- Dispatch logic
- Result validation

### 4.5 Compaction Engine

**Purpose:** Automatic context window management

**Interface:**
```rust
pub struct CompactionEngine {
    config: CompactionConfig,
}

impl CompactionEngine {
    pub fn should_compact(&self, token_count: usize) -> bool;
    pub fn compact(&self, history: Vec<Message>) -> Vec<Message>;
}
```

**Features:**
- Token counting
- Automatic summarization
- Proactive and reactive compaction

**Week 9, Days 3-4:**
- Token estimation
- Summarization logic
- Compaction triggers

### 4.6 Export Manager

**Purpose:** Session export to external formats

**Interface:**
```rust
pub struct ExportManager;

impl ExportManager {
    pub fn to_jsonl(session: &SessionTree) -> String;
    pub fn to_markdown(session: &SessionTree) -> String;
}
```

**Week 9, Days 5-7:**
- JSONL format
- Markdown format
- Download integration

### 4.7 JavaScript Bridge

**Purpose:** WASM ↔ JavaScript communication

**Functions to expose:**
```rust
// Called from JavaScript
#[wasm_bindgen(js_name = "scanTools")]
pub async fn scan_tools() -> JsValue;

#[wasm_bindgen(js_name = "executeTool")]
pub async fn execute_tool(name: String, args: String) -> JsValue;

#[wasm_bindgen(js_name = "persistSession")]
pub async fn persist_session(session_json: String);
```

**Week 9, Days 8-10:**
- Bridge functions
- Error handling
- Testing

### Phase 4 Deliverables

- [ ] Rust project structure
- [ ] Session Tree in Rust
- [ ] Agent Core with LLM loop
- [ ] Tool Dispatcher
- [ ] Compaction Engine
- [ ] Export Manager
- [ ] JS bridge functions
- [ ] WASM compilation working
- [ ] Integration tests

---

## Phase 5: UI Components

**Status:** NOT STARTED  
**Duration:** 2 weeks (Weeks 10-11)  
**Dependencies:** Phase 4  
**Goal:** User interface components

### 5.1 Chat UI

**Purpose:** Main chat interface

**Features:**
- Message display (user/assistant)
- Tool call visualization
- Streaming responses
- Input with history
- Command palette (/clear, /export, etc.)

**Week 10, Days 1-5:**
- Day 1: Component structure
- Day 2: Message rendering
- Day 3: Input handling
- Day 4: Tool display
- Day 5: Commands

### 5.2 Session Tree UI

**Purpose:** Visual session branching

**Features:**
- Tree visualization
- Branch creation
- Node selection
- History view

**Week 10, Days 6-10:**
- Day 6: Tree layout
- Day 7: Branching UI
- Day 8: Navigation
- Day 9: Persistence
- Day 10: Polish

### 5.3 Tool Approval UI

**Purpose:** Review and approve dynamic tools

**Features:**
- SKILL.md display
- Syntax highlighting
- Approve/Reject buttons
- Pending queue

**Week 11, Days 1-3:**
- Day 1: Display component
- Day 2: Approval flow
- Day 3: Queue management

### 5.4 GitHub Loader UI

**Purpose:** Repository loading interface

**Features:**
- Owner/repo input
- Progress indicator
- File tree preview
- Error display

**Week 11, Days 4-5:**

### 5.5 Export UI

**Purpose:** Session export interface

**Features:**
- Format selection (JSONL/Markdown)
- Preview
- Download trigger

**Week 11, Days 6-7:**

### 5.6 Settings UI

**Purpose:** Configuration interface

**Features:**
- API key input
- Model selection
- Compaction settings
- Theme toggle

**Week 11, Days 8-10:**

### Phase 5 Deliverables

- [ ] Chat UI
- [ ] Session Tree UI
- [ ] Tool Approval UI
- [ ] GitHub Loader UI
- [ ] Export UI
- [ ] Settings UI
- [ ] All components tested
- [ ] Responsive design

---

## Phase 6: Integration & Delivery

**Status:** NOT STARTED  
**Duration:** 1 week (Week 12)  
**Dependencies:** Phase 5  
**Goal:** System integration and deployment

### 6.1 Main Application

**Files:**
```
www/
├── index.html          # Main entry
├── index.js            # App initialization
├── styles.css          # Global styles
└── app/
    ├── app.js          # Main app controller
    ├── router.js       # Simple routing
    └── state.js        # Global state management
```

**Week 12, Days 1-2:**
- App bootstrap
- Component wiring
- State management

### 6.2 End-to-End Testing

**Test Scenarios:**
1. Complete chat flow
2. Tool execution
3. Session branching
4. GitHub loading
5. Tool creation and approval
6. Session export
7. Error recovery

**Week 12, Days 3-4:**

### 6.3 Performance Optimization

**Tasks:**
- Bundle size analysis
- Lazy loading
- Caching strategies
- Worker optimization

**Week 12, Day 5:**

### 6.4 Documentation

**Documents:**
- User guide
- API reference
- Tool creation guide
- Deployment guide

**Week 12, Day 6:**

### 6.5 Deployment

**Setup:**
- GitHub Pages configuration
- Build scripts
- Release process

**Week 12, Days 7-10:**

### Phase 6 Deliverables

- [ ] Working application
- [ ] E2E tests passing
- [ ] Performance optimized
- [ ] Documentation complete
- [ ] Deployed to GitHub Pages
- [ ] Release v1.0.0

---

## Success Criteria

### Overall Project Success

The project is successful when:

1. **Functionality:**
   - ✅ Users can load GitHub repositories
   - ✅ Users can chat with AI about code
   - ✅ AI can read, write, and edit files
   - ✅ AI can create custom tools (with approval)
   - ✅ Sessions support branching
   - ✅ Sessions can be exported

2. **Quality:**
   - ✅ All phases complete
   - ✅ >90% test coverage
   - ✅ No critical bugs
   - ✅ Performance acceptable (<2s response time)

3. **Documentation:**
   - ✅ User guide complete
   - ✅ API documentation
   - ✅ Architecture documentation
   - ✅ Tool creation guide

4. **Deployment:**
   - ✅ Live on GitHub Pages
   - ✅ Works in Chrome, Firefox, Safari
   - ✅ Mobile responsive

---

## Risk Management

### High Risks

| Risk | Mitigation | Owner |
|------|-----------|-------|
| WASM complexity | Prototype early, test often | Dev 1 |
| LLM API costs | Use free tier, mock in tests | Dev 1 |
| Browser compatibility | Test in all browsers | Dev 2 |
| Performance issues | Profile early, optimize | Dev 1 |

### Medium Risks

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Scope creep | Strict phase adherence | PM |
| Storage quota | Monitor usage, compress | Dev 1 |
| Security concerns | Code review, sandboxing | Dev 2 |

---

## Resource Requirements

### Development

- **Developers:** 1-2
- **Duration:** 12 weeks
- **Skills:**
  - JavaScript (ES2020+)
  - Rust (basic)
  - WASM concepts
  - Web APIs (OPFS, IndexedDB, Workers)

### Tools

- Code editor (VS Code)
- Browser DevTools
- Rust toolchain
- Python (for local server)
- Git

### Services

- GitHub (repo, pages)
- Gemini API (free tier)

---

## Timeline Summary

| Phase | Duration | Start | End | Deliverables |
|-------|----------|-------|-----|--------------|
| 1: Core | 3 weeks | Week 1 | Week 3 | 5 core components ✓ |
| 2: Storage | 2 weeks | Week 4 | Week 5 | 4 storage components |
| 3: Tools | 2 weeks | Week 6 | Week 7 | Tool system |
| 4: WASM | 2 weeks | Week 8 | Week 9 | Rust agent core |
| 5: UI | 2 weeks | Week 10 | Week 11 | UI components |
| 6: Delivery | 1 week | Week 12 | Week 12 | Integration & deploy |
| **Total** | **12 weeks** | | | |

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize features** if scope needs reduction
3. **Begin Phase 2** when ready
4. **Weekly check-ins** to track progress
5. **Adjust timeline** based on actual velocity

---

## Appendix A: Component Dependencies

```
Core (Phase 1) ← Storage (Phase 2) ← Tools (Phase 3) ← WASM (Phase 4) ← UI (Phase 5)
     ↑                ↑                  ↑                ↑              ↑
     └──────────────────────────────────────────────────────────────────┘
                              Main App (Phase 6)
```

## Appendix B: Technology Decisions

| Decision | Rationale |
|----------|-----------|
| Rust/WASM | Performance, type safety |
| Vanilla JS | No build step, fast iteration |
| Lit HTML | Efficient rendering, small footprint |
| Tailwind CDN | No build, rapid styling |
| OPFS | Fast, private file storage |
| IndexedDB | Structured data, queries |
| ES Modules | Native, no bundlers |

## Appendix C: File Structure (Final)

```
aardvark/
├── Cargo.toml              # Rust workspace
├── src/                    # Rust source
│   ├── lib.rs
│   ├── agent.rs
│   ├── session.rs
│   ├── tools.rs
│   └── compaction.rs
│
├── components/
│   ├── core/              # Phase 1 (COMPLETE)
│   ├── storage/           # Phase 2
│   ├── tools/             # Phase 3
│   └── ui/                # Phase 5
│
├── www/                   # Web assets
│   ├── index.html
│   ├── index.js
│   ├── app/
│   └── tests/
│
├── pkg/                   # Generated WASM
│
├── plans/                 # Documentation
│   ├── master-execution-plan.md
│   ├── 01-phase-1-extract-core.md
│   └── ...
│
└── tests/                 # Test suites
    ├── integration/
    └── e2e/
```

---

**Document Status:** Draft  
**Last Updated:** 2026-02-07  
**Author:** Development Team  
**Reviewers:** TBD
