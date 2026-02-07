# Phase 2 Plan: Storage Components

## Overview

**Status:** NOT STARTED  
**Duration:** 2 weeks (Weeks 4-5)  
**Dependencies:** Phase 1 Complete (Event Bus, OPFS Provider, IndexedDB Provider, Message Bridge, API Client)  
**Goal:** Build high-level storage abstractions on top of Phase 1 core providers

Phase 2 creates the storage layer that bridges the low-level core providers (OPFS and IndexedDB) with the application logic. These components provide repository management, session persistence, tool definitions, and execution history.

---

## Philosophy

Building on the Unix philosophy from Phase 1:
- **Each storage component handles one data domain** (files, sessions, tools, history)
- **Built on core providers** - no direct OPFS/IndexedDB access, only through providers
- **Event-driven** - publishes changes via Event Bus for reactive UI updates
- **Composable** - storage components can work together (e.g., Tool Store uses File Store to scan OPFS)

---

## Components to Build

### 1. File Store (`components/storage/file-store/`)
**Priority:** P0 (Critical - all file operations)
**Effort:** 5 days
**Dependencies:** OPFS Provider, Event Bus

**Purpose:** Repository file management on top of OPFS Provider

**Why:** Provides high-level file operations with repository namespacing, GitHub integration, and change notifications.

**Interface:**
```javascript
interface FileStore {
  // Repository management
  createRepo(name: string): Promise<void>;
  deleteRepo(name: string): Promise<void>;
  listRepos(): Promise<RepoInfo[]>;
  getRepoInfo(name: string): Promise<RepoInfo>;
  
  // File operations within repo
  read(repo: string, path: string): Promise<string>;
  write(repo: string, path: string, content: string): Promise<void>;
  delete(repo: string, path: string): Promise<void>;
  exists(repo: string, path: string): Promise<boolean>;
  
  // Directory operations
  list(repo: string, path: string): Promise<DirEntry[]>;
  walk(repo: string, path: string): Promise<string[]>;
  glob(repo: string, pattern: string): Promise<string[]>;
  
  // Metadata
  getMetadata(repo: string, path: string): Promise<FileMetadata>;
  getRepoStats(repo: string): Promise<RepoStats>;
  
  // GitHub integration
  loadFromGitHub(repo: string, owner: string, repoName: string, branch?: string): Promise<LoadProgress>;
  
  // Events (published via Event Bus)
  // 'file:created', 'file:updated', 'file:deleted'
  // 'repo:created', 'repo:deleted', 'repo:loaded'
}

interface RepoInfo {
  name: string;
  created: number;
  modified: number;
  fileCount: number;
  totalSize: number;
}

interface DirEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
}

interface FileMetadata {
  path: string;
  size: number;
  created: number;
  modified: number;
  checksum?: string;
}

interface RepoStats {
  fileCount: number;
  directoryCount: number;
  totalSize: number;
  languages: Map<string, number>; // extension -> file count
}

interface LoadProgress {
  totalFiles: number;
  loadedFiles: number;
  currentFile: string;
  percentage: number;
}
```

**Implementation Details:**
- **Repository namespacing**: Each repo is a directory in OPFS (`/repos/{name}/`)
- **Caching**: File tree cache for fast directory listings
- **Change tracking**: Publishes events for all mutations
- **GitHub loader**: Fetches repos via GitHub API, streams files to OPFS
- **Path normalization**: Handles `.`, `..`, absolute vs relative paths

**Key Events Published:**
```javascript
// File events
{ type: 'file:created', repo: 'myproject', path: 'src/main.js', size: 1234 }
{ type: 'file:updated', repo: 'myproject', path: 'src/main.js', size: 1500 }
{ type: 'file:deleted', repo: 'myproject', path: 'src/old.js' }

// Repository events  
{ type: 'repo:created', repo: 'myproject' }
{ type: 'repo:deleted', repo: 'myproject' }
{ type: 'repo:loading', repo: 'myproject', owner: 'facebook', name: 'react' }
{ type: 'repo:loaded', repo: 'myproject', fileCount: 150 }
{ type: 'repo:load-error', repo: 'myproject', error: 'Repository not found' }
```

