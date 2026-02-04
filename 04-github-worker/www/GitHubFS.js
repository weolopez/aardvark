// GitHubFS.js - Client-side wrapper for the GitHub Worker
//
// This provides a clean Promise-based API that communicates with the Web Worker.
// Follows the same pattern as KVDatabase.js but for GitHub file operations.

const STORAGE_KEY = 'github-explorer-config';

export class GitHubFS {
    static worker = null;
    static pending = new Map();
    static nextId = 1;
    static readyPromise = null;
    static config = null;
    static listeners = new Set();
    
    static init() {
        if (GitHubFS.worker) {
            return GitHubFS.readyPromise;
        }
        
        GitHubFS.readyPromise = new Promise((resolve, reject) => {
            GitHubFS.worker = new Worker('./worker.js', { type: 'module' });
            
            GitHubFS.worker.onmessage = (event) => {
                const { id, type, success, data, error, errorCode, hasAuth } = event.data;
                
                if (type === 'ready') {
                    console.log('[GitHubFS] Worker ready');
                    GitHubFS._loadSavedConfig().then(() => resolve()).catch(reject);
                    return;
                }
                
                if (id && GitHubFS.pending.has(id)) {
                    const { resolve: res, reject: rej } = GitHubFS.pending.get(id);
                    GitHubFS.pending.delete(id);
                    
                    if (success) {
                        res(data);
                    } else {
                        const err = new Error(error || 'Unknown error');
                        err.code = errorCode;
                        rej(err);
                    }
                }
                
                if (type === 'file_set' || type === 'file_saved' || type === 'file_deleted') {
                    GitHubFS._notifyListeners({ type, data });
                }
            };
            
            GitHubFS.worker.onerror = (error) => {
                console.error('[GitHubFS] Worker error:', error);
                reject(error);
            };
        });
        
        return GitHubFS.readyPromise;
    }
    
    static async _loadSavedConfig() {
        const saved = localStorage.getItem(STORAGE_KEY);
        let config = {};
        
        if (saved) {
            try {
                config = JSON.parse(saved);
            } catch (e) {
                console.warn('[GitHubFS] Invalid saved config:', e);
            }
        }
        
        const result = await GitHubFS._send({
            type: 'set_config',
            payload: { config }
        });
        
        GitHubFS.config = result;
        return result;
    }
    
    static _send(message) {
        return new Promise((resolve, reject) => {
            const id = GitHubFS.nextId++;
            GitHubFS.pending.set(id, { resolve, reject });
            GitHubFS.worker.postMessage({ id, ...message });
            
            setTimeout(() => {
                if (GitHubFS.pending.has(id)) {
                    GitHubFS.pending.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 60000);
        });
    }
    
    static _notifyListeners(event) {
        GitHubFS.listeners.forEach(cb => {
            try { cb(event); } catch (e) { console.error('[GitHubFS] Listener error:', e); }
        });
    }
    
    static subscribe(callback) {
        GitHubFS.listeners.add(callback);
        return () => GitHubFS.listeners.delete(callback);
    }
    
    constructor() {
        if (!GitHubFS.worker) {
            GitHubFS.init();
        }
    }
    
    async ready() {
        if (!GitHubFS.worker) {
            await GitHubFS.init();
        }
        await GitHubFS.readyPromise;
    }
    
    getConfig() { return GitHubFS.config; }
    hasAuth() { return GitHubFS.config && GitHubFS.config.auth; }
    
    async setConfig(config, save = true) {
        await this.ready();
        const merged = { ...GitHubFS.config, ...config };
        
        if (save) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
        
        const result = await GitHubFS._send({
            type: 'set_config',
            payload: { config: merged }
        });
        
        GitHubFS.config = result;
        return result;
    }
    
    clearConfig() {
        localStorage.removeItem(STORAGE_KEY);
        GitHubFS.config = null;
    }
    
    async getFile(path) {
        await this.ready();
        return GitHubFS._send({ type: 'get_file', payload: { path } });
    }
    
    async getDirectory(path = '') {
        await this.ready();
        return GitHubFS._send({ type: 'get_directory', payload: { path } });
    }
    
    async setFile(path, content, sha = null) {
        await this.ready();
        return GitHubFS._send({ type: 'set_file', payload: { path, content, sha } });
    }
    
    async saveFile(path, content, message = 'Update file via GitHub Worker') {
        await this.ready();
        return GitHubFS._send({ type: 'save_file', payload: { path, content, message } });
    }
    
    async deleteFile(path, message = 'Delete file via GitHub Worker') {
        await this.ready();
        return GitHubFS._send({ type: 'delete_file', payload: { path, message } });
    }
    
    async search(query) {
        await this.ready();
        return GitHubFS._send({ type: 'search', payload: { query } });
    }
    
    async searchCached(query) {
        await this.ready();
        return GitHubFS._send({ type: 'search_cached', payload: { query } });
    }
    
    async getCachedFiles() {
        await this.ready();
        return GitHubFS._send({ type: 'get_cached_files', payload: {} });
    }
    
    async clearCache() {
        await this.ready();
        return GitHubFS._send({ type: 'clear_cache', payload: {} });
    }
    
    async normalizePath(path) {
        await this.ready();
        return GitHubFS._send({ type: 'normalize_path', payload: { path } });
    }
    
    async ping() {
        await this.ready();
        return GitHubFS._send({ type: 'ping', payload: {} });
    }
}

GitHubFS.init().catch(console.error);
