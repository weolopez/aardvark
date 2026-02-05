# 05 - Task Worker: Task Management for LLM Agents

A persistent task management system designed for AI agents running in the browser via WebAssembly. Inspired by Claude Code's task tools.

## 🎯 Features

- **Persistent Storage**: Tasks survive page reloads via IndexedDB
- **Dependency Management**: Tasks can block/unblock each other
- **Auto-unblocking**: Completing a task automatically unblocks dependents
- **Rich Metadata**: Custom JSON metadata for any task
- **Sub-agent Support**: Tasks can be assigned to sub-agents for orchestration
- **Scheduling**: Cron-like schedule field for recurring tasks
- **Markdown Import**: Hydrate tasks from markdown files

## 📁 Project Structure

```
05-task-worker/
├── Cargo.toml              # Rust dependencies
├── src/
│   └── lib.rs              # Rust task management (~1000 lines)
├── www/
│   ├── index.html          # Demo UI
│   ├── worker.js           # Web Worker bridge
│   ├── TaskManager.js      # Client API
│   └── pkg/                # Generated WASM (~170KB)
├── build.sh
└── README.md
```

## 🚀 Build & Run

```bash
# Build
./build.sh

# Run
cd www && python3 -m http.server 8080

# Open http://localhost:8080
```

## 📊 Task Structure

```typescript
interface Task {
    id: string;              // Unique auto-generated ID
    subject: string;         // Short title
    description: string;     // Detailed description
    status: TaskStatus;      // pending | in_progress | blocked | completed
    created_at: number;      // Timestamp (ms)
    updated_at: number;      // Timestamp (ms)
    blocked_by: string[];    // IDs of blocking tasks
    blocks: string[];        // IDs of tasks this blocks
    owner?: string;          // Assignment
    sub_agent?: string;      // Sub-agent for orchestration
    schedule?: string;       // Cron-like schedule
    metadata?: any;          // Custom JSON data
}
```

## 🔌 API Usage

### From JavaScript

```javascript
import { TaskManager } from './TaskManager.js';

const tasks = new TaskManager();
await tasks.ready();

// Create a task
const task = await tasks.create(
    'Build feature',
    'Implement the new feature',
    { priority: 'high' }  // optional metadata
);

// Update status
await tasks.update(task.id, { status: 'in_progress' });

// Complete (auto-unblocks dependents)
await tasks.complete(task.id);

// List tasks with filtering
const pending = await tasks.list({ status: 'pending' });
const ready = await tasks.getReady();  // pending with no blockers

// Manage dependencies
await tasks.block(taskA, taskB);    // taskA is blocked by taskB
await tasks.unblock(taskA, taskB);  // remove blocker

// Assign to owner or sub-agent
await tasks.assign(task.id, 'alice');
await tasks.assignSubAgent(task.id, 'code-reviewer');

// Get statistics
const stats = await tasks.stats();
// { total, pending, in_progress, blocked, completed, ready }

// Delete
await tasks.delete(task.id);
```

### Import from Markdown

```javascript
const markdown = `
## First Task
Description of the first task
- status: pending
- owner: agent-1

## Second Task  
Description of the second task
- status: in_progress
`;

const imported = await tasks.hydrate(markdown);
```

### Subscribe to Changes

```javascript
const unsubscribe = tasks.subscribe(({ type, data }) => {
    console.log('Task changed:', type, data);
});

// Later...
unsubscribe();
```

## 🏗️ Architecture

```
┌─────────────────────────────┐
│   LLM Agent / Application   │
│   (JavaScript or Rust)      │
└──────────────┬──────────────┘
               │ async calls
               ▼
┌─────────────────────────────┐
│       TaskManager.js        │
│   (Promise-based client)    │
└──────────────┬──────────────┘
               │ postMessage
               ▼
┌─────────────────────────────┐
│         worker.js           │
│   (Web Worker bridge)       │
└──────────────┬──────────────┘
               │ direct calls
               ▼
┌─────────────────────────────┐
│        Rust/WASM            │
│   - task_create()           │
│   - task_update()           │
│   - task_list()             │
│   - task_get()              │
│   - task_delete()           │
│   - task_hydrate()          │
│   - task_stats()            │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│         IndexedDB           │
│   MyAgentTasksDB            │
│   ├─ tasks (store)          │
│   └─ index (store)          │
└─────────────────────────────┘
```