**GitHub Loader Features:**
- Fetch repository tree via GitHub API
- Stream files to OPFS (handles large repos)
- Progress reporting via events
- Branch/tag selection
- Rate limit handling
- Authentication support (token)

**Testing Requirements:**
- [ ] Create/delete repositories
- [ ] Read/write/delete files
- [ ] Nested directory operations
- [ ] Path normalization
- [ ] File tree caching
- [ ] GitHub loading (mock API)
- [ ] Progress events
- [ ] Concurrent operations
- [ ] Error handling (not found, permission denied)

**Files to Create:**
```
components/storage/file-store/
├── src/
│   ├── index.js              # Main export
│   ├── file-store.js         # Core implementation
│   ├── github-loader.js      # GitHub API integration
│   ├── path-utils.js         # Path normalization
│   └── types.js              # JSDoc type definitions
├── tests/
│   ├── unit/
│   │   ├── file-store.spec.html
│   │   ├── github-loader.spec.html
│   │   └── path-utils.spec.html
│   └── integration/
│       └── github-loading.spec.html
├── demo/
│   └── index.html            # Interactive file browser with GitHub loading
├── README.md
└── package.json
```

**Week 4 Schedule:**
- **Day 1-2:** Core file operations (read, write, delete, exists)
- **Day 3:** Directory operations (list, walk, glob) + caching
- **Day 4:** GitHub loader with progress tracking
- **Day 5:** Tests, documentation, demo

---

### 2. Session Store (`components/storage/session-store/`)
**Priority:** P0 (Critical - conversation persistence)
**Effort:** 5 days
**Dependencies:** IndexedDB Provider, Event Bus

**Purpose:** Session tree persistence and management with branching support

**Why:** Provides hierarchical conversation trees with branching, history reconstruction, and efficient querying for the agent to rebuild context.

**Interface:**
```javascript
interface SessionStore {
  // Session CRUD
  createSession(metadata: SessionMetadata): Promise<string>; // returns sessionId
  getSession(sessionId: string): Promise<Session>;
  updateSession(sessionId: string, updates: Partial<Session>): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  listSessions(options?: ListOptions): Promise<SessionSummary[]>;
  
  // Node operations
  addNode(sessionId: string, parentId: string | null, node: NodeData): Promise<string>; // returns nodeId
  updateNode(sessionId: string, nodeId: string, updates: Partial<NodeData>): Promise<void>;
  getNode(sessionId: string, nodeId: string): Promise<Node>;
  deleteNode(sessionId: string, nodeId: string): Promise<void>;
  
  // Tree operations
  getTree(sessionId: string): Promise<SessionTree>;
  getHistory(sessionId: string, nodeId: string): Promise<Node[]>; // Path from root to node
  getBranch(sessionId: string, nodeId: string): Promise<Node[]>; // Current branch only
  getChildren(sessionId: string, nodeId: string): Promise<Node[]>;
  
  // Branching
  branch(sessionId: string, fromNodeId: string, newNodeData?: NodeData): Promise<string>; // returns new branch nodeId
  switchBranch(sessionId: string, nodeId: string): Promise<void>; // Set current node
  getBranches(sessionId: string): Promise<BranchInfo[]>;
  
  // Search
  searchSessions(query: string): Promise<SessionSummary[]>;
  searchNodes(sessionId: string, query: string): Promise<Node[]>;
  
  // Events
  // 'session:created', 'session:updated', 'session:deleted'
  // 'node:added', 'node:updated', 'node:deleted'
  // 'branch:switched', 'branch:created'
}

interface Session {
  sessionId: string;
  name: string;
  description?: string;
  repo?: string; // Associated repository name
  root: Node;
  currentNodeId: string;
  created: number;
  modified: number;
  messageCount: number;
}

interface SessionMetadata {
  name: string;
  description?: string;
  repo?: string;
}

interface SessionSummary {
  sessionId: string;
  name: string;
  description?: string;
  repo?: string;
  created: number;
  modified: number;
  messageCount: number;
}

interface Node {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parentId: string | null;
  children: string[];
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: number;
  metadata?: NodeMetadata;
}

interface NodeData {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  metadata?: NodeMetadata;
}

interface NodeMetadata {
  tokens?: number;
  model?: string;
  latency?: number;
  [key: string]: any;
}

interface BranchInfo {
  nodeId: string;
  name: string; // First 50 chars of content
  depth: number;
  messageCount: number;
  created: number;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: object;
}

interface ToolResult {
  callId: string;
  success: boolean;
  output?: string;
  error?: string;
}

interface ListOptions {
  limit?: number;
  offset?: number;
  sortBy?: 'created' | 'modified' | 'name';
  sortOrder?: 'asc' | 'desc';
}
```

