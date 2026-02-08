# Tool Store

**Tool definitions and pending approval workflow for dynamic tool management.**

## Overview

The Tool Store manages tool discovery from OPFS `.tools/` directories, SKILL.md parsing, and the approval workflow for dynamically created tools. It integrates with File Store for file operations and Event Bus for reactive updates.

## Features

*   **Tool Discovery**: Automatically scans `.tools/` directories for SKILL.md files
*   **SKILL.md Parsing**: Extracts YAML frontmatter and markdown instructions
*   **Approval Workflow**: Queue for tools awaiting user approval
*   **Registry Caching**: In-memory cache of available tools for fast lookup
*   **Event-Driven**: Publishes events for tool lifecycle changes
*   **Validation**: Validates tool definitions and SKILL.md format

## Installation

Import directly as an ES module:

```javascript
import { ToolStore } from './src/index.js';

const toolStore = new ToolStore();
await toolStore.initialize();

// Scan a repository for tools
const tools = await toolStore.scanTools('myproject');
console.log(`Found ${tools.length} tools`);

// Get a specific tool
const tool = await toolStore.getTool('myproject', 'count-lines');
console.log(tool.description);

// Create a new tool
const skillMd = `---
name: my-tool
description: Does something useful
allowed-tools: "read, write"
version: 1.0.0
---

# My Tool

Instructions here...
`;

await toolStore.createTool('myproject', 'my-tool', skillMd);
```

## SKILL.md Format

Tools are defined using SKILL.md files with YAML frontmatter:

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

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Tool identifier (lowercase, hyphens, numbers) |
| `description` | Yes | Brief description for LLM matching |
| `allowed-tools` | No | Comma-separated list of tools this tool can use |
| `version` | No | Tool version (e.g., "1.0.0") |
| `author` | No | Tool author |

## Architecture

### Tool Discovery

```
.tools/
├── count-lines/
│   └── SKILL.md
├── find-unused/
│   └── SKILL.md
└── custom-analyzer/
    └── SKILL.md
```

The Tool Store scans the `.tools/` directory in each repository and parses all SKILL.md files found.

### Approval Workflow

1. LLM or user requests a new tool
2. Tool is added to `pending_tools` store with status "pending"
3. UI displays SKILL.md for user review
4. User approves → Tool is written to `.tools/{name}/SKILL.md`
5. User rejects → Tool stays in pending store with status "rejected"

### Events

| Event | Data | Description |
|-------|------|-------------|
| `tool:discovered` | `{ repo, tool, path }` | Tool found during scan |
| `tool:created` | `{ repo, tool }` | New tool created |
| `tool:updated` | `{ repo, tool }` | Tool definition updated |
| `tool:deleted` | `{ repo, name }` | Tool deleted |
| `tool:pending` | `{ toolId, name, requestedBy }` | Tool awaiting approval |
| `tool:approved` | `{ toolId, repo, name }` | Pending tool approved |
| `tool:rejected` | `{ toolId, name, reason }` | Pending tool rejected |

## API Reference

### Constructor

```javascript
const toolStore = new ToolStore({
  fileStore: fileStoreInstance,  // Optional
  eventBus: eventBusInstance,    // Optional
  db: dbProviderInstance         // Optional
});
```

### Methods

#### Tool Discovery

- `scanTools(repo: string): Promise<ToolDefinition[]>` - Scan a repo for tools
- `scanAllRepos(): Promise<Map<string, ToolDefinition[]>>` - Scan all repos
- `getTool(repo: string, name: string): Promise<ToolDefinition|null>` - Get a tool
- `listTools(repo?: string): Promise<ToolDefinition[]>` - List all tools

#### Tool CRUD

- `createTool(repo: string, name: string, skillMd: string): Promise<ToolDefinition>` - Create tool
- `updateTool(repo: string, name: string, skillMd: string): Promise<ToolDefinition>` - Update tool
- `deleteTool(repo: string, name: string): Promise<void>` - Delete tool

#### Approval Workflow

- `addPendingTool(toolInput: PendingToolInput): Promise<string>` - Add to queue
- `getPendingTool(toolId: string): Promise<PendingTool|null>` - Get pending tool
- `listPendingTools(status?: string): Promise<PendingTool[]>` - List pending tools
- `approveTool(toolId: string, repo?: string): Promise<ToolDefinition>` - Approve tool
- `rejectTool(toolId: string, reason?: string): Promise<void>` - Reject tool

#### Registry

- `refreshRegistry(): Promise<void>` - Refresh cache from filesystem
- `getRegistry(): Map<string, ToolDefinition>` - Get current registry

## Testing

```bash
npm test
# Opens tests/unit/tool-store.spec.html in browser
```

## Demo

```bash
npm run demo
# Opens demo/index.html in browser
```

## Dependencies

- File Store component - File operations
- Event Bus component - Event publishing
- IndexedDB Provider component - Pending tools storage
- js-yaml (CDN) - YAML parsing
