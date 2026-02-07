# Architecture: Browser Coding Agent

## Overview

A browser-based coding agent that combines LLM capabilities with a JavaScript tool execution environment. Uses a hybrid storage approach: OPFS (Origin Private File System) for file storage and IndexedDB for sessions, tools, and metadata. The agent runs in a Web Worker (WASM/Rust) while tools execute dynamically in the main thread via JavaScript.

**Storage Strategy:**
- **OPFS**: Repository files, tool definitions (large, hierarchical data, editable as files)
- **IndexedDB**: Session tree, tool execution history, pending tool approvals (structured, queryable data)

## Context

The agent enables developers to:
- Load GitHub repositories into a local OPFS-backed filesystem
- Chat with an AI assistant that can read, write, and edit files
- Create custom JavaScript tools dynamically
- Maintain branching conversation histories

## Design Philosophy

- **Simplicity over complexity**: No virtual shell, no file explorer UI
- **Dynamic extensibility**: Tools are stored as files in OPFS (`.tools/*.json`), not hardcoded
- **Security first**: Dynamic tools require user approval before execution
- **Web-native**: Leverages browser capabilities (OPFS, IndexedDB, Web Workers, fetch)
- **Hot-reloadable**: New tools become available immediately after approval
- **Transparent**: Users can read and edit tool definitions as regular files

---

## System Context

```mermaid
flowchart TB
    subgraph Browser["Web Browser"]
        subgraph App["Coding Agent Application"]
            subgraph MainThread["Main Thread (JavaScript)"]
                UI["Chat UI"]
                TR["Tool Runner"]
            end
            subgraph WorkerThread["Web Worker"]
                WASM["WASM Agent<br/>(Rust)"]
                GL["GitHub Loader"]
            end
            DB[(IndexedDB)]
            OPFS[(OPFS)]
        end
    end
    
    User["Developer/User"]
    GitHub["GitHub API"]
    Gemini["Google Gemini API"]
    
    User -->|Chat messages| UI
    UI -->|Send messages| WASM
    UI -->|Display results| User
    User -->|Review & approve| UI
    TR -->|Read/Write| OPFS
    WASM -->|LLM requests| Gemini
    Gemini -->|Responses| WASM
    WASM -->|Tool calls| TR
    WASM -->|Query file structure| OPFS
    WASM <-->|Read/Write| DB
    WASM -->|Trigger load| GL
    TR -->|Tool results| WASM
    GL -->|Fetch repo| GitHub
    GL -->|Write files| OPFS
    GL -->|Write .tools/| OPFS
```

---

## Container Architecture

```mermaid
flowchart TB
    subgraph Browser["Browser Environment"]
        subgraph MainThread["Main Thread"]
            UI["Chat UI<br/>React/Vanilla JS"]
            TR["Tool Runner<br/>JavaScript"]
        end
        
        subgraph Worker["Web Worker"]
            subgraph WASM["WASM Module<br/>(Rust)"]
                Agent["Agent Core<br/>LLM Loop, Session Mgmt"]
                Session["Session Tree<br/>Branching History"]
            end
            GL["GitHub Loader<br/>JavaScript"]
        end
        
        subgraph Storage["Storage Layer"]
            subgraph OPFS["OPFS (Origin Private File System)"]
                RepoFiles["Repository Files<br/>(path → content)"]
                ToolFiles[".tools/<br/>(tool definitions as JSON files)"]
            end
            subgraph IndexedDB["IndexedDB"]
                SessionsTable["sessions<br/>(conversation tree)"]
                PendingTools["pending_tools<br/>(approval queue)"]
                HistoryTable["history<br/>(tool executions)"]
            end
        end
    end
    
    LLM["Gemini API"]
    GitHubAPI["GitHub API"]
    
    UI <-->|postMessage| Agent
    UI -->|Approve tool| PendingTools
    Agent -->|Tool calls| TR
    TR -->|CRUD| RepoFiles
    TR -->|Query| ToolFiles
    TR -->|Results| Agent
    Agent <-->|Read/Write| SessionsTable
    Agent -->|Query| ToolFiles
    Agent -->|API calls| LLM
    GL -->|Fetch repos| GitHubAPI
    GL -->|Write files| RepoFiles
    GL -->|Write .tools/| ToolFiles
    Agent -->|Trigger load| GL
    Agent -->|Query structure| OPFS
```