**Implementation Details:**
- **Schema design**: IndexedDB stores for sessions, nodes, and indexes
- **Tree structure**: Nodes linked by parentId/children for flexible branching
- **Lazy loading**: Load nodes on-demand for large sessions
- **History reconstruction**: Walk from root to current node to build LLM context
- **Caching**: In-memory cache of current session for fast access
- **Search**: Full-text search on session names and node content

**IndexedDB Schema:**
```javascript
{
  version: 1,
  stores: {
    sessions: {
      keyPath: 'sessionId',
      indexes: [
        { name: 'created', keyPath: 'created' },
        { name: 'modified', keyPath: 'modified' },
        { name: 'repo', keyPath: 'repo' }
      ]
    },
    nodes: {
      keyPath: 'id',
      indexes: [
        { name: 'sessionId', keyPath: 'sessionId' },
        { name: 'parentId', keyPath: 'parentId' },
        { name: 'timestamp', keyPath: 'timestamp' }
      ]
    }
  }
}
```

**Key Events Published:**
```javascript
// Session events
{ type: 'session:created', sessionId: 'uuid-123', name: 'My Session' }
{ type: 'session:updated', sessionId: 'uuid-123', updates: { name: 'New Name' } }
{ type: 'session:deleted', sessionId: 'uuid-123' }

// Node events
{ type: 'node:added', sessionId: 'uuid-123', nodeId: 'node-456', parentId: 'node-123' }
{ type: 'node:updated', sessionId: 'uuid-123', nodeId: 'node-456' }
{ type: 'node:deleted', sessionId: 'uuid-123', nodeId: 'node-456' }

// Branch events
{ type: 'branch:created', sessionId: 'uuid-123', fromNodeId: 'node-123', newNodeId: 'node-789' }
{ type: 'branch:switched', sessionId: 'uuid-123', nodeId: 'node-789' }
```

**Testing Requirements:**
- [ ] Create/delete sessions
- [ ] Add/update/delete nodes
- [ ] Tree operations (getTree, getHistory, getBranch)
- [ ] Branching (create branch, switch branch)
- [ ] History reconstruction
- [ ] Search functionality
- [ ] Concurrent modifications
- [ ] Large session handling (1000+ nodes)
- [ ] Event publishing

**Files to Create:**
```
components/storage/session-store/
├── src/
│   ├── index.js
│   ├── session-store.js
│   ├── tree-operations.js
│   ├── search.js
│   └── types.js
├── tests/
│   ├── unit/
│   │   ├── session-store.spec.html
│   │   └── tree-operations.spec.html
│   └── integration/
│       └── branching.spec.html
├── demo/
│   └── index.html            # Session tree visualizer
├── README.md
└── package.json
```

**Week 4 Schedule (continued from File Store):**
- **Day 6-7:** Core CRUD operations (sessions, nodes)
- **Day 8:** Tree operations (history, branching)
- **Day 9:** Search and indexing
- **Day 10:** Tests, documentation, demo

---

### 3. Tool Store (`components/storage/tool-store/`)
**Priority:** P1 (High - tool definitions)
**Effort:** 5 days
**Dependencies:** File Store, Event Bus

**Purpose:** Tool definitions and pending approval workflow

**Why:** Manages tool discovery from OPFS, SKILL.md parsing, and the approval workflow for dynamically created tools.

