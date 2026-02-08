/**
 * IndexedDBProvider - Structured data storage using IndexedDB
 * @module components/core/indexeddb-provider
 * 
 * Design based on 03-kv-worker architecture:
 * - Promise-based API wrapping IndexedDB callbacks
 * - Connection caching per database
 * - Schema versioning with auto-migration
 * - Event subscriptions for data changes
 */

/**
 * Database schema definition
 * @typedef {Object} StoreSchema
 * @property {string} name - Store name
 * @property {string} [keyPath] - Primary key path
 * @property {boolean} [autoIncrement] - Auto-increment keys
 * @property {Array<{name: string, keyPath: string, unique?: boolean}>} [indexes] - Indexes
 */

export class IndexedDBProvider {
  constructor(dbName = 'aardvark-db', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.listeners = new Map(); // store -> Set(callbacks)
    this.keyListeners = new Map(); // store::key -> Set(callbacks)
  }

  /**
   * Initialize database with schema
   * @param {Array<StoreSchema>} stores - Store definitions
   * @returns {Promise<void>}
   */
  async initialize(stores = []) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        
        // Handle version changes from other tabs
        this.db.onversionchange = () => {
          this.db.close();
          this.db = null;
        };
        
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        stores.forEach(storeSchema => {
          if (!db.objectStoreNames.contains(storeSchema.name)) {
            const store = db.createObjectStore(storeSchema.name, {
              keyPath: storeSchema.keyPath,
              autoIncrement: storeSchema.autoIncrement
            });
            
            // Create indexes
            if (storeSchema.indexes) {
              storeSchema.indexes.forEach(index => {
                store.createIndex(index.name, index.keyPath, { unique: index.unique });
              });
            }
          }
        });
      };
    });
  }

  /**
   * Get a value from store
   * @param {string} store - Store name
   * @param {string} key - Key to get
   * @returns {Promise<any>}
   */
  async get(store, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readonly');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.get(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Set a value in store
   * @param {string} store - Store name
   * @param {string} key - Key to set
   * @param {any} value - Value to store
   * @returns {Promise<void>}
   */
  async set(store, key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      
      // Handle stores with keyPath (in-line keys)
      // When keyPath is set, the key must be a property of the value object
      let valueToStore = value;
      if (objectStore.keyPath && typeof value === 'object' && value !== null) {
        // Clone value to avoid mutating the original
        valueToStore = { ...value };
        // Set the key in the value object at the keyPath
        const keyPath = objectStore.keyPath;
        if (typeof keyPath === 'string') {
          valueToStore[keyPath] = key;
        }
        // Use put without key parameter since key is now in the value
        const request = objectStore.put(valueToStore);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          this._notifyListeners(store, key, valueToStore);
          resolve();
        };
      } else {
        // Store without keyPath - use out-of-line key
        const request = objectStore.put(value, key);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          this._notifyListeners(store, key, value);
          resolve();
        };
      }
    });
  }

  /**
   * Add a value to store (fails if key exists)
   * @param {string} store - Store name
   * @param {any} value - Value to store (must include key if keyPath is set)
   * @returns {Promise<void>}
   */
  async add(store, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.add(value);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const key = request.result;
        this._notifyListeners(store, key, value);
        resolve();
      };
    });
  }

  /**
   * Put a value to store (adds or updates)
   * @param {string} store - Store name
   * @param {any} value - Value to store (must include key if keyPath is set)
   * @returns {Promise<void>}
   */
  async put(store, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.put(value);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const key = request.result;
        this._notifyListeners(store, key, value);
        resolve();
      };
    });
  }

  /**
   * Delete a value from store
   * @param {string} store - Store name
   * @param {string} key - Key to delete
   * @returns {Promise<void>}
   */
  async delete(store, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.delete(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this._notifyListeners(store, key, null);
        resolve();
      };
    });
  }

  /**
   * Get all values from store
   * @param {string} store - Store name
   * @returns {Promise<Array>}
   */
  async getAll(store) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readonly');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Get all keys from store
   * @param {string} store - Store name
   * @returns {Promise<Array<string>>}
   */
  async getAllKeys(store) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readonly');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.getAllKeys();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Query by index
   * @param {string} store - Store name
   * @param {string} indexName - Index name
   * @param {IDBKeyRange} keyRange - Key range
   * @returns {Promise<Array>}
   */
  async query(store, indexName, keyRange) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readonly');
      const objectStore = transaction.objectStore(store);
      const index = objectStore.index(indexName);
      const request = index.getAll(keyRange);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Clear all data from store
   * @param {string} store - Store name
   * @returns {Promise<void>}
   */
  async clear(store) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.clear();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Subscribe to all changes in a store
   * @param {string} store - Store name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(store, callback) {
    if (!this.listeners.has(store)) {
      this.listeners.set(store, new Set());
    }
    this.listeners.get(store).add(callback);
    
    return () => {
      this.listeners.get(store).delete(callback);
    };
  }

  /**
   * Subscribe to changes for a specific key
   * @param {string} store - Store name
   * @param {string} key - Key to watch
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribeKey(store, key, callback) {
    const keyPath = `${store}::${key}`;
    if (!this.keyListeners.has(keyPath)) {
      this.keyListeners.set(keyPath, new Set());
    }
    this.keyListeners.get(keyPath).add(callback);
    
    return () => {
      this.keyListeners.get(keyPath).delete(callback);
    };
  }

  /**
   * Notify listeners of data changes
   * @private
   */
  _notifyListeners(store, key, value) {
    // Notify store-wide listeners
    const storeListeners = this.listeners.get(store);
    if (storeListeners) {
      storeListeners.forEach(callback => {
        try {
          callback({ store, key, value });
        } catch (error) {
          console.error('Listener error:', error);
        }
      });
    }
    
    // Notify key-specific listeners
    const keyPath = `${store}::${key}`;
    const keyListeners = this.keyListeners.get(keyPath);
    if (keyListeners) {
      keyListeners.forEach(callback => {
        try {
          callback(value);
        } catch (error) {
          console.error('Key listener error:', error);
        }
      });
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * Predefined schema for Aardvark application
 * @type {Array<StoreSchema>}
 */
export const AardvarkSchema = [
  {
    name: 'sessions',
    keyPath: 'sessionId',
    indexes: [
      { name: 'created', keyPath: 'created', unique: false },
      { name: 'modified', keyPath: 'modified', unique: false }
    ]
  },
  {
    name: 'pending_tools',
    keyPath: 'toolId',
    indexes: [
      { name: 'status', keyPath: 'status', unique: false },
      { name: 'created', keyPath: 'created', unique: false }
    ]
  },
  {
    name: 'history',
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'sessionId', keyPath: 'sessionId', unique: false },
      { name: 'timestamp', keyPath: 'timestamp', unique: false }
    ]
  },
  {
    name: 'settings',
    keyPath: 'key'
  }
];

/**
 * Global IndexedDB provider instance
 * @type {IndexedDBProvider}
 */
export const db = new IndexedDBProvider();

export default IndexedDBProvider;
