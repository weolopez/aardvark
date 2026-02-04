// worker.js - Web Worker for Task Management
//
// This worker handles all task operations via Rust/WASM.
// The Rust code directly manages IndexedDB for persistence.
//
// Architecture:
// Main Thread (TaskManager.js) <-> Worker (this file) <-> Rust/WASM <-> IndexedDB

import initWasm, {
    init,
    task_create,
    task_update,
    task_list,
    task_get,
    task_delete,
    task_hydrate,
    task_stats
} from './pkg/task_worker.js';

let wasmReady = false;

// ============================================================================
// Initialization
// ============================================================================

async function loadWasm() {
    try {
        await initWasm();
        init();
        wasmReady = true;
        
        self.postMessage({ type: 'ready' });
        console.log('[Worker] Task Manager WASM initialized');
    } catch (error) {
        console.error('[Worker] Failed to initialize WASM:', error);
        self.postMessage({ 
            type: 'error', 
            error: error.toString()
        });
    }
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async function(event) {
    const { id, type, payload } = event.data;
    
    const respond = (result) => {
        self.postMessage({ id, type: `${type}_result`, ...result });
    };
    
    console.log('[Worker] Received:', type, payload);
    
    if (!wasmReady && type !== 'ping') {
        respond({ success: false, error: 'WASM not ready' });
        return;
    }
    
    try {
        let result;
        
        switch (type) {
            case 'create': {
                const { subject, description, metadata } = payload;
                result = await task_create(
                    subject || '',
                    description || '',
                    metadata
                );
                respond(result);
                break;
            }
            
            case 'update': {
                const { taskId, updates } = payload;
                result = await task_update(taskId, updates);
                respond(result);
                break;
            }
            
            case 'list': {
                const { filter } = payload || {};
                result = await task_list(filter);
                respond(result);
                break;
            }
            
            case 'get': {
                const { taskId } = payload;
                result = await task_get(taskId);
                respond(result);
                break;
            }
            
            case 'delete': {
                const { taskId } = payload;
                result = await task_delete(taskId);
                respond(result);
                break;
            }
            
            case 'hydrate': {
                const { markdown } = payload;
                result = await task_hydrate(markdown);
                respond(result);
                break;
            }
            
            case 'stats': {
                result = await task_stats();
                respond(result);
                break;
            }
            
            case 'ping': {
                respond({ success: true, ready: wasmReady });
                break;
            }
            
            default:
                respond({ success: false, error: `Unknown operation: ${type}` });
        }
    } catch (error) {
        console.error('[Worker] Operation error:', error);
        respond({ success: false, error: error.toString() });
    }
};

// Start initialization
loadWasm();
