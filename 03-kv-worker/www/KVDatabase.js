// KVDatabase.js - Client-side wrapper for the Rust/WASM KV Worker
//
// This provides a clean Promise-based API that communicates with the Web Worker.
// Usage is similar to the original KVDatabase but operations run in a background thread.

export class KVDatabase {
    static worker = null;
    static pending = new Map(); // id -> { resolve, reject }
    static nextId = 1;
    static readyPromise = null;
    static instances = new Map(); // "db::store" -> instance
    
    /**
     * Initialize the shared worker (call once at app startup)
     */
    static init() {
        if (KVDatabase.worker) {
            return KVDatabase.readyPromise;
        }
        
        KVDatabase.readyPromise = new Promise((resolve, reject) => {
            KVDatabase.worker = new Worker('./worker.js', { type: 'module' });
            
            KVDatabase.worker.onmessage = (event) => {
                const { id, type, success, value, keys, error } = event.data;
                
                // Handle ready message
                if (type === 'ready') {
                    console.log('[KVDatabase] Worker ready');
                    resolve();
                    return;
                }
                
                // Handle responses to requests
                if (id && KVDatabase.pending.has(id)) {
                    const { resolve: res, reject: rej } = KVDatabase.pending.get(id);
                    KVDatabase.pending.delete(id);
                    
                    if (success) {
                        res({ value, keys });
                    } else {
                        rej(new Error(error || 'Unknown error'));
                    }
                }
            };
            
            KVDatabase.worker.onerror = (error) => {
                console.error('[KVDatabase] Worker error:', error);
                reject(error);
            };
        });
        
        return KVDatabase.readyPromise;
    }
    
    /**
     * Send a message to the worker and wait for response
     */
    static _send(message) {
        return new Promise((resolve, reject) => {
            const id = KVDatabase.nextId++;
            KVDatabase.pending.set(id, { resolve, reject });
            KVDatabase.worker.postMessage({ id, ...message });
            
            // Timeout after 30 seconds
            setTimeout(() => {
                if (KVDatabase.pending.has(id)) {
                    KVDatabase.pending.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }
    
    /**
     * @param {string} dbName - The name of the IndexedDB database
     * @param {string} storeName - The name of the Object Store
     */
    constructor(dbName, storeName) {
        const key = `${dbName}::${storeName}`;
        
        // Singleton pattern per db/store combination
        if (KVDatabase.instances.has(key)) {
            return KVDatabase.instances.get(key);
        }
        
        this.dbName = dbName;
        this.storeName = storeName;
        this.listeners = []; // For change notifications
        this.keyListeners = new Map();
        
        KVDatabase.instances.set(key, this);
    }
    
    /**
     * Ensure worker is ready before operations
     */
    async _ready() {
        if (!KVDatabase.worker) {
            await KVDatabase.init();
        }
        await KVDatabase.readyPromise;
    }
    
    _notify(key, value, action = 'set') {
        // Global listeners
        this.listeners.forEach(cb => {
            try {
                cb({ action, key, value });
            } catch (e) {
                console.error('[KVDatabase] Listener error:', e);
            }
        });
        
        // Key-specific listeners
        if (this.keyListeners.has(key)) {
            this.keyListeners.get(key).forEach(cb => {
                try {
                    cb(value);
                } catch (e) {
                    console.error('[KVDatabase] Key listener error:', e);
                }
            });
        }
    }
    
    // --- Core CRUD Operations ---
    
    /**
     * Set a value
     * @param {string} key 
     * @param {any} value - Must be JSON-serializable
     */
    async set(key, value) {
        await this._ready();
        await KVDatabase._send({
            type: 'set',
            db: this.dbName,
            store: this.storeName,
            key,
            value
        });
        this._notify(key, value, 'set');
        return true;
    }
    
    /**
     * Get a value
     * @param {string} key 
     * @returns {Promise<any>}
     */
    async get(key) {
        await this._ready();
        const result = await KVDatabase._send({
            type: 'get',
            db: this.dbName,
            store: this.storeName,
            key
        });
        return result.value;
    }
    
    /**
     * Remove a key
     * @param {string} key 
     */
    async remove(key) {
        await this._ready();
        await KVDatabase._send({
            type: 'remove',
            db: this.dbName,
            store: this.storeName,
            key
        });
        this._notify(key, undefined, 'remove');
        return true;
    }
    
    /**
     * Get all keys
     * @returns {Promise<string[]>}
     */
    async keys() {
        await this._ready();
        const result = await KVDatabase._send({
            type: 'keys',
            db: this.dbName,
            store: this.storeName
        });
        return result.keys || [];
    }
    
    /**
     * Clear all data in the store
     */
    async clear() {
        await this._ready();
        await KVDatabase._send({
            type: 'clear',
            db: this.dbName,
            store: this.storeName
        });
        this._notify(undefined, undefined, 'clear');
        return true;
    }
    
    /**
     * Search for values containing a string
     * @param {string} searchStr 
     * @returns {Promise<Object>} Key-value pairs matching the search
     */
    async find(searchStr) {
        await this._ready();
        const result = await KVDatabase._send({
            type: 'find',
            db: this.dbName,
            store: this.storeName,
            search: searchStr
        });
        return result.value || {};
    }
    
    // --- Static Methods ---
    
    /**
     * List all stores in a database
     * @param {string} dbName 
     * @returns {Promise<string[]>}
     */
    static async listStores(dbName) {
        if (!KVDatabase.worker) {
            await KVDatabase.init();
        }
        await KVDatabase.readyPromise;
        
        const result = await KVDatabase._send({
            type: 'listStores',
            db: dbName
        });
        return result.keys || [];
    }
    
    // --- Subscriptions ---
    
    /**
     * Subscribe to changes
     * @param {string|function} arg1 - Key or callback
     * @param {function} [arg2] - Callback if arg1 is key
     * @returns {function} Unsubscribe function
     */
    subscribe(arg1, arg2) {
        if (typeof arg1 === 'function') {
            // Global listener: subscribe(callback)
            const callback = arg1;
            this.listeners.push(callback);
            return () => {
                this.listeners = this.listeners.filter(l => l !== callback);
            };
        } else {
            // Key listener: subscribe(key, callback)
            const key = arg1;
            const callback = arg2;
            if (!this.keyListeners.has(key)) {
                this.keyListeners.set(key, new Set());
            }
            this.keyListeners.get(key).add(callback);
            return () => {
                if (this.keyListeners.has(key)) {
                    this.keyListeners.get(key).delete(callback);
                }
            };
        }
    }
    
    // --- Aliases for compatibility ---
    
    async getValue(key) { return this.get(key); }
    async putValue(key, value) { return this.set(key, value); }
    async getAllKeys() { return this.keys(); }
    async delete(key, value) {
        if (value === undefined) {
            return this.remove(key);
        }
        // Remove value from array
        const current = await this.get(key);
        if (!Array.isArray(current)) return;
        const index = current.indexOf(value);
        if (index > -1) {
            current.splice(index, 1);
            return this.set(key, current);
        }
    }
    
    /**
     * Append a value to an array at key
     */
    async append(key, value) {
        const current = await this.get(key);
        let arr = Array.isArray(current) ? current : [];
        if (!arr.includes(value)) {
            arr.push(value);
        }
        return this.set(key, arr);
    }
    
    // Stubs for compatibility
    async initDB() { await this._ready(); }
    async waitForDB() { await this._ready(); }
}

// Auto-initialize when imported
KVDatabase.init().catch(console.error);
