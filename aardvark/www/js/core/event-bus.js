/**
 * EventBus - Pub/sub messaging system for component communication
 */
export class EventBus extends EventTarget {
  constructor() {
    super();
    this.handlers = new Map();
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  subscribe(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(handler);
    
    return () => this.handlers.get(event).delete(handler);
  }

  /**
   * Publish an event
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  publish(event, data) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (e) {
          console.error('Event handler error:', e);
        }
      });
    }
    
    // Also dispatch as DOM event for Lit components
    this.dispatchEvent(new CustomEvent(event, { detail: data }));
  }

  /**
   * Subscribe once to an event
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   */
  once(event, handler) {
    const wrappedHandler = (data) => {
      this.unsubscribe(event, wrappedHandler);
      handler(data);
    };
    this.subscribe(event, wrappedHandler);
  }

  /**
   * Clear all handlers
   */
  clear() {
    this.handlers.clear();
  }
}

// Create global event bus instance
export const globalEventBus = new EventBus();
