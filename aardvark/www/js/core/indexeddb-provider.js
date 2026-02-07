/**
 * IndexedDBProvider - Structured data storage
 */
export class IndexedDBProvider {
  constructor(dbName = 'aardvark-db', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
  }

  /**
   * Initialize database
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Sessions store
        if (!db.objectStoreNames.contains('sessions')) {
          const sessionsStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
          sessionsStore.createIndex('created', 'created', { unique: false });
          sessionsStore.createIndex('modified', 'modified', { unique: false });
        }
        
        // Pending tools store
        if (!db.objectStoreNames.contains('pending_tools')) {
          const pendingStore = db.createObjectStore('pending_tools', { keyPath: 'toolId' });
          pendingStore.createIndex('status', 'status', { unique: false });
        }
        
        // History store
        if (!db.objectStoreNames.contains('history')) {
          const historyStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          historyStore.createIndex('sessionId', 'sessionId', { unique: false });
          historyStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
        
        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * Get a value from store
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
   */
  async set(store, key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.put(value);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Delete a value from store
   */
  async delete(store, key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([store], 'readwrite');
      const objectStore = transaction.objectStore(store);
      const request = objectStore.delete(key);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get all values from store
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
   * Query by index
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
}

// Create global instance
export const db = new IndexedDBProvider();