### Container Responsibilities

| Container | Technology | Responsibility |
|-----------|-----------|----------------|
| Chat UI | JavaScript | User interface for chat, displays messages, tool approval UI |
| Tool Runner | JavaScript | Executes tools (read, write, edit, grep, find, js), operates on OPFS |
| GitHub Loader | JavaScript (Web Worker) | Fetches repositories from GitHub API, writes files and tools to OPFS |
| WASM Agent | Rust/WASM (Web Worker) | LLM chat loop, session management, tool dispatch, file structure queries |
| Session Tree | Rust | Branching conversation history, node management |
| OPFS | Browser API | File storage for repository contents and tool definitions (`.tools/` directory) |
| IndexedDB | Browser API | Session tree, pending tool approvals, execution history |

---

## Component Details

### Tool System Architecture

```mermaid
flowchart TB
    subgraph AgentWASM["WASM Agent (Rust)"]
        AgentCore["Agent Core"]
        ToolDispatcher["Tool Dispatcher"]
        SessionMgr["Session Manager"]
        
        AgentCore -->|1. Scan .tools/| ToolDispatcher
        AgentCore -->|5. Dispatch| ToolDispatcher
        ToolDispatcher -->|8. Return| AgentCore
    end
    
    subgraph MainThread["Main Thread (JavaScript)"]
        ToolRunner["Tool Runner"]
        ToolRegistry["Tool Registry<br/>(in-memory cache)"]
        
        subgraph ToolImpls["Tool Implementations"]
            Read["read()"]
            Write["write()"]
            Edit["edit()"]
            Grep["grep()"]
            Find["find()"]
            JS["js()<br/>(replaces bash)"]
        end
        
        ToolRunner -->|Lookup| ToolRegistry
        ToolRunner -->|Execute| ToolImpls
    end
    
    subgraph Storage["Storage Layer"]
        subgraph OPFS["OPFS"]
            RepoFiles["Repository Files"]
            ToolFiles[".tools/*.json"]
        end
        subgraph IndexedDB["IndexedDB"]
            PendingTools["pending_tools<br/>(approval queue)"]
        end
    end
    
    AgentCore -->|2. Read tool files| ToolFiles
    ToolFiles -->|3. Tool definitions| AgentCore
    ToolDispatcher -->|6. postMessage<br/>tool_call| ToolRunner
    ToolImpls -->|7. CRUD| RepoFiles
    ToolRunner -->|8. postMessage<br/>result| ToolDispatcher
    
    User["User"] -->|4. Approve pending| PendingTools
    PendingTools -->|.tools/*.json| ToolFiles
```

### Component Descriptions

#### Agent Core (Rust)
- Manages the LLM conversation loop
- Maintains session tree state
- Discovers tools by scanning OPFS `.tools/` directory at startup
- Queries OPFS for file structure to provide context to LLM
- Dispatches tool calls to JavaScript via postMessage
- Receives tool results and feeds back to LLM

#### Tool Dispatcher (Rust)
- Scans OPFS `.tools/` directory to build tool registry
- Loads tool definitions from JSON files
- Converts tool definitions to Gemini function declarations
- Routes incoming tool calls from LLM to appropriate handler
- Validates tool results before adding to history

#### Tool Runner (JavaScript)
- Receives tool calls from WASM via postMessage
- Looks up tool implementation (built-in or dynamic)
- Executes tool with provided arguments
- Returns result to WASM

#### Built-in Tools
All tools operate directly on OPFS:

