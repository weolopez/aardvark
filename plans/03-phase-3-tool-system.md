# Phase 3 Plan: Tool System

## Overview

**Status:** NOT STARTED  
**Duration:** 2 weeks (Weeks 6-7)  
**Dependencies:** Phase 2 Complete (File Store, Session Store, Tool Store, History Store)  
**Goal:** Implement the tool execution system that bridges the WASM agent with JavaScript tool implementations

Phase 3 creates the tool layer that enables the agent to interact with files and execute custom logic. This includes 7 built-in tools, a tool runner for executing them, and support for dynamic tools defined in SKILL.md format.

---

## Philosophy

Building on the architecture from Phase 2:
- **Tools are first-class citizens** - Both built-in and dynamic tools use the same interface
- **Security first** - Dynamic tools require explicit user approval before execution
- **Transparency** - Users can read and edit tool definitions as SKILL.md files
- **Composability** - Tools can call other tools (controlled via `allowed-tools` field)
- **Web-native** - Leverages browser APIs, runs in main thread for DOM/file access

---

## Components to Build

### 1. Built-in Tools (`components/tools/built-ins/`)

**Priority:** P0 (Critical - core functionality)  
**Effort:** 5 days  
**Dependencies:** File Store (from Phase 2)

#### Tools to Implement

| Tool | Purpose | Complexity | OPFS Operations |
|------|---------|------------|-----------------|
| `read` | Read file contents with line numbers | Low | getFileHandle → read |
| `write` | Write/create files | Low | getFileHandle → createWritable → write |
| `edit` | Surgical find-and-replace | Medium | read → modify → write |
| `ls` | List directory contents | Low | Read directory entries |
| `grep` | Search file contents with regex | Medium | Walk directory → read each → match |
| `find` | Find files by glob pattern | Medium | Walk directory → filter paths |
| `js` | Execute JavaScript code | High | Arbitrary via user code |

**Tool Interface:**
```javascript
interface Tool {
  name: string;
  description: string;
  parameters: JsonSchema;
  execute(args: object, context: ToolContext): Promise<ToolResult>;
}

interface ToolContext {
  fileStore: FileStore;
  eventBus: EventBus;
  repo: string;  // Current repository
}

interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}
```

#### Individual Tool Specifications

**`read` Tool**
```javascript
{
  name: "read",
  description: "Read file contents with optional line offset and limit",
  parameters: {
    type: "object",
    properties: {
      path: { 
        type: "string", 
        description: "File path to read (relative to repo root)" 
      },
      offset: { 
        type: "number", 
        description: "1-indexed line number to start from" 
      },
      limit: { 
        type: "number", 
        description: "Maximum lines to read (default: 100)" 
      }
    },
    required: ["path"]
  }
}
// Returns: Content with line numbers prefixed (e.g., "1 | fn main() {\n2 | ...")
// Error: File not found, permission denied
```

**`write` Tool**
```javascript
{
  name: "write",
  description: "Write or overwrite a file",
  parameters: {
    type: "object",
    properties: {
      path: { 
        type: "string", 
        description: "File path (relative to repo root)" 
      },
      content: { 
        type: "string", 
        description: "File content to write" 
      }
    },
    required: ["path", "content"]
  }
}
// Creates parent directories if needed
// Returns: Success confirmation
```

**`edit` Tool**
```javascript
{
  name: "edit",
  description: "Edit a file with surgical find-and-replace",
  parameters: {
    type: "object",
    properties: {
      path: { 
        type: "string", 
        description: "File path" 
      },
      oldText: { 
        type: "string", 
        description: "Exact text to find (including whitespace)" 
      },
      newText: { 
        type: "string", 
        description: "Replacement text" 
      }
    },
    required: ["path", "oldText", "newText"]
  }
}
// Features:
// - Exact match (not regex for safety)
// - Fuzzy whitespace matching option
// - Returns context (lines before/after change)
// - Error if oldText not found or multiple matches
```

**`ls` Tool**
```javascript
{
  name: "ls",
  description: "List directory contents",
  parameters: {
    type: "object",
    properties: {
      path: { 
        type: "string", 
        description: "Directory path to list" 
      },
      detailed: { 
        type: "boolean", 
        description: "Show detailed listing with sizes" 
      }
    },
    required: ["path"]
  }
}
// Returns: Formatted directory listing
// "drwxr-xr-x  src/\n-rw-r--r--  1.2KB  Cargo.toml\n..."
```

