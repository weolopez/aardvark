# Message Bridge Component

Bidirectional communication layer between Web Worker and Main Thread via the Event Bus. Decouples worker and main thread communication through event-based messaging.

## Overview

The Message Bridge enables seamless communication between the Main Thread (UI) and Web Worker (background processing) using a pub/sub pattern. Both sides communicate through their local Event Bus instances, with the bridge forwarding messages between contexts.

**Key Features:**
- Bidirectional message forwarding (Main ↔ Worker)
- Event-based architecture (no request/response coupling)
- Automatic reconnection on worker crash
- Error propagation to main thread
- Selective event filtering
- Configurable event forwarding

## Architecture

```
Main Thread                     Web Worker
   │                                │
   ├─ EventBus.subscribe() ────────┤
   │                                │
   ├─ MessageBridgeMain             ├─ MessageBridgeWorker
   │   ├─ postMessage() ─────────>  │   ├─ onmessage
   │   │                            │   │   ├─ EventBus.publish()
   │   │                            │   │
   │   │<─ postMessage() ────────── │   ├─ EventBus.subscribe()
   │   ├─ onmessage                 │       ├─ postMessage()
   │       ├─ EventBus.publish()    │
   │                                │
```

## Installation

```javascript
// Main Thread
import { MessageBridgeMain } from './src/index.js';

// Worker
import { MessageBridgeWorker } from './src/index.js';
```

## Usage

### Basic Example

**Main Thread:**
```javascript
import { MessageBridgeMain } from './components/core/message-bridge/src/index.js';
import { EventBus } from './components/core/event-bus/src/index.js';

const eventBus = new EventBus();

const bridge = new MessageBridgeMain({
  workerUrl: './worker.js',
  eventBus: eventBus,
  forwardEvents: ['worker:task', 'worker:command'],
  receiveEvents: ['worker:result', 'worker:progress']
});

await bridge.init();

// Publish events that get forwarded to worker
eventBus.publish('worker:task', { type: 'compute', data: [1, 2, 3] });

// Listen for events from worker
eventBus.subscribe('worker:result', (data) => {
  console.log('Result from worker:', data);
});
```

**Worker (worker.js):**
```javascript
import { MessageBridgeWorker } from './components/core/message-bridge/src/index.js';
import { EventBus } from './components/core/event-bus/src/index.js';

const eventBus = new EventBus();

const bridge = new MessageBridgeWorker({
  eventBus: eventBus,
  forwardEvents: ['worker:result', 'worker:progress'],
  receiveEvents: ['worker:task', 'worker:command']
});

// Listen for events from main thread
eventBus.subscribe('worker:task', async (data) => {
  const result = await performHeavyComputation(data);
  
  // Forward result to main thread
  eventBus.publish('worker:result', result);
});

// Start the bridge
bridge.start();
```

### Advanced Configuration

**Selective Event Forwarding:**
```javascript
const bridge = new MessageBridgeMain({
  workerUrl: './worker.js',
  eventBus: eventBus,
  // Only forward these specific events to worker
  forwardEvents: ['user:action', 'data:update'],
  // Only receive these specific events from worker
  receiveEvents: ['render:complete', 'error:occurred']
});
```

**Dynamic Event Management:**
```javascript
// Add new event to forward after initialization
bridge.forwardEvent('new:event');

// Stop forwarding an event
bridge.stopForwardingEvent('old:event');
```

**Reconnection Settings:**
```javascript
const bridge = new MessageBridgeMain({
  workerUrl: './worker.js',
  eventBus: eventBus,
  reconnectDelay: 2000,        // Wait 2s before reconnecting
  maxReconnectAttempts: 5      // Try 5 times before giving up
});
```

### Error Handling

```javascript
// Listen for bridge errors
eventBus.subscribe('bridge:error', ({ error, fatal }) => {
  if (fatal) {
    console.error('Bridge failed:', error);
    // Handle fatal error (e.g., show user message)
  } else {
    console.warn('Bridge warning:', error);
  }
});

// Listen for successful reconnections
eventBus.subscribe('bridge:reconnected', ({ attempt }) => {
  console.log(`Bridge reconnected after ${attempt} attempts`);
});
```

## API Reference

### MessageBridgeMain (Main Thread)

#### Constructor Options
```typescript
interface MessageBridgeMainOptions {
  workerUrl: string;              // URL to worker script
  eventBus: EventBus;             // Main thread EventBus instance
  forwardEvents?: string[];       // Events to forward to worker
  receiveEvents?: string[];       // Events to receive from worker
  reconnectDelay?: number;        // Reconnection delay (ms), default: 1000
  maxReconnectAttempts?: number;  // Max reconnection attempts, default: 3
}
```

#### Methods
- `init()` - Initialize worker and start listening
- `forwardEvent(eventName)` - Add event to forward list
- `stopForwardingEvent(eventName)` - Remove event from forward list
- `terminate()` - Stop bridge and terminate worker
- `ready` (getter) - Check if worker is ready

### MessageBridgeWorker (Web Worker)

#### Constructor Options
```typescript
interface MessageBridgeWorkerOptions {
  eventBus: EventBus;             // Worker EventBus instance
  forwardEvents?: string[];       // Events to forward to main
  receiveEvents?: string[];       // Events to receive from main
  autoStart?: boolean;            // Auto-start on creation, default: true
}
```

#### Methods
- `start()` - Start listening for messages from main
- `forwardEvent(eventName)` - Add event to forward list
- `stopForwardingEvent(eventName)` - Remove event from forward list
- `stop()` - Stop the bridge
- `ready` (getter) - Check if bridge is ready

## Message Format

### Bridge Message
```javascript
{
  type: 'bridge-message',
  event: 'event:name',    // Event name to publish
  data: { ... }           // Event data payload
}
```

### Bridge Error
```javascript
{
  type: 'bridge-error',
  error: {
    message: 'Error description',
    stack: 'Stack trace...'
  }
}
```

### Ready Signal
```javascript
{
  type: 'ready'  // Sent by worker when bridge is initialized
}
```

## Testing

Open the test page in a browser:
```
http://localhost:8000/www/tests/index.html
```

Or run individual test files:
```
components/core/message-bridge/tests/unit/message-bridge-main.spec.html
components/core/message-bridge/tests/unit/message-bridge-worker.spec.html
```

## Browser Support

- Chrome 60+ (ES modules in workers)
- Firefox 60+ (ES modules in workers)
- Safari 15+ (ES modules in workers)
- Edge 79+ (ES modules in workers)

**Note:** ES modules in Web Workers require relatively modern browsers. For older browsers, a build step with bundling would be needed.

## Design Principles

1. **Decoupled Communication** - No direct request/response; all communication through Event Bus
2. **Error Isolation** - Worker errors don't crash the main thread
3. **Automatic Recovery** - Handles worker crashes gracefully with reconnection
4. **Selective Forwarding** - Only forward relevant events to minimize overhead
5. **Zero Dependencies** - Pure JavaScript, no external libraries

## License

MIT