**Interface:**
```javascript
interface ToolStore {
  // Tool discovery
  scanTools(repo: string): Promise<ToolDefinition[]>;
  scanAllRepos(): Promise<Map<string, ToolDefinition[]>>;
  getTool(repo: string, name: string): Promise<ToolDefinition>;
  listTools(repo?: string): Promise<ToolDefinition[]>;
  
  // SKILL.md operations
  parseSkillMd(content: string): Promise<ParsedSkillMd>;
  validateToolDefinition(def: ToolDefinition): ValidationResult;
  
  // Tool creation (via SKILL.md)
  createTool(repo: string, name: string, skillMd: string): Promise<void>;
  updateTool(repo: string, name: string, skillMd: string): Promise<void>;
  deleteTool(repo: string, name: string): Promise<void>;
  
  // Pending tools (approval workflow)
  addPendingTool(tool: PendingToolInput): Promise<string>; // returns toolId
  getPendingTool(toolId: string): Promise<PendingTool>;
  listPendingTools(): Promise<PendingTool[]>;
  approveTool(toolId: string): Promise<void>;
  rejectTool(toolId: string, reason?: string): Promise<void>;
  
  // Tool registry cache (in-memory)
  refreshRegistry(): Promise<void>;
  getRegistry(): Map<string, ToolDefinition>;
  
  // Events
  // 'tool:discovered', 'tool:updated', 'tool:deleted'
  // 'tool:pending', 'tool:approved', 'tool:rejected'
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JsonSchema;
  allowedTools: string[];
  version: string;
  repo: string;
  skillMdPath: string;
  instructions?: string; // Full markdown content (loaded on demand)
}

interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface JsonSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: any[];
  items?: JsonSchemaProperty;
}

interface ParsedSkillMd {
  frontmatter: SkillFrontmatter;
  instructions: string;
}

interface SkillFrontmatter {
  name: string;
  description: string;
  allowedTools?: string;
  version?: string;
  author?: string;
}

interface PendingToolInput {
  name: string;
  description: string;
  skillMdContent: string;
  requestedBy: 'llm' | 'user';
  reason?: string;
}

interface PendingTool extends PendingToolInput {
  toolId: string;
  status: 'pending' | 'approved' | 'rejected';
  created: number;
  reviewedAt?: number;
  reviewReason?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  field: string;
  message: string;
}
```

**SKILL.md Format:**
```markdown
---
name: count-lines
description: Count lines in a file
allowed-tools: "read"
version: 1.0.0
author: Claude
---

# Count Lines Tool

## Purpose
Count the number of lines in a specified file.

## Usage
Call with a file path to get the line count.

## Instructions

1. Read the file at the specified path using the read tool
2. Split content by newlines
3. Return the count as a number

## Example

Input: `{ "path": "src/main.rs" }`
Output: `42`
```

**Implementation Details:**
- **Discovery**: Scans `.tools/` directory in each repo for `SKILL.md` files
- **Caching**: In-memory registry of tool definitions for fast lookup
- **Validation**: Validates frontmatter and parameter schemas
- **Approval workflow**: Pending tools stored in IndexedDB, approved tools written to OPFS
- **Hot reload**: Registry refreshes when tools are added/updated

**Key Events Published:**
```javascript
// Tool events
{ type: 'tool:discovered', repo: 'myproject', tool: { name: 'count-lines', ... } }
{ type: 'tool:updated', repo: 'myproject', tool: { name: 'count-lines', ... } }
{ type: 'tool:deleted', repo: 'myproject', name: 'count-lines' }

// Pending tool events
{ type: 'tool:pending', toolId: 'uuid-789', name: 'custom-analyzer' }
{ type: 'tool:approved', toolId: 'uuid-789', repo: 'myproject', name: 'custom-analyzer' }
{ type: 'tool:rejected', toolId: 'uuid-789', reason: 'Too similar to existing tool' }
```

**Testing Requirements:**
- [ ] Tool scanning from OPFS
- [ ] SKILL.md parsing
- [ ] Frontmatter validation
- [ ] Tool CRUD operations
- [ ] Approval workflow
- [ ] Registry caching
- [ ] Error handling (invalid SKILL.md)

**Files to Create:**
```
components/storage/tool-store/
├── src/
│   ├── index.js
│   ├── tool-store.js
│   ├── skill-md-parser.js
│   ├── validator.js
│   └── types.js
├── tests/
│   ├── unit/
│   │   ├── tool-store.spec.html
│   │   └── skill-md-parser.spec.html
│   └── fixtures/
│       └── sample-skill.md
├── demo/
│   └── index.html            # Tool browser and approval UI
├── README.md
└── package.json
```

