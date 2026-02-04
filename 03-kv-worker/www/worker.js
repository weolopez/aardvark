// worker.js - Web Worker for IndexedDB Key-Value Store
//
// HYBRID ARCHITECTURE:
// - This JavaScript file handles IndexedDB operations (callbacks, transactions)
// - Rust/WASM handles validation, search, transformation
//
// Why JavaScript for IndexedDB?
// - IndexedDB has a complex callback-based API
// - Transaction handling is awkward in Rust
// - JavaScript is natural for this

import initWasm, {
    init,
    validate_key,
    validate_value,
    transform_value,
    search_values,
    filter_by_prefix,
    sort_entries,
    get_stats,
    merge_objects
} from './pkg/kv_worker.js';

// ============================================================================
// State
// ============================================================================

let wasmReady = false;
const dbConnections = new Map(); // dbName -> IDBDatabase

// ============================================================================
// IndexedDB Operations (JavaScript)
// ============================================================================

function openDatabase(dbName, storeName) {
    return new Promise((resolve, reject) => {
        const key = `${dbName}::${storeName}`;
        
        // Return cached connection if available
        if (dbConnections.has(key)) {
            resolve(dbConnections.get(key));
            return;
        }

        const request = indexedDB.open(dbName, 1);

        request.onerror = () => reject(request.error);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName);
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            
            // Handle version change (another tab opened newer version)
            db.onversionchange = () => {
                db.close();
                dbConnections.delete(key);
            };

            // Ensure store exists
            if (!db.objectStoreNames.contains(storeName)) {
                db.close();
                dbConnections.delete(key);
                // Trigger upgrade by incrementing version
                const version = db.version + 1;
                const upgradeRequest = indexedDB.open(dbName, version);
                upgradeRequest.onupgradeneeded = (e) => {
                    e.target.result.createObjectStore(storeName);
                };
                upgradeRequest.onsuccess = () => {
                    dbConnections.set(key, upgradeRequest.result);
                    resolve(upgradeRequest.result);
                };
                upgradeRequest.onerror = () => reject(upgradeRequest.error);
                return;
            }

            dbConnections.set(key, db);
            resolve(db);
        };
    });
}

async function getValue(dbName, storeName, key) {
    const db = await openDatabase(dbName, storeName);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function setValue(dbName, storeName, key, value) {
    const db = await openDatabase(dbName, storeName);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.put(value, key);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function removeValue(dbName, storeName, key) {
    const db = await openDatabase(dbName, storeName);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.delete(key);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getAllKeys(dbName, storeName) {
    const db = await openDatabase(dbName, storeName);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const request = store.getAllKeys();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllEntries(dbName, storeName) {
    const db = await openDatabase(dbName, storeName);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const entries = [];
        
        const request = store.openCursor();
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                entries.push({ key: cursor.key, value: cursor.value });
                cursor.continue();
            } else {
                resolve(entries);
            }
        };
        
        request.onerror = () => reject(request.error);
    });
}

async function clearStore(dbName, storeName) {
    const db = await openDatabase(dbName, storeName);
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function listStores(dbName) {
    const db = await openDatabase(dbName, 'default');
    return Array.from(db.objectStoreNames);
}

// ============================================================================
// Initialization
// ============================================================================

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

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async function(event) {
    const { id, type, db, store, key, value, search, prefix, ascending } = event.data;
    
    const respond = (result) => {
        self.postMessage({ id, ...result });
    };
    
    console.log('[Worker] Received:', type);
    
    try {
        switch (type) {
            case 'get': {
                // Validate key using Rust
                const keyResult = JSON.parse(validate_key(key));
                if (!keyResult.success) {
                    respond({ success: false, error: keyResult.error });
                    return;
                }
                
                const result = await getValue(db, store, key);
                respond({ success: true, value: result });
                break;
            }
            
            case 'set': {
                // Validate using Rust
                const keyResult = JSON.parse(validate_key(key));
                if (!keyResult.success) {
                    respond({ success: false, error: keyResult.error });
                    return;
                }
                
                const valueJson = JSON.stringify(value);
                const valueResult = JSON.parse(validate_value(valueJson));
                if (!valueResult.success) {
                    respond({ success: false, error: valueResult.error });
                    return;
                }
                
                // Transform value using Rust (normalization, etc.)
                const transformed = JSON.parse(transform_value(valueJson));
                const finalValue = transformed.success ? transformed.value : value;
                
                await setValue(db, store, key, finalValue);
                respond({ success: true });
                break;
            }
            
            case 'remove': {
                const keyResult = JSON.parse(validate_key(key));
                if (!keyResult.success) {
                    respond({ success: false, error: keyResult.error });
                    return;
                }
                
                await removeValue(db, store, key);
                respond({ success: true });
                break;
            }
            
            case 'keys': {
                const keys = await getAllKeys(db, store);
                respond({ success: true, keys });
                break;
            }
            
            case 'clear': {
                await clearStore(db, store);
                respond({ success: true });
                break;
            }
            
            case 'find': {
                // Get all entries from IndexedDB
                const entries = await getAllEntries(db, store);
                // Search using Rust
                const searchResult = JSON.parse(search_values(JSON.stringify(entries), search));
                
                if (searchResult.success) {
                    // Convert array of entries back to object
                    const matches = {};
                    for (const entry of searchResult.value || []) {
                        matches[entry.key] = entry.value;
                    }
                    respond({ success: true, value: matches });
                } else {
                    respond({ success: false, error: searchResult.error });
                }
                break;
            }
            
            case 'filterByPrefix': {
                const entries = await getAllEntries(db, store);
                const filterResult = JSON.parse(filter_by_prefix(JSON.stringify(entries), prefix));
                respond(filterResult);
                break;
            }
            
            case 'getStats': {
                const entries = await getAllEntries(db, store);
                const statsResult = JSON.parse(get_stats(JSON.stringify(entries)));
                respond(statsResult);
                break;
            }
            
            case 'listStores': {
                const stores = await listStores(db);
                respond({ success: true, keys: stores });
                break;
            }
            
            case 'merge': {
                // Get existing value
                const existing = await getValue(db, store, key);
                const existingJson = JSON.stringify(existing || {});
                const patchJson = JSON.stringify(value);
                
                // Merge using Rust
                const mergeResult = JSON.parse(merge_objects(existingJson, patchJson));
                
                if (mergeResult.success) {
                    await setValue(db, store, key, mergeResult.value);
                    respond({ success: true, value: mergeResult.value });
                } else {
                    respond({ success: false, error: mergeResult.error });
                }
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
        respond({ success: false, error: error.message || error.toString() });
    }
};

// Start
loadWasm();
