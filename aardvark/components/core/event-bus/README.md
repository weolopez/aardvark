# Event Bus Component

Pub/sub messaging system for inter-component communication.

## Overview

The Event Bus provides decoupled, event-driven communication between application components. It implements the publish-subscribe pattern, allowing components to communicate without direct dependencies.

## Features

- **Pub/Sub Messaging**: Publish events without knowing subscribers
- **Multiple Subscribers**: Multiple handlers per event
- **Error Isolation**: One handler failing doesn't break others
- **One-time Subscriptions**: Subscribe once with automatic cleanup
- **Subscription Management**: Unsubscribe by ID or clear all

## Installation

```javascript
import { EventBus, SystemEvents } from './src/index.js';
```

## Usage

### Basic Example

```javascript
import { EventBus } from './src/index.js';

const bus = new EventBus();

// Subscribe
const id = bus.subscribe('user:login', (data) => {
  console.log(`User ${data.username} logged in`);
});

// Publish
bus.publish('user:login', { username: 'john', timestamp: Date.now() });

// Unsubscribe
bus.unsubscribe(id);
```

### System Events

```javascript
import { EventBus, SystemEvents } from './src/index.js';

const bus = new EventBus();

bus.subscribe(SystemEvents.SYSTEM_READY, (data) => {
  console.log('System initialized:', data);
});

bus.publish(SystemEvents.SYSTEM_READY, { 
  timestamp: Date.now(),
  version: '1.0.0' 
});
```

### One-time Subscription

```javascript
bus.once('app:init', () => {
  console.log('App initialized (one-time)');
});
```

### Global Instance

```javascript
import { globalEventBus } from './src/index.js';

// Use for application-wide events
globalEventBus.publish('notification', { 
  message: 'Operation complete' 
});
```

## API Reference

### EventBus

#### `subscribe(event, handler): number`
Subscribe to an event.
- **event**: string - Event name
- **handler**: Function - Event handler
- **Returns**: Subscription ID (use to unsubscribe)

#### `unsubscribe(subscriptionId): void`
Unsubscribe using subscription ID.

#### `publish(event, data): void`
Publish an event with data.

#### `once(event, handler): void`
Subscribe once, auto-unsubscribe after first event.

#### `clear(): void`
Remove all subscriptions.

#### `subscriberCount(event): number`
Get count of subscribers for an event.

### SystemEvents

Predefined system event constants:

- `SYSTEM_READY` - System initialization complete
- `SYSTEM_ERROR` - Error occurred
- `TOOL_CALL` - Tool execution requested
- `TOOL_RESULT` - Tool execution completed
- `SESSION_UPDATE` - Session state changed
- `STORAGE_CHANGE` - Storage data changed
- `UI_COMMAND` - UI command triggered

## Architecture

- **Synchronous Delivery**: Handlers execute immediately on publish
- **Error Isolation**: Try/catch around each handler
- **Memory Safe**: Proper cleanup prevents leaks
- **Zero Dependencies**: Pure JavaScript

## Testing

Open `tests/unit/event-bus.spec.html` in a browser to run tests.

## Browser Support

All modern browsers with ES2020+ support.

## License

MIT