**Week 5 Schedule:**
- **Day 1:** Tool discovery and scanning
- **Day 2:** SKILL.md parser and validator
- **Day 3:** Approval workflow
- **Day 4:** Registry caching and events
- **Day 5:** Tests, documentation, demo

---

### 4. History Store (`components/storage/history-store/`)
**Priority:** P1 (High - execution tracking)
**Effort:** 5 days
**Dependencies:** IndexedDB Provider, Event Bus

**Purpose:** Tool execution history and statistics

**Why:** Tracks all tool executions for debugging, auditing, and analytics. Supports querying by session, tool, time range, etc.

**Interface:**
```javascript
interface HistoryStore {
  // Recording
  recordExecution(record: ExecutionRecordInput): Promise<string>; // returns executionId
  recordStart(sessionId: string, nodeId: string, toolName: string, args: object): Promise<string>;
  recordComplete(executionId: string, result: ToolResult): Promise<void>;
  
  // Querying
  getExecution(executionId: string): Promise<ExecutionRecord>;
  getExecutions(options: QueryOptions): Promise<ExecutionRecord[]>;
  getExecutionsBySession(sessionId: string): Promise<ExecutionRecord[]>;
  getExecutionsByTool(toolName: string): Promise<ExecutionRecord[]>;
  getExecutionsByNode(sessionId: string, nodeId: string): Promise<ExecutionRecord[]>;
  
  // Statistics
  getStats(options: StatsOptions): Promise<ExecutionStats>;
  getToolStats(toolName: string): Promise<ToolStats>;
  getSessionStats(sessionId: string): Promise<SessionExecutionStats>;
  
  // Aggregation
  getPopularTools(limit?: number): Promise<ToolUsage[]>;
  getExecutionTimeline(sessionId: string): Promise<TimelineEntry[]>;
  
  // Cleanup
  deleteOldExecutions(before: number): Promise<number>; // Returns count deleted
  clearHistory(): Promise<void>;
  
  // Events
  // 'execution:started', 'execution:completed', 'execution:failed'
}

interface ExecutionRecord {
  executionId: string;
  sessionId: string;
  nodeId: string;
  toolName: string;
  arguments: object;
  result: ToolResult;
  status: 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  duration?: number;
}

interface ExecutionRecordInput {
  sessionId: string;
  nodeId: string;
  toolName: string;
  arguments: object;
  result: ToolResult;
  startedAt: number;
  completedAt: number;
}

interface QueryOptions {
  sessionId?: string;
  toolName?: string;
  status?: 'running' | 'completed' | 'failed';
  from?: number; // timestamp
  to?: number; // timestamp
  limit?: number;
  offset?: number;
  sortBy?: 'startedAt' | 'duration';
  sortOrder?: 'asc' | 'desc';
}

interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  totalDuration: number;
  uniqueTools: number;
  dateRange: { from: number; to: number };
}

interface ToolStats {
  toolName: string;
  executionCount: number;
  successCount: number;
  failureCount: number;
  averageDuration: number;
  lastExecuted: number;
}

interface SessionExecutionStats {
  sessionId: string;
  totalExecutions: number;
  toolBreakdown: Map<string, number>; // toolName -> count
  averageDuration: number;
  timeline: TimelineEntry[];
}

interface ToolUsage {
  toolName: string;
  count: number;
  percentage: number;
}

interface TimelineEntry {
  timestamp: number;
  toolName: string;
  duration: number;
  status: 'success' | 'failure';
}

interface StatsOptions {
  from?: number;
  to?: number;
  sessionId?: string;
}
```

**Implementation Details:**
- **Efficient storage**: IndexedDB with indexes on sessionId, toolName, timestamp
- **Async recording**: Non-blocking execution recording
- **Aggregations**: Pre-computed stats for fast queries
- **Retention**: Configurable cleanup of old records
- **Export**: Support for exporting history (JSONL, CSV)