**`grep` Tool**
```javascript
{
  name: "grep",
  description: "Search file contents with regex pattern",
  parameters: {
    type: "object",
    properties: {
      pattern: { 
        type: "string", 
        description: "Regex pattern to search for" 
      },
      path: { 
        type: "string", 
        description: "Optional path to limit search scope" 
      },
      ignoreCase: { 
        type: "boolean",
        description: "Case-insensitive matching"
      }
    },
    required: ["pattern"]
  }
}
// Returns: Matching lines with file paths and line numbers
// "src/main.rs:10: fn main() {\nsrc/lib.rs:5: pub fn helper() {\n..."
```

**`find` Tool**
```javascript
{
  name: "find",
  description: "Find files by glob pattern",
  parameters: {
    type: "object",
    properties: {
      pattern: { 
        type: "string", 
        description: "Glob pattern like '*.rs' or 'src/**/*.js'" 
      },
      path: { 
        type: "string", 
        description: "Optional starting directory" 
      }
    },
    required: ["pattern"]
  }
}
// Returns: List of matching file paths
// ["src/main.rs", "src/lib.rs", "tests/test.rs"]
```

**`js` Tool (Replaces bash)**
```javascript
{
  name: "js",
  description: "Execute JavaScript code with access to file operations",
  parameters: {
    type: "object",
    properties: {
      code: { 
        type: "string", 
        description: "JavaScript code to execute. Available: read(path), write(path, content), grep(pattern), find(pattern), console" 
      }
    },
    required: ["code"]
  }
}
// Execution context:
// - read(path): Read file from OPFS
// - write(path, content): Write file to OPFS  
// - grep(pattern, path?): Search file contents
// - find(pattern): Find files by pattern
// - console: Console logging (captured and returned)
// 
// Security:
// - No access to window, document, or other browser globals
// - Timeout protection (30 second default)
// - Can be disabled via configuration
```

**Implementation:**
```javascript
// js tool wrapper
async function executeJs(code, context) {
  const { read, write, grep, find } = createSandboxedUtils(context);
  
  const wrappedCode = `
    "use strict";
    ${code}
  `;
  
  const fn = new Function('read', 'write', 'grep', 'find', 'console', wrappedCode);
  
  // Set timeout
  const timeout = 30000; // 30 seconds
  const startTime = Date.now();
  
  // Execute with timeout check
  const result = await Promise.race([
    fn(read, write, grep, find, createConsole()),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Execution timeout')), timeout)
    )
  ]);
  
  return {
    success: true,
    output: captureConsoleOutput(),
    result: result
  };
}
```

**Files to Create:**
```
components/tools/built-ins/
├── src/
│   ├── index.js           # Export all tools
│   ├── read.js            # Read tool implementation
│   ├── write.js           # Write tool implementation
│   ├── edit.js            # Edit tool implementation
│   ├── ls.js              # List directory tool
│   ├── grep.js            # Grep tool implementation
│   ├── find.js            # Find tool implementation
│   ├── js.js              # JavaScript execution tool
│   └── utils.js           # Shared utilities (path handling, etc.)
├── tests/
│   ├── unit/
│   │   ├── read.spec.html
│   │   ├── write.spec.html
│   │   ├── edit.spec.html
│   │   ├── ls.spec.html
│   │   ├── grep.spec.html
│   │   ├── find.spec.html
│   │   └── js.spec.html
│   └── fixtures/
│       └── sample-repo/   # Test files
├── demo/
│   └── index.html         # Interactive tool playground
├── README.md
└── package.json
```

**Week 6 Schedule:**
- **Day 1:** read, write tools
- **Day 2:** edit tool with fuzzy matching
- **Day 3:** ls, find tools
- **Day 4:** grep tool
- **Day 5:** js tool with sandboxing

---

### 2. Tool Runner (`components/tools/tool-runner/`)

**Priority:** P0 (Critical - execution engine)  
**Effort:** 4 days  
**Dependencies:** Built-in Tools, File Store, Event Bus

**Purpose:** Central execution engine that routes tool calls to appropriate implementations

**Interface:**
```javascript
interface ToolRunner {
  // Tool registration
  registerTool(name: string, tool: Tool): void;
  registerBuiltinTools(): void;  // Auto-register all built-ins
  
  // Execution
  execute(name: string, args: object, context: ExecutionContext): Promise<ToolResult>;
  executeBatch(calls: ToolCall[], context: ExecutionContext): Promise<ToolResult[]>;
  
  // Discovery
  listTools(): ToolDefinition[];
  getTool(name: string): ToolDefinition;
  
  // Dynamic tool loading
  loadDynamicTool(repo: string, name: string): Promise<void>;
  
  // Validation
  validateArgs(name: string, args: object): ValidationResult;
  
  // Events
  // 'tool:registered', 'tool:executing', 'tool:completed', 'tool:failed'
}

interface ExecutionContext {
  repo: string;
  sessionId: string;
  nodeId: string;
  fileStore: FileStore;
  eventBus: EventBus;
}

interface ToolCall {
  name: string;
  arguments: object;
  callId: string;
}
```