| Tool | Purpose | OPFS Operations |
|------|---------|---------------------|
| `read` | Read file contents with line numbers | getFileHandle → read |
| `write` | Write/create files | getFileHandle → createWritable → write |
| `edit` | Surgical find-and-replace | read → modify → write |
| `grep` | Search file contents | Walk directory → read each |
| `find` | Discover files by pattern | Walk directory → filter paths |
| `js` | Execute JavaScript | Arbitrary (via user code) |

#### Session Manager (Rust)
- Manages branching conversation tree
- Persists session changes to IndexedDB via callbacks
- Rebuilds conversation history for LLM from current branch

---

## Data Model

```mermaid
classDiagram
    class Agent {
        +String apiKey
        +String model
        +SessionTree session
        +Vec~Tool~ tools
        +chat(message) Promise~Result~
        +getAvailableTools() Vec~Tool~
    }
    
    class SessionTree {
        +String sessionId
        +Node root
        +Node current
        +appendMessage(role, content)
        +branch(fromNode) Node
        +getHistory() Vec~Message~
    }
    
    class Node {
        +String id
        +String role
        +String content
        +Vec~ToolCall~ toolCalls
        +Vec~Node~ children
        +Node parent
    }
    
    class Tool {
        +String name
        +String description
        +JsonSchema parameters
        +String implementation
        +Number version
        +execute(args) ToolResult
    }
    
    class ToolResult {
        +bool success
        +String output
        +String error
    }
    
    class ToolCall {
        +String toolName
        +JsonValue arguments
        +String callId
    }
    
    class File {
        +String path
        +String content
        +Number size
        +Date modified
    }
    
    class IndexedDBStore {
        +String dbName
        +String storeName
        +get(key) Promise~Value~
        +set(key, value) Promise~void~
        +getAll() Promise~Vec~Entry~~
    }
    
    Agent "1" --> "1" SessionTree : manages
    Agent "1" --> "*" Tool : uses
    SessionTree "1" --> "1" Node : root
    Node "1" --> "*" Node : children
    Node "*" --> "*" ToolCall : contains
    Tool "*" --> "*" ToolResult : produces
    IndexedDBStore ..> File : stores
    IndexedDBStore ..> Tool : stores
```

### Storage Schema

#### OPFS Structure
Repository files and tool definitions are stored in OPFS using a directory structure:
```
OPFS Root
└── repos/
    └── {owner}_{repo}/              // Repository root
        ├── src/
        │   └── main.rs              // File content
        ├── Cargo.toml
        ├── .tools/                  // Tool definitions directory
        │   ├── count_lines.json     // Tool: count lines in a file
        │   ├── find_unused.json     // Tool: find unused code
        │   └── custom_analyzer.json // User-created tool
        └── ...
```

**File Operations:**
- **Read**: `root.getFileHandle(path).getFile().text()`
- **Write**: `root.getFileHandle(path, {create: true}).createWritable().write(content)`
- **Directory traversal**: Use `FileSystemDirectoryHandle` to walk the tree

#### Tool Definition Format (OPFS)
```javascript
// File: .tools/count_lines.json
{
  "name": "count_lines",
  "description": "Count lines in a file",
  "parameters": {
    "type": "object",
    "properties": {
      "path": { "type": "string" }
    },
    "required": ["path"]
  },
  "implementation": "(args) => { const content = read(args.path); return content.split('\\n').length; }",
  "version": 1,
  "created": "2026-02-07T10:30:00Z",
  "approved": true
}
```

**Benefits of storing tools as files:**
- **Readable**: Users can `read .tools/count_lines.json` to inspect tool code
- **Editable**: Users can modify tools using `edit` or `write` tools
- **Versionable**: Tool files can be tracked alongside repository code
- **Secure**: Users must explicitly approve dynamically created tools before execution

#### IndexedDB Schema

Tools are stored as files in OPFS (`.tools/*.json`). IndexedDB is used for sessions, history, and pending tool approvals:

