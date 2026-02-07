# Session Store

**Session tree persistence and management with branching support.**

## Overview

The Session Store manages conversation trees, allowing for branching, history reconstruction, and efficient querying. It is built on top of the IndexedDB Provider and uses the Event Bus for reactive updates.

## Features

*   **Tree Structure**: Linked nodes (parent/children) support infinite branching.
*   **Lazy Loading**: Efficiently handles large sessions.
*   **Context Reconstruction**: Rebuilds linear history from any node back to the root.
*   **Branch Management**: Create, list, and switch branches easily.
*   **Full-Text Search**: Search across session names and message content.

## Installation

```bash
npm install @aardvark/session-store
```

## Usage

```javascript
import { SessionStore } from '@aardvark/session-store';

const store = new SessionStore();
await store.initialize();

// Create a session
const sessionId = await store.createSession({ name: 'My Chat' });

// Add a user message
const nodeId = await store.addNode(sessionId, null, {
  role: 'user',
  content: 'Hello!'
});

// Add assistant reply
await store.addNode(sessionId, nodeId, {
  role: 'assistant',
  content: 'Hi there!'
});

// Get history (context for LLM)
const history = await store.getHistory(sessionId, latestNodeId);
```

## Architecture

Data is stored in IndexedDB:
*   `sessions`: Metadata about sessions.
*   `nodes`: Individual messages/turns, linked by `parentId`.

Events are published via the global Event Bus:
*   `session:created`, `session:updated`
*   `node:added`, `node:updated`
*   `branch:created`, `branch:switched`