**Key Features:**
- **Registry**: In-memory map of tool name → implementation
- **Validation**: JSON Schema validation of arguments before execution
- **Sandboxing**: JS tool runs in isolated context
- **Error handling**: Converts exceptions to ToolResult format
- **Event publishing**: Reports execution lifecycle events
- **Batch execution**: Execute multiple tools in sequence

**Event Flow:**
```
Agent (WASM) → postMessage(tool_call)
  ↓
Tool Runner receives call
  ↓
Validate arguments against schema
  ↓
Publish 'tool:executing' event
  ↓
Execute tool implementation
  ↓
Catch errors → format as ToolResult
  ↓
Publish 'tool:completed' or 'tool:failed'
  ↓
Return result to Agent
```

**Files to Create:**
```
components/tools/tool-runner/
├── src/
│   ├── index.js
│   ├── tool-runner.js
│   ├── registry.js
│   ├── validator.js
│   └── types.js
├── tests/
│   ├── unit/
│   │   ├── tool-runner.spec.html
│   │   └── registry.spec.html
│   └── integration/
│       └── execution.spec.html
├── demo/
│   └── index.html         # Tool execution playground
├── README.md
└── package.json
```

**Week 6 Schedule (continued):**
- **Day 6:** Core runner architecture, registry
- **Day 7:** Built-in tool registration, validation
- **Day 8:** Error handling, batch execution, events
- **Day 9:** Tests, documentation

---

### 3. SKILL.md Parser Enhancement (`components/tools/skill-parser/`)

**Priority:** P1 (High - dynamic tools)  
**Effort:** 2 days  
**Dependencies:** Tool Runner

**Purpose:** Parse and validate SKILL.md tool definitions

**Interface:**
```javascript
interface SkillParser {
  // Parsing
  parse(content: string): ParsedSkillMd;
  parseFrontmatter(yaml: string): SkillFrontmatter;
  
  // Validation
  validate(parsed: ParsedSkillMd): ValidationResult;
  validateFrontmatter(frontmatter: object): ValidationResult;
  
  // Schema extraction
  extractParametersSchema(instructions: string): JsonSchema;
  generateSchemaFromExample(example: object): JsonSchema;
}

interface ParsedSkillMd {
  frontmatter: SkillFrontmatter;
  instructions: string;
  raw: string;
}

interface SkillFrontmatter {
  name: string;
  description: string;
  allowedTools?: string[];
  version?: string;
  author?: string;
  requires?: string[];  // Other tools this depends on
}
```

**SKILL.md Format:**
```markdown
---
name: count-lines
description: Count lines in a file
allowed-tools: ["read", "write"]
version: 1.0.0
author: Claude
---

# Count Lines Tool

## Purpose
Count the number of lines in a specified file.

## Parameters
- path: File path to read

## Instructions

1. Read the file at the specified path using the read tool
2. Split content by newlines
3. Return the count as a number

## Example

Input: `{ "path": "src/main.rs" }`
Output: `42`
```

**Files to Create:**
```
components/tools/skill-parser/
├── src/
│   ├── index.js
│   ├── parser.js
│   ├── validator.js
│   └── schema-extractor.js
├── tests/
│   ├── unit/
│   │   ├── parser.spec.html
│   │   └── validator.spec.html
│   └── fixtures/
│       └── valid-skill.md
├── README.md
└── package.json
```

**Week 7 Schedule:**
- **Day 1:** Parser implementation, YAML frontmatter
- **Day 2:** Schema extraction, validation

---

### 4. Dynamic Tool Executor (`components/tools/dynamic-executor/`)

**Priority:** P1 (High - extensibility)  
**Effort:** 3 days  
**Dependencies:** SKILL.md Parser, Tool Runner

**Purpose:** Execute tools defined in SKILL.md format

**Interface:**
```javascript
interface DynamicToolExecutor {
  // Loading
  loadSkillMd(repo: string, name: string): Promise<ToolDefinition>;
  
  // Execution
  execute(
    skillMd: ParsedSkillMd, 
    args: object, 
    context: ExecutionContext
  ): Promise<ToolResult>;
  
  // Instruction interpretation
  interpretInstructions(
    instructions: string, 
    args: object,
    allowedTools: string[],
    context: ExecutionContext
  ): Promise<ToolResult>;
}

interface DynamicToolContext {
  read: (path: string) => Promise<string>;
  write: (path: string, content: string) => Promise<void>;
  grep: (pattern: string, path?: string) => Promise<string[]>;
  find: (pattern: string) => Promise<string[]>;
  console: Console;
  // Only tools listed in allowed-tools are injected
}
```