#### `pending_tools` Store
```javascript
{
  toolId: "uuid-789",           // Primary key
  name: "custom_analyzer",
  description: "Custom code analyzer",
  parameters: { ... },
  implementation: "...",
  created: "2026-02-07T10:30:00Z",
  status: "pending",            // "pending", "approved", "rejected"
  requestedBy: "llm",           // "llm" or "user"
  reason: "User requested custom analysis"
}
```

**Tool Approval Workflow:**
1. LLM generates new tool → stored in `pending_tools` with status "pending"
2. UI displays tool to user with code for review
3. User approves → tool written to OPFS `.tools/{name}.json`
4. User rejects → tool removed from `pending_tools`
5. Approved tools are immediately available for use

#### `sessions` Store
```javascript
{
  sessionId: "uuid-123",     // Primary key
  root: {
    id: "node-1",
    role: "user",
    content: "Hello",
    children: [...],
    parent: null
  },
  currentNodeId: "node-5",
  created: "2026-02-07T10:00:00Z",
  modified: "2026-02-07T10:30:00Z"
}
```

#### `history` Store
```javascript
{
  id: "uuid-456",           // Primary key
  sessionId: "uuid-123",
  timestamp: "2026-02-07T10:30:00Z",
  toolName: "read",
  arguments: { path: "src/main.rs" },
  result: { success: true, output: "fn main() {...}" }
}
```

---

## Sequence Diagrams

### Standard Tool Execution Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as Chat UI
    participant Agent as WASM Agent
    participant LLM as Gemini API
    participant TR as Tool Runner
    participant DB as IndexedDB
    participant OPFS as OPFS
    
    User->>UI: Send message
    
    UI->>Agent: postMessage({type: 'chat', message})
    activate Agent
    
    Agent->>OPFS: Scan .tools/ directory
    OPFS-->>Agent: Tool JSON files
    
    Agent->>Agent: Build tool declarations
    Agent->>LLM: generateContent(tools, history)
    
    loop Agent Loop
        LLM-->>Agent: Response with tool_calls
        
        alt Has tool calls
            Agent->>Agent: Emit step event
            
            loop Each Tool Call
                Agent->>TR: postMessage({type: 'tool_call', name, args})
                activate TR
                
                alt Tool is built-in
                    TR->>TR: Execute native implementation
                else Tool is dynamic
                    TR->>OPFS: Load .tools/{name}.json
                    OPFS-->>TR: Tool JSON file
                    TR->>TR: new Function(tool.implementation)(args)
                end
                
                TR->>OPFS: Read/Write repository files
                OPFS-->>TR: File data
                
                TR-->>Agent: postMessage({type: 'tool_result', result})
                deactivate TR
                
                Agent->>Agent: Append to history
            end
            
            Agent->>LLM: generateContent(updated history)
        else Final response
            Agent->>Agent: Append to session tree
            Agent->>DB: Persist session
            Agent-->>UI: postMessage({type: 'done', response})
        end
    end
    deactivate Agent
    
    UI-->>User: Display response
