/**
 * EventBus - Pub/sub messaging system
 * Provides decoupled communication between components
 */
export class EventBus {
  constructor() {
    this.handlers = new Map();
    this.subscriptions = new Map();
    this.subscriptionId = 0;
  }

  subscribe(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(handler);
    
    const id = ++this.subscriptionId;
    this.subscriptions.set(id, { event, handler });
    return id;
  }

  unsubscribe(subscriptionId) {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) return;
    
    const handlers = this.handlers.get(sub.event);
    if (handlers) {
      handlers.delete(sub.handler);
      if (handlers.size === 0) {
        this.handlers.delete(sub.event);
      }
    }
    this.subscriptions.delete(subscriptionId);
  }

  publish(event, data) {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Event handler error for "${event}":`, error);
      }
    });
  }

  once(event, handler) {
    const id = this.subscribe(event, (data) => {
      this.unsubscribe(id);
      handler(data);
    });
  }

  clear() {
    this.handlers.clear();
    this.subscriptions.clear();
  }

  subscriberCount(event) {
    const handlers = this.handlers.get(event);
    return handlers ? handlers.size : 0;
  }
}

export const SystemEvents = {
  SYSTEM_READY: 'system:ready',
  SYSTEM_ERROR: 'system:error',
  TOOL_CALL: 'tool:call',
  TOOL_RESULT: 'tool:result',
  SESSION_UPDATE: 'session:update',
  STORAGE_CHANGE: 'storage:change',
  UI_COMMAND: 'ui:command'
};

export const globalEventBus = new EventBus();
export default EventBus;
