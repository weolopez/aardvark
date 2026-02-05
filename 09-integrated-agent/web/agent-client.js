/**
 * AgentClient - Promise-based API for the coding agent Web Worker.
 */
export class AgentClient {
    constructor() {
        this.worker = new Worker('./worker.js', { type: 'module' });
        this.worker.onmessage = this._handleMessage.bind(this);
        this.pendingInit = null;
        this.pendingChat = null;
        this.pendingOps = new Map();
        this._opId = 0;
        this.onEvent = null;     // (event) => void — agent step events
        this.onError = null;     // (error) => void
        this.onReady = null;     // () => void
        this.onRepoLoaded = null; // (payload) => void
    }

    // ========================================================================
    // Public API
    // ========================================================================

    async init(apiKey, model = 'gemini-2.0-flash') {
        return new Promise((resolve, reject) => {
            this.pendingInit = { resolve, reject };
            this.worker.postMessage({
                type: 'init',
                payload: { apiKey, model },
            });
        });
    }

    async chat(message) {
        return new Promise((resolve, reject) => {
            this.pendingChat = { resolve, reject };
            this.worker.postMessage({
                type: 'chat',
                payload: { message },
            });
        });
    }

    async loadRepo(owner, repo, branch, token) {
        return new Promise((resolve, reject) => {
            this.pendingOps.set('load_repo', { resolve, reject });
            this.worker.postMessage({
                type: 'load_repo',
                payload: { owner, repo, branch, token },
            });
        });
    }

    async setToken(token) {
        return this._request('set_token', { token }, 'token_set');
    }

    async getChangedFiles() {
        return this._request('get_changed_files', {}, 'changed_files');
    }

    async commitChanges(message) {
        return this._request('commit_changes', { message }, 'commit_result');
    }

    async getFs() {
        return this._request('get_fs', {}, 'fs_state');
    }

    async getHistory() {
        return this._request('get_history', {}, 'history');
    }

    async getTree() {
        return this._request('get_tree', {}, 'tree');
    }

    async branch(entryId) {
        return this._request('branch', { entryId }, 'branched');
    }

    async clear() {
        return this._request('clear', {}, 'cleared');
    }

    // ========================================================================
    // Internal
    // ========================================================================

    _request(type, payload, responseType) {
        return new Promise((resolve, reject) => {
            this.pendingOps.set(responseType, { resolve, reject });
            this.worker.postMessage({ type, payload });
        });
    }

    _handleMessage(e) {
        const { type, payload, event, result, error } = e.data;

        switch (type) {
            case 'ready':
                if (this.pendingInit) {
                    this.pendingInit.resolve(payload);
                    this.pendingInit = null;
                }
                if (this.onReady) this.onReady();
                break;

            case 'repo_loaded':
                if (this.pendingOps.has('load_repo')) {
                    this.pendingOps.get('load_repo').resolve(payload);
                    this.pendingOps.delete('load_repo');
                }
                if (this.onRepoLoaded) this.onRepoLoaded(payload);
                break;

            case 'agent_event':
                if (this.onEvent) this.onEvent(event);
                break;

            case 'chat_done':
                if (this.pendingChat) {
                    this.pendingChat.resolve(result);
                    this.pendingChat = null;
                }
                break;

            case 'fs_state':
            case 'history':
            case 'tree':
            case 'branched':
            case 'cleared':
            case 'pwd':
            case 'token_set':
            case 'changed_files':
            case 'commit_result':
                if (this.pendingOps.has(type)) {
                    this.pendingOps.get(type).resolve(payload);
                    this.pendingOps.delete(type);
                }
                break;

            case 'persist_entry':
                // Session persistence — store in localStorage for now
                this._persistEntry(e.data.sessionId, e.data.entryJson);
                break;

            case 'error':
                if (this.pendingInit) {
                    this.pendingInit.reject(new Error(error));
                    this.pendingInit = null;
                } else if (this.pendingChat) {
                    this.pendingChat.reject(new Error(error));
                    this.pendingChat = null;
                } else if (this.onError) {
                    this.onError(error);
                } else {
                    console.error('Agent Error:', error);
                }
                break;
        }
    }

    _persistEntry(sessionId, entryJson) {
        try {
            const key = `session:${sessionId}`;
            const existing = localStorage.getItem(key);
            const entries = existing ? JSON.parse(existing) : [];
            entries.push(JSON.parse(entryJson));
            localStorage.setItem(key, JSON.stringify(entries));
        } catch (e) {
            console.warn('Failed to persist session entry:', e);
        }
    }
}