```

### Dynamic Tool Creation Flow (with Approval)

```mermaid
sequenceDiagram
    actor User
    participant UI as Chat UI
    participant Agent as WASM Agent
    participant DB as IndexedDB
    participant OPFS as OPFS
    
    User->>UI: "Create a tool that counts lines"
    
    UI->>Agent: postMessage({type: 'chat', message})
    
    Agent->>LLM: Generate tool code from description
    LLM-->>Agent: Tool definition + implementation
    
    Agent->>Agent: Validate tool code
    Agent->>DB: Insert into pending_tools
    DB-->>Agent: Tool queued for approval
    
    Agent-->>UI: postMessage({type: 'tool_pending', toolId, code})
    
    User->>UI: Review tool code
    
    alt User approves
        User->>UI: Click "Approve"
        UI->>Agent: postMessage({type: 'approve_tool', toolId})
        
        Agent->>DB: Get pending tool details
        DB-->>Agent: Tool definition
        
        Agent->>OPFS: Write .tools/{name}.json
        OPFS-->>Agent: Tool file created
        
        Agent->>DB: Update status to "approved"
        Agent->>Agent: Reload tool registry
        
        Agent-->>UI: "Tool 'count_lines' approved and available"
        
    else User rejects
        User->>UI: Click "Reject"
        UI->>Agent: postMessage({type: 'reject_tool', toolId})
        Agent->>DB: Delete from pending_tools
        Agent-->>UI: "Tool creation rejected"
    end
    
    User->>UI: "Use count_lines on src/main.rs"
    
    UI->>Agent: postMessage({type: 'chat', message})
    
    Agent->>OPFS: Scan .tools/ directory
    OPFS-->>Agent: Tool definitions (including new tool)
    Agent->>Agent: Build tool registry
    Agent->>LLM: LLM sees count_lines in declarations
    LLM-->>Agent: Calls count_lines
    
    Agent->>TR: Execute count_lines
    TR->>OPFS: Load tool from .tools/count_lines.json
    OPFS-->>TR: Tool implementation
    TR->>TR: Execute
    TR-->>Agent: Result
    
    Agent-->>UI: Response with line count
```

### GitHub Repository Loading

```mermaid
sequenceDiagram
    actor User
    participant UI as Chat UI
    participant Agent as WASM Agent
    participant GL as GitHub Loader
    participant GH as GitHub API
    participant OPFS as OPFS
    
    User->>UI: Enter "owner/repo"
    
    UI->>Agent: postMessage({type: 'load_repo', owner, repo})
    activate Agent
    
    Agent->>GL: loadRepository(owner, repo)
    activate GL
    
    GL->>GH: GET /repos/{owner}/{repo}/git/trees/main?recursive=1
    GH-->>GL: File tree (paths, blobs)
    
    GL->>OPFS: Create directory repos/{owner}_{repo}
    
    loop For each file
        GL->>GH: GET blob content
        GH-->>GL: File content
        GL->>OPFS: Write file to repos/{owner}_{repo}/{path}
    end
    
    GL-->>Agent: Repository loaded (file count)
    deactivate GL
    
    Agent->>OPFS: Walk directory tree
    OPFS-->>Agent: File structure
    
    Agent->>Agent: Update context with file structure
    Agent-->>UI: postMessage({type: 'repo_loaded', fileCount})
    deactivate Agent
```

### Session Branching

```mermaid
sequenceDiagram
    actor User
    participant UI as Chat UI
    participant Agent as WASM Agent
    participant DB as IndexedDB
    
    User->>UI: Click "Branch" on message #3
    
    UI->>Agent: postMessage({type: 'branch', nodeId})
    activate Agent
    
    Agent->>Agent: SessionTree.branch(nodeId)
    Agent->>Agent: Create new node as child
    Agent->>Agent: Set current = new node
    
    Agent->>DB: Persist updated session tree
    DB-->>Agent: Success
    
    Agent->>Agent: Rebuild history from new branch
    
    Agent-->>UI: postMessage({type: 'branched', newHistory})
    deactivate Agent
    
    UI-->>User: Show new branch, conversation continues
