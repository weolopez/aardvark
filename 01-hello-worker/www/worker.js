// worker.js - Web Worker that loads and runs Rust/WASM
//
// This worker:
// 1. Loads the WASM module
// 2. Listens for messages from the main thread
// 3. Calls Rust functions and sends results back

import initWasm, {
    init,
    greet,
    add,
    reverse_string,
    count_words,
    is_prime
} from './pkg/hello_worker.js';

// Initialize WASM module
async function loadWasm() {
    try {
        await initWasm();
        init();
        
        // Tell main thread we're ready
        self.postMessage({ type: 'ready' });
        console.log('[Worker] WASM module loaded and ready');
    } catch (error) {
        console.error('[Worker] Failed to load WASM:', error);
        self.postMessage({ type: 'error', error: error.toString() });
    }
}

// Handle messages from main thread
self.onmessage = function(event) {
    const { id, type, payload } = event.data;
    
    console.log('[Worker] Received message:', type, payload);
    
    try {
        let result;
        
        switch (type) {
            case 'greet':
                result = greet(payload.name);
                break;
                
            case 'add':
                result = add(payload.a, payload.b);
                break;
                
            case 'reverse':
                result = reverse_string(payload.text);
                break;
                
            case 'count_words':
                result = count_words(payload.text);
                break;
                
            case 'is_prime':
                result = is_prime(payload.number);
                break;
                
            case 'ping':
                result = 'pong';
                break;
                
            default:
                throw new Error(`Unknown operation: ${type}`);
        }
        
        // Send result back to main thread
        self.postMessage({ id, type: 'result', result });
        
    } catch (error) {
        console.error('[Worker] Error:', error);
        self.postMessage({ id, type: 'error', error: error.toString() });
    }
};

// Start initialization
loadWasm();