**IndexedDB Schema:**
```javascript
{
  version: 1,
  stores: {
    history: {
      keyPath: 'executionId',
      indexes: [
        { name: 'sessionId', keyPath: 'sessionId' },
        { name: 'toolName', keyPath: 'toolName' },
        { name: 'startedAt', keyPath: 'startedAt' },
        { name: 'status', keyPath: 'status' }
      ]
    }
  }
}
```

**Key Events Published:**
```javascript
{ type: 'execution:started', executionId: 'exec-123', sessionId: 'uuid-123', toolName: 'read' }
{ type: 'execution:completed', executionId: 'exec-123', duration: 150, status: 'success' }
{ type: 'execution:failed', executionId: 'exec-124', error: 'File not found' }
```

**Testing Requirements:**
- [ ] Record execution
- [ ] Query by various criteria
- [ ] Statistics aggregation
- [ ] Timeline generation
- [ ] Cleanup old records
- [ ] Concurrent recording

**Files to Create:**
```
components/storage/history-store/
├── src/
│   ├── index.js
│   ├── history-store.js
│   ├── aggregations.js
│   └── types.js
├── tests/
│   ├── unit/
│   │   └── history-store.spec.html
│   └── integration/
│       └── aggregations.spec.html
├── demo/
│   └── index.html            # History browser and stats dashboard
├── README.md
└── package.json
```

**Week 5 Schedule (continued from Tool Store):**
- **Day 6:** Core recording and querying
- **Day 7:** Statistics and aggregations
- **Day 8:** Timeline and visualization data
- **Day 9:** Tests and cleanup
- **Day 10:** Documentation and demo

---

## Component Integration

### How Components Work Together

```javascript
// File Store + Tool Store integration
// When GitHub loads a repo, Tool Store scans for .tools/

const fileStore = new FileStore();
const toolStore = new ToolStore(fileStore);

// Load repo from GitHub
await fileStore.loadFromGitHub('myproject', 'facebook', 'react');
// Event: 'repo:loaded' published

// Tool Store automatically scans
const tools = await toolStore.scanTools('myproject');
// Event: 'tool:discovered' for each tool

// Session Store + History Store
// When agent executes tools, both track the activity

const sessionStore = new SessionStore();
const historyStore = new HistoryStore();

// User sends message
const nodeId = await sessionStore.addNode(sessionId, parentId, {
  role: 'user',
  content: 'Hello'
});

// Agent executes tools
const execId = await historyStore.recordStart(sessionId, nodeId, 'read', { path: 'README.md' });
// ... execute tool ...
await historyStore.recordComplete(execId, { success: true, output: '...' });

// Update session with tool calls
await sessionStore.updateNode(sessionId, assistantNodeId, {
  toolCalls: [{ id: 'call-1', name: 'read', arguments: { path: 'README.md' } }]
});
```

### Event Flow Example

```
User loads repo from GitHub
  ↓
File Store loads files to OPFS
  ↓
File Store publishes 'repo:loaded'
  ↓
Tool Store subscribes to 'repo:loaded'
  ↓
Tool Store scans .tools/ directory
  ↓
Tool Store publishes 'tool:discovered' for each tool
  ↓
UI updates to show available tools

User sends chat message
  ↓
Session Store adds node
  ↓
Session Store publishes 'node:added'
  ↓
Agent (WASM) processes message
  ↓
Agent calls tool
  ↓
History Store records execution
  ↓
History Store publishes 'execution:started'
  ↓
Tool executes
  ↓
History Store records completion
  ↓
History Store publishes 'execution:completed'
  ↓
Session Store updates node with result
  ↓
UI updates to show result
```

---

## Implementation Order

### Week 4: File & Session Storage

**Day 1 (Monday): File Store - Core Operations**
- Set up component structure
- Implement read, write, delete, exists
- Path normalization
- Event publishing

**Day 2 (Tuesday): File Store - Directories**
- Implement list, walk, glob
- File tree caching
- Metadata operations
- Tests

**Day 3 (Wednesday): File Store - GitHub Loader**
- GitHub API integration
- Repository tree fetching
- File streaming to OPFS
- Progress events

**Day 4 (Thursday): File Store - Polish**
- Error handling
- Repo stats
- Language detection
- Documentation and demo