```

---

## Tool Execution Details

### Built-in Tools

All built-in tools are implemented in JavaScript and operate directly on IndexedDB.

#### `read` Tool
```javascript
{
  name: "read",
  description: "Read file contents with optional line offset and limit",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path to read" },
      offset: { type: "number", description: "1-indexed line number to start from" },
      limit: { type: "number", description: "Maximum lines to read" }
    },
    required: ["path"]
  }
}
// Implementation: OPFS getFileHandle(path).getFile().text(), return content with line numbers
```

#### `write` Tool
```javascript
{
  name: "write",
  description: "Write or overwrite a file",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      content: { type: "string", description: "File content" }
    },
    required: ["path", "content"]
  }
}
// Implementation: OPFS getFileHandle(path, {create: true}).createWritable().write(content)
```

#### `edit` Tool
```javascript
{
  name: "edit",
  description: "Edit a file with surgical find-and-replace",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path" },
      oldText: { type: "string", description: "Text to find" },
      newText: { type: "string", description: "Replacement text" }
    },
    required: ["path", "oldText", "newText"]
  }
}
// Implementation: OPFS read → find (with fuzzy matching) → replace → OPFS write
```

#### `grep` Tool
```javascript
{
  name: "grep",
  description: "Search file contents with regex pattern",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regex pattern" },
      path: { type: "string", description: "Optional path to limit search" },
      ignoreCase: { type: "boolean" }
    },
    required: ["pattern"]
  }
}
// Implementation: OPFS walk directory (or path subtree) → read each file → match pattern
```

#### `find` Tool
```javascript
{
  name: "find",
  description: "Find files by glob pattern",
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Glob pattern like '*.rs'" },
      path: { type: "string", description: "Optional starting directory" }
    },
    required: ["pattern"]
  }
}
// Implementation: OPFS walk directory → collect paths → filter by pattern
```

#### `js` Tool (Replaces bash)
```javascript
{
  name: "js",
  description: "Execute JavaScript code with access to file operations",
  parameters: {
    type: "object",
    properties: {
      code: { 
        type: "string", 
        description: "JavaScript code to execute. Available globals: read(path), write(path, content), grep(pattern), find(pattern), console" 
      }
    },
    required: ["code"]
  }
}
// Implementation: new Function('read', 'write', 'grep', 'find', 'console', code)(...builtins)
```

### Dynamic Tool API

Dynamic tools have access to:
- `read(path)` - Read file from OPFS
- `write(path, content)` - Write file to OPFS
- `grep(pattern, path?)` - Search file contents
- `find(pattern)` - Find files by pattern
- `console` - Console logging (captured and returned)

Tool code is wrapped:
```javascript
const toolFunction = new Function(
  'read', 'write', 'grep', 'find', 'console',
  tool.implementation
);
return toolFunction(read, write, grep, find, console);
```

### OPFS Helper Functions

```javascript
// OPFS operations for tools
async function readFile(path) {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(path);
  const file = await handle.getFile();
  return await file.text();
}

