/**
 * Message Bridge - Worker/Main Thread Communication Component
 * 
 * Provides bidirectional communication between Web Worker and Main Thread
 * via the Event Bus on each side. Decouples worker and main thread through
 * the event bus pattern.
 * 
 * @module message-bridge
 */

export { MessageBridgeMain } from './message-bridge-main.js';
export { MessageBridgeWorker } from './message-bridge-worker.js';

// Re-export as defaults for convenience
export { MessageBridgeMain as default } from './message-bridge-main.js';
