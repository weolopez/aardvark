// worker.js - Web Worker for Gemini Chat
//
// This worker handles:
// 1. WASM module initialization
// 2. API key management
// 3. Chat message processing
// 4. Conversation history

import initWasm, {
    init,
    validate_api_key,
    build_request_body,
    parse_response,
    add_to_history,
    call_gemini_api
} from './pkg/gemini_worker.js';

// State
let wasmReady = false;
let apiKey = '';
let conversationHistory = '[]';

// Initialize WASM
async function loadWasm() {
    try {
        await initWasm();
        init();
        wasmReady = true;
        
        self.postMessage({ type: 'ready' });
        console.log('[Worker] WASM module initialized');
    } catch (error) {
        console.error('[Worker] Failed to initialize WASM:', error);
        self.postMessage({ type: 'error', error: error.toString() });
    }
}

// Handle messages from main thread
self.onmessage = async function(event) {
    const { type, payload } = event.data;
    
    console.log('[Worker] Received:', type);
    
    switch (type) {
        case 'set_api_key': {
            apiKey = payload.apiKey || '';
            const isValid = validate_api_key(apiKey);
            self.postMessage({ 
                type: 'api_key_status', 
                hasKey: isValid,
                ready: wasmReady 
            });
            break;
        }
        
        case 'chat': {
            if (!apiKey) {
                self.postMessage({
                    type: 'error',
                    error: 'API key is missing. Please set your Gemini API key.',
                    errorCode: 'MISSING_API_KEY'
                });
                return;
            }
            
            const { message } = payload;
            
            // Signal that we're processing
            self.postMessage({ type: 'thinking' });
            
            try {
                // Build request body with history
                const requestBody = build_request_body(conversationHistory, message);
                
                // Call Gemini API
                const resultJson = await call_gemini_api(apiKey, requestBody);
                const result = JSON.parse(resultJson);
                
                if (result.success) {
                    // Add user message to history
                    conversationHistory = add_to_history(conversationHistory, 'user', message);
                    // Add assistant response to history
                    conversationHistory = add_to_history(conversationHistory, 'model', result.message);
                    
                    self.postMessage({
                        type: 'response',
                        message: result.message
                    });
                } else {
                    self.postMessage({
                        type: 'error',
                        error: result.error,
                        errorCode: result.error_code
                    });
                }
            } catch (error) {
                console.error('[Worker] Chat error:', error);
                self.postMessage({
                    type: 'error',
                    error: error.toString(),
                    errorCode: 'WORKER_ERROR'
                });
            }
            break;
        }
        
        case 'clear_history': {
            conversationHistory = '[]';
            self.postMessage({ type: 'history_cleared' });
            break;
        }
        
        case 'get_history': {
            self.postMessage({ 
                type: 'history', 
                history: conversationHistory 
            });
            break;
        }
        
        case 'ping': {
            self.postMessage({ 
                type: 'pong', 
                ready: wasmReady,
                hasKey: !!apiKey
            });
            break;
        }
        
        default:
            console.warn('[Worker] Unknown message type:', type);
    }
};

// Start
loadWasm();
