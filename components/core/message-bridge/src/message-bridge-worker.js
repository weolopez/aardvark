/**
 * MessageBridge - Worker Side
 * 
 * Forwards messages from the Main Thread to the Worker's Event Bus.
 * Decouples worker and main thread communication through the event bus on each side.
 * 
 * Architecture:
 * - Main Thread: MessageBridgeMain listens for events from EventBus -> forwards to worker
 * - Worker: MessageBridgeWorker listens for messages from main -> publishes to EventBus
 * - Responses/events flow back through the same bridge
 */

/**
 * @typedef {Object} BridgeMessage
 * @property {string} event - The event name to be published on the destination Event Bus
 * @property {any} data - The data payload for the event
 */

/**
 * Message Bridge for Web Worker
 * Listens for messages from main thread and publishes to worker's EventBus
 */
export class MessageBridgeWorker {
  /**
   * Create a new MessageBridgeWorker
   * @param {Object} options - Configuration options
   * @param {Object} options.eventBus - EventBus instance for worker thread
   * @param {string[]} [options.forwardEvents=[]] - Events to forward to main thread
   * @param {string[]} [options.receiveEvents=[]] - Events to receive from main (all if empty)
   * @param {boolean} [options.autoStart=true] - Automatically start listening on creation
   */
  constructor(options) {
    this.eventBus = options.eventBus;
    this.forwardEvents = new Set(options.forwardEvents || []);
    this.receiveEvents = new Set(options.receiveEvents || []);
    this.autoStart = options.autoStart ?? true;
    
    this.isReady = false;
    this.subscriptions = new Map(); // event -> subscriptionId
    
    // Bind methods
    this._handleMessage = this._handleMessage.bind(this);
    this._sendToMain = this._sendToMain.bind(this);
    
    // Auto-start if configured
    if (this.autoStart) {
      this.start();
    }
  }
  
  /**
   * Start listening for messages from main thread
   */
  start() {
    if (this.isReady) {
      return;
    }
    
    // Set up message listener
    if (typeof self !== 'undefined') {
      self.onmessage = this._handleMessage;
    }
    
    // Subscribe to events that should be forwarded to main
    this._subscribeToForwardedEvents();
    
    // Mark as ready
    this.isReady = true;
    
    // Notify main thread that worker is ready
    this._notifyReady();
    
    console.log('[MessageBridgeWorker] Bridge started');
  }
  
  /**
   * Notify main thread that worker is ready
   * @private
   */
  _notifyReady() {
    if (typeof self !== 'undefined') {
      self.postMessage({ type: 'ready' });
    }
  }
  
  /**
   * Handle messages from main thread
   * @private
   */
  _handleMessage(event) {
    const { type, event: eventName, data } = event.data;
    
    switch (type) {
      case 'bridge-message':
        this._handleBridgeMessage(eventName, data);
        break;
        
      default:
        // Unknown message type - can be handled by subclass or ignored
        break;
    }
  }
  
  /**
   * Handle bridge messages by publishing to worker's EventBus
   * @private
   */
  _handleBridgeMessage(eventName, data) {
    // Filter if specific receive events are configured
    if (this.receiveEvents.size > 0 && !this.receiveEvents.has(eventName)) {
      return;
    }
    
    try {
      this.eventBus.publish(eventName, data);
    } catch (error) {
      console.error('[MessageBridgeWorker] Error publishing event:', error);
      this._sendError(error);
    }
  }
  
  /**
   * Subscribe to events that should be forwarded to main thread
   * @private
   */
  _subscribeToForwardedEvents() {
    // Clear existing subscriptions
    this._unsubscribeAll();
    
    // Subscribe to each event that should be forwarded
    for (const eventName of this.forwardEvents) {
      const subscriptionId = this.eventBus.subscribe(eventName, (data) => {
        this._sendToMain(eventName, data);
      });
      this.subscriptions.set(eventName, subscriptionId);
    }
  }
  
  /**
   * Send a message to the main thread
   * @private
   */
  _sendToMain(eventName, data) {
    if (typeof self === 'undefined') {
      console.warn('[MessageBridgeWorker] Not in worker context');
      return;
    }
    
    try {
      self.postMessage({
        type: 'bridge-message',
        event: eventName,
        data
      });
    } catch (error) {
      console.error('[MessageBridgeWorker] Failed to send message:', error);
      this._sendError(error);
    }
  }
  
  /**
   * Send an error to the main thread
   * @private
   */
  _sendError(error) {
    if (typeof self === 'undefined') {
      return;
    }
    
    try {
      self.postMessage({
        type: 'bridge-error',
        error: {
          message: error.message || error.toString(),
          stack: error.stack
        }
      });
    } catch (sendError) {
      console.error('[MessageBridgeWorker] Failed to send error:', sendError);
    }
  }
  
  /**
   * Add an event to forward to main thread
   * @param {string} eventName - Event to forward
   */
  forwardEvent(eventName) {
    if (this.forwardEvents.has(eventName)) {
      return;
    }
    
    this.forwardEvents.add(eventName);
    
    if (this.isReady) {
      const subscriptionId = this.eventBus.subscribe(eventName, (data) => {
        this._sendToMain(eventName, data);
      });
      this.subscriptions.set(eventName, subscriptionId);
    }
  }
  
  /**
   * Stop forwarding an event to main thread
   * @param {string} eventName - Event to stop forwarding
   */
  stopForwardingEvent(eventName) {
    this.forwardEvents.delete(eventName);
    
    const subscriptionId = this.subscriptions.get(eventName);
    if (subscriptionId) {
      this.eventBus.unsubscribe(subscriptionId);
      this.subscriptions.delete(eventName);
    }
  }
  
  /**
   * Unsubscribe from all forwarded events
   * @private
   */
  _unsubscribeAll() {
    for (const [eventName, subscriptionId] of this.subscriptions) {
      this.eventBus.unsubscribe(subscriptionId);
    }
    this.subscriptions.clear();
  }
  
  /**
   * Stop the bridge and clean up
   */
  stop() {
    // Unsubscribe from all events
    this._unsubscribeAll();
    
    // Remove message listener
    if (typeof self !== 'undefined') {
      self.onmessage = null;
    }
    
    this.isReady = false;
    this.forwardEvents.clear();
    this.receiveEvents.clear();
  }
  
  /**
   * Check if bridge is ready
   * @returns {boolean}
   */
  get ready() {
    return this.isReady;
  }
}

// Default export
export default MessageBridgeWorker;