async function writeFile(path, content) {
  const root = await navigator.storage.getDirectory();
  
  // Create parent directories
  const parts = path.split('/');
  let dir = root;
  for (const part of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(part, { create: true });
  }
  
  const handle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function walkDirectory(dirHandle, path = '') {
  const files = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const fullPath = path ? `${path}/${name}` : name;
    if (handle.kind === 'directory') {
      files.push(...await walkDirectory(handle, fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}
```

---

## Communication Protocol

### Main Thread → Worker (WASM)

| Type | Payload | Description |
|------|---------|-------------|
| `init` | `{ apiKey, model, repo }` | Initialize agent |
| `chat` | `{ message }` | Send user message |
| `branch` | `{ nodeId }` | Branch session at node |
| `load_repo` | `{ owner, repo }` | Trigger GitHub load |
| `get_history` | `{}` | Request current branch history |
| `get_tree` | `{}` | Request full session tree |
| `approve_tool` | `{ toolId }` | Approve pending tool |
| `reject_tool` | `{ toolId }` | Reject pending tool |

### Worker (WASM) → Main Thread

| Type | Payload | Description |
|------|---------|-------------|
| `ready` | `{}` | Agent initialized |
| `step` | `{ type, content, toolCalls? }` | Agent step event |
| `tool_call` | `{ callId, name, arguments }` | Execute tool |
| `tool_result` | `{ callId, result }` | Tool result (from JS) |
| `done` | `{ response }` | Final response |
| `error` | `{ message }` | Error occurred |
| `tool_pending` | `{ toolId, name, code }` | New tool awaiting approval |

### Main Thread → Tool Runner

The Tool Runner is part of the Main Thread but logically separate. Communication is direct function calls, not messages.

---

## Security Considerations

1. **Dynamic Code Execution**: The `js` tool and dynamic tools use `new Function()`, which runs in the same context as the Tool Runner. This is acceptable because:
   - Code is generated by the LLM, not arbitrary user input
   - No access to `window`, `document`, or other browser globals (only injected `read`, `write`, etc.)
   - Runs in the main thread (can be moved to a separate worker later if needed)

2. **Tool Approval**: Dynamically created tools require explicit user approval before execution:
   - Tools are stored in `pending_tools` queue initially
   - User must review and approve code before it becomes available
   - Approved tools are written to OPFS `.tools/{name}.json`
   - Prevents LLM from executing arbitrary code without oversight

3. **Storage Isolation**:
   - **OPFS**: Each repository gets its own directory (`repos/{owner}_{repo}/`) to avoid conflicts
   - **IndexedDB**: Sessions, history, and pending tools are namespaced by agent instance

3. **API Keys**: Stored in WASM memory, never persisted to storage. Passed from UI at initialization.

---

## Future Enhancements

1. **Tool Worker**: Move tool execution to a dedicated Web Worker to prevent blocking the main thread during long operations
2. **Tool Versioning**: Track tool versions and allow rollback to previous implementations
3. **Tool Marketplace**: Import tools from URLs or a shared registry
4. **Streaming**: Add streaming LLM responses for better UX
5. **File Explorer**: Optional UI component for visual file browsing
6. **Multi-repo**: Support loading multiple repositories simultaneously

---

## Implementation Notes

### WASM-JavaScript Bridge

Tools are the primary bridge between WASM and JavaScript:
```rust
// Rust side
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = "executeTool")]
    fn execute_tool(name: &str, args: &str) -> js_sys::Promise;
}
```

```javascript
// JavaScript side
globalThis.executeTool = async (name, argsJson) => {
  const args = JSON.parse(argsJson);
  // Load tool from OPFS .tools/ directory
  const toolJson = await readFile(`.tools/${name}.json`);
  const tool = JSON.parse(toolJson);
  const result = await executeToolImpl(tool, args);
  return JSON.stringify(result);
};

globalThis.scanTools = async () => {
  // Scan .tools/ directory in OPFS
  const root = await navigator.storage.getDirectory();
  const toolsDir = await root.getDirectoryHandle('.tools', { create: true });
  const tools = [];
  
  for await (const [name, handle] of toolsDir.entries()) {
    if (handle.kind === 'file' && name.endsWith('.json')) {
      const file = await handle.getFile();
      const content = await file.text();
      tools.push(JSON.parse(content));
    }
  }
  return JSON.stringify(tools);
};
```

### OPFS in Web Workers

OPFS is accessible from Web Workers using `navigator.storage.getDirectory()`:

```javascript
// In Web Worker (GitHub Loader)
async function writeRepoFile(repoPath, filePath, content) {
  const root = await navigator.storage.getDirectory();
  const repoDir = await root.getDirectoryHandle(repoPath, { create: true });
  
  // Create nested directories
  const parts = filePath.split('/');
  let current = repoDir;
  for (const part of parts.slice(0, -1)) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  
  // Write file
  const fileHandle = await current.getFileHandle(parts[parts.length - 1], { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}
```

**Note:** OPFS operations are async but can use `FileSystemSyncAccessHandle` in Web Workers for synchronous file I/O when needed.

### Error Handling

- **Tool errors**: Returned as failed `ToolResult`, shown to LLM
- **Network errors**: LLM API failures retry with backoff
- **Storage errors**: Critical, emit `error` event to UI

---

## Related Documentation

- Original Plan: `plans/09-integrated-agent.md`
- Agent Implementation: `06-agent/ARCHITECTURE.md`
- TypeScript Reference: `coding-agent/` directory
- Building Blocks: `01-hello-worker/` through `08-virtual-shell/`
