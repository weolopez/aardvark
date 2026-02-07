/**
 * MessageBridge - Main Thread Side
 * 
 * Forwards messages between the Web Worker and Main Thread via the Event Bus.
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
 * @typedef {Object} BridgeError
 * @property {string} event - The error event name
 * @property {Error} data - The error object
 */

/**
 * Message Bridge for Main Thread
 * Manages worker lifecycle and message forwarding
 */
export class MessageBridgeMain {
  /**
   * Create a new MessageBridgeMain
   * @param {Object} options - Configuration options
   * @param {string} options.workerUrl - URL to the worker script
   * @param {Object} options.eventBus - EventBus instance for main thread
   * @param {string[]} [options.forwardEvents=[]] - Events to forward to worker
   * @param {string[]} [options.receiveEvents=[]] - Events to receive from worker (all if empty)
   * @param {number} [options.reconnectDelay=1000] - Delay before reconnecting (ms)
   * @param {number} [options.maxReconnectAttempts=3] - Max reconnection attempts
   */
  constructor(options) {
    this.workerUrl = options.workerUrl;
    this.eventBus = options.eventBus;
    this.forwardEvents = new Set(options.forwardEvents || []);
    this.receiveEvents = new Set(options.receiveEvents || []);
    this.reconnectDelay = options.reconnectDelay ?? 1000;
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 3;
    
    this.worker = null;
    this.subscriptions = new Map(); // event -> subscriptionId
    this.isReady = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    
    // Event handlers bound to this instance
    this._handleWorkerMessage = this._handleWorkerMessage.bind(this);
    this._handleWorkerError = this._handleWorkerError.bind(this);
  }
  
  /**
   * Initialize the worker and start listening
   * @returns {Promise<void>}
   */
  async init() {
    if (this.worker) {
      return;
    }
    
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(this.workerUrl, { type: 'module' });
        
        // Set up message handler
        this.worker.onmessage = (event) => {
          const { type, event: eventName, data, error } = event.data;
          
          // Handle ready message
          if (type === 'ready') {
            this.isReady = true;
            this.reconnectAttempts = 0;
            this._subscribeToForwardedEvents();
            resolve();
            return;
          }
          
          // Handle bridge messages
          if (type === 'bridge-message') {
            this._handleWorkerMessage(eventName, data);
            return;
          }
          
          // Handle bridge errors
          if (type === 'bridge-error') {
            this._handleWorkerError(error);
            return;
          }
        };
        
        // Handle worker errors
        this.worker.onerror = (error) => {
          console.error('[MessageBridgeMain] Worker error:', error);
          this.eventBus.publish('bridge:error', { 
            error: error.message || 'Worker error',
            fatal: true 
          });
          reject(error);
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Handle messages from worker by publishing to main thread EventBus
   * @private
   */
  _handleWorkerMessage(eventName, data) {
    // Filter if specific receive events are configured
    if (this.receiveEvents.size > 0 && !this.receiveEvents.has(eventName)) {
      return;
    }
    
    this.eventBus.publish(eventName, data);
  }
  
  /**
   * Handle errors from worker
   * @private
   */
  _handleWorkerError(error) {
    this.eventBus.publish('bridge:error', { 
      error: error.message || error.toString(),
      fatal: false 
    });
  }
  
  /**
   * Subscribe to events that should be forwarded to worker
   * @private
   */
  _subscribeToForwardedEvents() {
    // Clear existing subscriptions
    this._unsubscribeAll();
    
    // Subscribe to each event that should be forwarded
    for (const eventName of this.forwardEvents) {
      const subscriptionId = this.eventBus.subscribe(eventName, (data) => {
        this._sendToWorker(eventName, data);
      });
      this.subscriptions.set(eventName, subscriptionId);
    }
  }
  
  /**
   * Send a message to the worker
   * @private
   */
  _sendToWorker(eventName, data) {
    if (!this.worker || !this.isReady) {
      console.warn('[MessageBridgeMain] Worker not ready, message dropped:', eventName);
      return;
    }
    
    try {
      this.worker.postMessage({
        type: 'bridge-message',
        event: eventName,
        data
      });
    } catch (error) {
      console.error('[MessageBridgeMain] Failed to send message:', error);
      this.eventBus.publish('bridge:error', { 
        error: `Failed to send message: ${error.message}`,
        event: eventName,
        fatal: false 
      });
    }
  }
  
  /**
   * Add an event to forward to worker
   * @param {string} eventName - Event to forward
   */
  forwardEvent(eventName) {
    if (this.forwardEvents.has(eventName)) {
      return;
    }
    
    this.forwardEvents.add(eventName);
    
    if (this.isReady) {
      const subscriptionId = this.eventBus.subscribe(eventName, (data) => {
        this._sendToWorker(eventName, data);
      });
      this.subscriptions.set(eventName, subscriptionId);
    }
  }
  
  /**
   * Stop forwarding an event to worker
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
   * Attempt to reconnect after worker crash
   * @private
   */
  async _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[MessageBridgeMain] Max reconnection attempts reached');
      this.eventBus.publish('bridge:error', { 
        error: 'Max reconnection attempts reached',
        fatal: true 
      });
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`[MessageBridgeMain] Reconnecting... (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.init();
        console.log('[MessageBridgeMain] Reconnected successfully');
        this.eventBus.publish('bridge:reconnected', { attempt: this.reconnectAttempts });
      } catch (error) {
        console.error('[MessageBridgeMain] Reconnection failed:', error);
        this._attemptReconnect();
      }
    }, this.reconnectDelay);
  }
  
  /**
   * Terminate the worker and clean up
   */
  terminate() {
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Unsubscribe from all events
    this._unsubscribeAll();
    
    // Terminate worker
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    
    this.isReady = false;
    this.forwardEvents.clear();
    this.receiveEvents.clear();
  }
  
  /**
   * Check if worker is ready
   * @returns {boolean}
   */
  get ready() {
    return this.isReady;
  }
}

// Default export
export default MessageBridgeMain;