**Execution Strategy:**

Dynamic tools can be implemented in two ways:

1. **Pure JavaScript** (embedded in SKILL.md):
```markdown
## Implementation

```javascript
const content = await read(args.path);
const lines = content.split('\n');
return { count: lines.length };
```
```

2. **Instruction-based** (step-by-step):
```markdown
## Instructions

1. Use the read tool to read the file at `args.path`
2. Count the number of lines
3. Return the count as JSON
```

**Security Model:**
- Dynamic tools run in same sandbox as `js` tool
- Only tools listed in `allowed-tools` frontmatter field are available
- User must approve tool before first execution
- Timeout protection (30 seconds)

**Files to Create:**
```
components/tools/dynamic-executor/
├── src/
│   ├── index.js
│   ├── executor.js
│   ├── instruction-interpreter.js
│   └── sandbox.js
├── tests/
│   ├── unit/
│   │   ├── executor.spec.html
│   │   └── interpreter.spec.html
│   └── fixtures/
│       └── sample-tools/
├── demo/
│   └── index.html
├── README.md
└── package.json
```

**Week 7 Schedule (continued):**
- **Day 3:** Dynamic tool loading
- **Day 4:** JavaScript execution from SKILL.md
- **Day 5:** Instruction interpreter, security sandbox

---

## Component Integration

### Tool Execution Flow

```javascript
// Complete flow: Agent calls tool → Result returned

// 1. Agent (WASM) sends tool call via postMessage
worker.postMessage({
  type: 'tool_call',
  callId: 'call-123',
  name: 'read',
  arguments: { path: 'src/main.rs' }
});

// 2. Tool Runner receives and validates
const runner = new ToolRunner();
runner.registerBuiltinTools();

// 3. Execute with context
const result = await runner.execute('read', args, {
  repo: 'myproject',
  sessionId: 'session-456',
  nodeId: 'node-789',
  fileStore: fileStore,
  eventBus: eventBus
});

// 4. Return result to Agent
worker.postMessage({
  type: 'tool_result',
  callId: 'call-123',
  result: {
    success: true,
    output: 'fn main() {...}'
  }
});
```

### Dynamic Tool Approval Flow

```javascript
// 1. LLM generates new tool
const skillMdContent = await generateSkillMdFromDescription(description);

// 2. Store as pending (via Tool Store)
const toolId = await toolStore.addPendingTool({
  name: 'custom-analyzer',
  description: 'Analyzes code for patterns',
  skillMdContent: skillMdContent,
  requestedBy: 'llm'
});

// 3. Notify UI
eventBus.publish('tool:pending', { toolId, name: 'custom-analyzer' });

// 4. User reviews and approves
await toolStore.approveTool(toolId);
// Tool is written to OPFS .tools/custom-analyzer/SKILL.md

// 5. Tool is now available
const tools = await toolStore.scanTools('myproject');
// Includes custom-analyzer
```

---

## Testing Strategy

### Unit Tests
- Each tool tested in isolation
- Mock File Store dependencies
- Error case coverage

### Integration Tests
- Tool → File Store → OPFS
- Tool Runner → multiple tools
- Dynamic tool loading and execution

### Security Tests
- JS tool sandbox escape attempts
- Dynamic tool permission violations
- Timeout enforcement

---

## Success Criteria

Phase 3 is complete when:

- [ ] All 7 built-in tools implemented and tested
- [ ] Tool Runner executes tools with proper validation
- [ ] SKILL.md parser handles all valid formats
- [ ] Dynamic tools can be loaded and executed
- [ ] Security sandbox prevents unauthorized access
- [ ] All tests passing (>90% coverage)
- [ ] Interactive demos working
- [ ] Documentation complete

---

## Risks and Mitigation

| Risk | Mitigation |
|------|-----------|
| JS tool security | Strict sandbox, no browser globals, timeout protection |
| Dynamic tool complexity | Start with simple JavaScript execution, add instruction parsing later |
| Performance | Lazy loading, caching of tool definitions |
| Error handling | Comprehensive try/catch, clear error messages |

---

## Deliverables

### Code
- 7 built-in tools
- Tool Runner with registry
- SKILL.md parser
- Dynamic tool executor
- Unit and integration tests

### Documentation
- Tool reference guide
- SKILL.md authoring guide
- Security considerations
- API documentation

### Demos
- Tool playground (try each tool interactively)
- SKILL.md editor with live preview
- Dynamic tool approval workflow demo

---

**Document Status:** Draft  
**Last Updated:** 2026-02-08  
**Author:** Development Team
