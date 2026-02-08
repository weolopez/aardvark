# History Store

**Tool execution history and statistics tracking for analytics and debugging.**

## Overview

The History Store tracks all tool executions, providing comprehensive analytics, querying capabilities, and statistics. It integrates with the Event Bus for real-time updates and IndexedDB for persistent storage.

## Features

*   **Execution Recording**: Track start and completion of tool executions
*   **Querying**: Filter by session, tool, status, time range
*   **Statistics**: Success rates, average durations, tool usage patterns
*   **Timeline**: Visualize execution history over time
*   **Export**: JSONL and CSV export formats
*   **Aggregation**: Pre-computed statistics for fast queries
*   **Cleanup**: Automatic removal of old records

## Installation

```bash
npm install @aardvark/history-store
```

## Usage

```javascript
import { HistoryStore } from '@aardvark/history-store';

const historyStore = new HistoryStore();
await historyStore.initialize();

// Record a tool execution
const executionId = await historyStore.recordStart(
  'session-123',
  'node-456',
  'read',
  { path: 'src/main.js' }
);

// Later, when tool completes
await historyStore.recordComplete(executionId, {
  success: true,
  output: 'file content...'
});

// Query executions
const recentExecutions = await historyStore.getExecutions({
  limit: 10,
  sortBy: 'startedAt',
  sortOrder: 'desc'
});

// Get statistics
const stats = await historyStore.getStats();
console.log(`Success rate: ${stats.successfulExecutions}/${stats.totalExecutions}`);

// Get tool usage
const popularTools = await historyStore.getPopularTools(5);
```

## Events

| Event | Data | Description |
|-------|------|-------------|
| `execution:started` | `{ executionId, sessionId, toolName }` | Tool execution started |
| `execution:completed` | `{ executionId, duration, status }` | Execution completed successfully |
| `execution:failed` | `{ executionId, error }` | Execution failed |

## API Reference

### Constructor

```javascript
const historyStore = new HistoryStore({
  eventBus: eventBusInstance,  // Optional
  db: dbProviderInstance       // Optional
});
```

### Methods

#### Recording

- `recordExecution(record: ExecutionRecordInput): Promise<string>` - Record complete execution
- `recordStart(sessionId, nodeId, toolName, args): Promise<string>` - Record start, returns executionId
- `recordComplete(executionId, result): Promise<void>` - Record completion

#### Querying

- `getExecution(executionId): Promise<ExecutionRecord|null>` - Get single execution
- `getExecutions(options): Promise<ExecutionRecord[]>` - Query with filters
- `getExecutionsBySession(sessionId): Promise<ExecutionRecord[]>` - Get by session
- `getExecutionsByTool(toolName): Promise<ExecutionRecord[]>` - Get by tool
- `getExecutionsByNode(sessionId, nodeId): Promise<ExecutionRecord[]>` - Get by node

#### Statistics

- `getStats(options): Promise<ExecutionStats>` - Overall statistics
- `getToolStats(toolName): Promise<ToolStats>` - Tool-specific stats
- `getSessionStats(sessionId): Promise<SessionExecutionStats>` - Session stats
- `getPopularTools(limit): Promise<ToolUsage[]>` - Most used tools
- `getExecutionTimeline(sessionId): Promise<TimelineEntry[]>` - Timeline data

#### Cleanup

- `deleteOldExecutions(before): Promise<number>` - Delete old records
- `clearHistory(): Promise<void>` - Clear all history

## Data Types

### ExecutionRecord

```typescript
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
```

### ExecutionStats

```typescript
interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  totalDuration: number;
  uniqueTools: number;
  dateRange: { from: number; to: number };
}
```

## Aggregations

The module also exports aggregation functions for custom analysis:

```javascript
import { 
  calculateStats, 
  calculateToolUsage,
  calculateSuccessRateOverTime,
  exportToJsonl,
  exportToCsv 
} from '@aardvark/history-store';

const stats = calculateStats(executions);
const usage = calculateToolUsage(executions);
const jsonl = exportToJsonl(executions);
```

## IndexedDB Schema

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

## Testing

```bash
npm test
# Opens tests/unit/history-store.spec.html in browser
```

## Demo

```bash
npm run demo
# Opens demo/index.html in browser
```

## Dependencies

- `@aardvark/event-bus` - Event publishing
- `@aardvark/indexeddb-provider` - History storage
