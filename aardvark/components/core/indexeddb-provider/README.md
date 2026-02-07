# IndexedDB Provider Component

Structured data storage using IndexedDB with schema support and change subscriptions.

## Overview

The IndexedDB Provider provides a Promise-based API for IndexedDB operations, with support for:
- Multiple object stores with schemas
- Indexes for efficient queries
- Change subscriptions (store-wide and key-specific)
- Schema versioning and auto-migration
- Predefined schema for Aardvark application

Based on 03-kv-worker architecture patterns.

## Installation

```javascript
import { IndexedDBProvider, AardvarkSchema } from './src/index.js';
```

## Usage

### Basic Example

```javascript
import { IndexedDBProvider } from './src/index.js';

const db = new IndexedDBProvider('my-app', 1);

// Initialize with schema
await db.initialize([
  { name: 'users', keyPath: 'id' },
  { name: 'settings', keyPath: 'key' }
]);

// Store data
await db.set('users', 'user-1', { id: 'user-1', name: 'John' });

// Retrieve data
const user = await db.get('users', 'user-1');
console.log(user); // { id: 'user-1', name: 'John' }
```

### Using Aardvark Schema

```javascript
import { db, AardvarkSchema } from './src/index.js';

// Initialize with predefined Aardvark schema
await db.initialize(AardvarkSchema);

// Store session
await db.set('sessions', 'session-1', {
  sessionId: 'session-1',
  created: Date.now(),
  data: {...}
});

// Query by index
const recentSessions = await db.query(
  'sessions', 
  'created', 
  IDBKeyRange.lowerBound(Date.now() - 86400000) // Last 24 hours
);
```

### Change Subscriptions

```javascript
// Subscribe to all changes in a store
const unsubscribe = db.subscribe('sessions', (change) => {
  console.log('Session changed:', change.key, change.value);
});

// Subscribe to specific key changes
const unsubscribeKey = db.subscribeKey('settings', 'apiKey', (value) => {
  console.log('API key changed:', value);
});

// Later: unsubscribe
unsubscribe();
unsubscribeKey();
```

### Complete CRUD Example

```javascript
import { IndexedDBProvider } from './src/index.js';

const db = new IndexedDBProvider();

await db.initialize([
  { 
    name: 'todos', 
    keyPath: 'id',
    indexes: [
      { name: 'completed', keyPath: 'completed', unique: false },
      { name: 'priority', keyPath: 'priority', unique: false }
    ]
  }
]);

// Create
await db.set('todos', 'todo-1', { 
  id: 'todo-1', 
  text: 'Learn IndexedDB',
  completed: false,
  priority: 'high'
});

// Read
const todo = await db.get('todos', 'todo-1');

// Update
await db.set('todos', 'todo-1', { ...todo, completed: true });

// Delete
await db.delete('todos', 'todo-1');

// Query by index
const completedTodos = await db.query(
  'todos',
  'completed',
  IDBKeyRange.only(true)
);

// Get all
const allTodos = await db.getAll('todos');

// Clear store
await db.clear('todos');
```

## API Reference

### IndexedDBProvider

#### Constructor
```javascript
new IndexedDBProvider(dbName = 'aardvark-db', version = 1)
```

#### Methods

- `initialize(stores)` - Initialize database with schema
- `get(store, key)` - Get value by key
- `set(store, key, value)` - Set value by key
- `delete(store, key)` - Delete value by key
- `getAll(store)` - Get all values from store
- `getAllKeys(store)` - Get all keys from store
- `query(store, indexName, keyRange)` - Query by index
- `clear(store)` - Clear all data from store
- `subscribe(store, callback)` - Subscribe to store changes
- `subscribeKey(store, key, callback)` - Subscribe to key changes
- `close()` - Close database connection

### StoreSchema

```javascript
{
  name: 'storeName',        // Store name (required)
  keyPath: 'id',            // Primary key field
  autoIncrement: false,     // Auto-increment keys
  indexes: [                // Indexes for querying
    { name: 'created', keyPath: 'created', unique: false }
  ]
}
```

### AardvarkSchema

Predefined schema for Aardvark application:

- **sessions** - Session tree data with `created` and `modified` indexes
- **pending_tools** - Pending tool approvals with `status` and `created` indexes
- **history** - Tool execution history with `sessionId` and `timestamp` indexes
- **settings** - Application settings (key-value store)

## Architecture

Based on 03-kv-worker design patterns:

- **Promise-based API**: Wraps IndexedDB's callback API
- **Connection Management**: Single database connection with version change handling
- **Schema Migration**: Auto-creates stores in `onupgradeneeded`
- **Subscription Pattern**: Notify listeners on data changes
- **Error Isolation**: Try/catch around listener callbacks

## Browser Support

- Chrome 23+
- Edge 12+
- Firefox 16+
- Safari 10+

IndexedDB is supported in all modern browsers.

## Testing

Open `tests/unit/indexeddb-provider.spec.html` in a browser.

## License

MIT