## 🔑 Key Concepts

### Dependency Resolution

When a task is completed, the system automatically:
1. Removes the completed task from all dependent tasks' `blocked_by` arrays
2. If a dependent has no more blockers and was `blocked`, sets it to `pending`

```javascript
// Create tasks with dependencies
const taskA = await tasks.create('Task A', '...');
const taskB = await tasks.create('Task B', '...');

// B is blocked by A
await tasks.block(taskB.id, taskA.id);
// taskB.status is now 'blocked'

// Complete A
await tasks.complete(taskA.id);
// taskB.status is now 'pending' (auto-unblocked!)
```

### Sub-agent Orchestration

Tasks can be assigned to different sub-agents for parallel processing:

```javascript
await tasks.create('Review code', '...', { sub_agent: 'code-reviewer' });
await tasks.create('Write tests', '...', { sub_agent: 'test-writer' });
await tasks.create('Update docs', '...', { sub_agent: 'doc-writer' });

// Each sub-agent can query its assigned tasks
const reviewerTasks = await tasks.list({ sub_agent: 'code-reviewer' });
```

### Git Integration (via metadata)

```javascript
await tasks.create('Fix bug #123', 'Fix the login issue', {
    branch: 'fix/login-bug',
    commit: 'abc123',
    pr_url: 'https://github.com/...'
});
```

## 📈 Database Schema

### IndexedDB: `MyAgentTasksDB`

**Store: `tasks`**
- Key: task ID (string)
- Value: full Task object

**Store: `index`**
- Key: `"taskIndex"` (single entry)
- Value: `{ tasks: TaskSummary[], last_updated: number }`

The index provides fast listing without loading all task details.

## 🧪 For LLM Agents

This module is designed to be called by an LLM agent as a tool:

```
Tool: task_create
  Arguments: subject, description, metadata (optional)
  Returns: Created task object

Tool: task_update
  Arguments: task_id, updates (status, owner, add_blocked_by, etc.)
  Returns: Updated task object

Tool: task_list
  Arguments: filter (optional - status, owner, ready_only)
  Returns: Array of task summaries

Tool: task_get
  Arguments: task_id
  Returns: Full task object

Tool: task_delete
  Arguments: task_id
  Returns: Success status
```

The agent can use these tools to:
- Break down complex tasks into subtasks
- Track progress on multi-step operations
- Manage parallel work across sub-agents
- Persist state across sessions

## Coding Agent Goal Alignment

This project provides **structured task orchestration** — a capability the TypeScript agent lacks natively but that enables plan-mode and multi-step workflows in the browser agent.

| Coding Agent Requirement | How This Project Addresses It |
|--------------------------|-------------------------------|
| Multi-step task tracking | Tasks with dependencies model complex coding workflows |
| Sub-agent orchestration | `sub_agent` field enables parallel agent coordination |
| Persistent task state | IndexedDB storage survives page reloads and session switches |
| Markdown import | `task_hydrate()` can ingest task lists from LLM-generated plans |
| LLM tool integration | Tool-shaped API matches the [`AgentTool`](../agent/types.ts:157) interface pattern |

### Mapping to TypeScript Agent

| TypeScript Agent | Task Worker Equivalent |
|------------------|----------------------|
| No native plan mode | `task_create` / `task_list` / `task_update` provide structured planning |
| Manual steering messages | Auto-unblocking dependencies drives workflow progression |
| Single agent execution | `sub_agent` field enables multi-agent orchestration |
| Extension-based task tracking | First-class Rust implementation with persistence |

### Integration Points

- Combines with [03-kv-worker](../03-kv-worker/) for IndexedDB persistence
- Tasks can reference [04-github-worker](../04-github-worker/) file operations
- The [06-agent](../06-agent/) can register task tools for the LLM to call

**Status: ✅ Complete** — Full task lifecycle with dependency resolution and persistence.