**Day 5 (Friday): Session Store - Core**
- Set up component structure
- Session CRUD
- Node operations
- IndexedDB schema

**Day 6-7 (Weekend/Monday): Session Store - Tree & Branching**
- Tree operations
- History reconstruction
- Branch creation
- Branch switching

**Day 8 (Tuesday): Session Store - Search**
- Full-text search
- Indexing
- Query optimization

**Day 9 (Wednesday): Session Store - Tests**
- Unit tests
- Integration tests
- Performance tests

**Day 10 (Thursday): Session Store - Demo**
- Session tree visualizer
- Interactive demo
- Documentation

### Week 5: Tool & History Storage

**Day 11 (Friday): Tool Store - Discovery**
- Tool scanning from OPFS
- SKILL.md detection
- Registry structure

**Day 12 (Weekend/Monday): Tool Store - Parser**
- YAML frontmatter parsing
- Markdown extraction
- Validation

**Day 13 (Tuesday): Tool Store - Workflow**
- Pending approval system
- Approve/reject operations
- Writing to OPFS

**Day 14 (Wednesday): Tool Store - Polish**
- Registry caching
- Hot reload
- Tests and demo

**Day 15 (Thursday): History Store - Core**
- Recording executions
- Querying
- IndexedDB indexes

**Day 16 (Friday): History Store - Stats**
- Aggregation functions
- Statistics calculation
- Timeline generation

**Day 17 (Weekend/Monday): History Store - Cleanup**
- Old record cleanup
- Export functionality
- Tests

**Day 18 (Tuesday): History Store - Demo**
- History browser
- Stats dashboard
- Documentation

**Day 19-20 (Wednesday-Thursday): Integration & Buffer**
- Cross-component testing
- Integration demos
- Bug fixes
- Documentation review

---

## Testing Strategy

### Unit Tests (per component)
- Mock dependencies (OPFS Provider, IndexedDB Provider)
- Test each method in isolation
- Error case coverage

### Integration Tests
- Test component interactions
- Use real browser storage APIs
- End-to-end workflows

### Test Files to Create
```
tests/integration/storage/
├── file-session-integration.spec.html    # File Store + Session Store
├── tool-file-integration.spec.html       # Tool Store + File Store
├── history-session-integration.spec.html # History Store + Session Store
├── full-workflow.spec.html               # All storage components
└── performance.spec.html                 # Performance benchmarks
```

---

## Documentation Requirements

Each component needs:

1. **README.md**
   - Purpose and overview
   - Installation
   - Quick start example
   - API reference
   - Configuration

2. **ARCHITECTURE.md** (for complex components)
   - Design decisions
   - Data flow
   - IndexedDB schema
   - Event documentation

3. **EXAMPLES.md**
   - Common use cases
   - Code samples
   - Best practices

---

## Success Criteria

Phase 2 is complete when:

- [ ] All 4 storage components implemented
- [ ] All unit tests passing (>90% coverage)
- [ ] All integration tests passing
- [ ] Interactive demos working
- [ ] Documentation complete
- [ ] Components work together seamlessly
- [ ] Performance acceptable (<100ms for typical operations)

---

## Risks and Mitigation

| Risk | Mitigation |
|------|-----------|
| GitHub API rate limits | Implement caching, use tokens for higher limits |
| Large repo loading | Streaming, progress tracking, partial loading |
| IndexedDB performance | Proper indexing, pagination, lazy loading |
| Concurrent modifications | Transaction handling, optimistic locking |
| Storage quota exceeded | Monitoring, compression, cleanup policies |

---

## Deliverables

### Code
- 4 storage components with full implementation
- Unit tests for each component
- Integration tests
- Interactive demos

### Documentation
- README for each component
- Architecture documentation
- Usage examples
- API reference

### Demos
- File Store: File browser with GitHub loading
- Session Store: Session tree visualizer with branching
- Tool Store: Tool browser and approval UI
- History Store: Execution history and stats dashboard

---

## Next Steps

After Phase 2:
1. Review and test all storage components
2. Begin Phase 3: Tool System
3. Build tools on top of storage layer
4. Integrate with WASM agent core

---

**Document Status:** Draft  
**Last Updated:** 2026-02-07  
**Author:** Development Team
