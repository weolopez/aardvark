// TaskManager.js - Client API for Task Management Worker
//
// Provides a clean Promise-based API for the LLM agent to manage tasks.
// All operations run in a Web Worker with persistent IndexedDB storage.
//
// Usage:
//   const tasks = new TaskManager();
//   await tasks.ready();
//   
//   const task = await tasks.create('Build feature', 'Implement the new feature');
//   await tasks.update(task.id, { status: 'in_progress' });
//   const all = await tasks.list({ status: 'pending' });

export class TaskManager {
    static worker = null;
    static pending = new Map();
    static nextId = 1;
    static readyPromise = null;
    static listeners = new Set();
    
    /**
     * Initialize the shared worker
     */
    static init() {
        if (TaskManager.worker) {
            return TaskManager.readyPromise;
        }
        
        TaskManager.readyPromise = new Promise((resolve, reject) => {
            TaskManager.worker = new Worker('./worker.js', { type: 'module' });
            
            TaskManager.worker.onmessage = (event) => {
                const { id, type, success, data, error } = event.data;
                
                // Handle ready message
                if (type === 'ready') {
                    console.log('[TaskManager] Worker ready');
                    resolve();
                    return;
                }
                
                // Handle responses to requests
                if (id && TaskManager.pending.has(id)) {
                    const { resolve: res, reject: rej } = TaskManager.pending.get(id);
                    TaskManager.pending.delete(id);
                    
                    if (success) {
                        res(data);
                    } else {
                        rej(new Error(error || 'Unknown error'));
                    }
                }
                
                // Notify listeners of any task changes
                if (type && type.endsWith('_result') && success) {
                    TaskManager.listeners.forEach(cb => {
                        try {
                            cb({ type: type.replace('_result', ''), data });
                        } catch (e) {
                            console.error('[TaskManager] Listener error:', e);
                        }
                    });
                }
            };
            
            TaskManager.worker.onerror = (error) => {
                console.error('[TaskManager] Worker error:', error);
                reject(error);
            };
        });
        
        return TaskManager.readyPromise;
    }
    
    /**
     * Send a message to the worker and wait for response
     */
    static _send(type, payload = {}) {
        return new Promise((resolve, reject) => {
            const id = TaskManager.nextId++;
            TaskManager.pending.set(id, { resolve, reject });
            TaskManager.worker.postMessage({ id, type, payload });
            
            // Timeout after 30 seconds
            setTimeout(() => {
                if (TaskManager.pending.has(id)) {
                    TaskManager.pending.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 30000);
        });
    }
    
    constructor() {
        // Singleton - all instances share the same worker
        if (!TaskManager.worker) {
            TaskManager.init();
        }
    }
    
    /**
     * Wait for the worker to be ready
     */
    async ready() {
        if (!TaskManager.worker) {
            await TaskManager.init();
        }
        await TaskManager.readyPromise;
        return this;
    }
    
    // =========================================================================
    // Core Task Operations
    // =========================================================================
    
    /**
     * Create a new task
     * @param {string} subject - Short task title
     * @param {string} description - Detailed description
     * @param {object} [metadata] - Optional custom metadata
     * @returns {Promise<Task>} The created task
     */
    async create(subject, description = '', metadata = undefined) {
        await this.ready();
        return TaskManager._send('create', { subject, description, metadata });
    }
    
    /**
     * Update an existing task
     * @param {string} taskId - ID of the task to update
     * @param {object} updates - Fields to update
     * @returns {Promise<Task>} The updated task
     * 
     * @example
     * // Change status
     * await tasks.update(id, { status: 'completed' });
     * 
     * // Add a blocker
     * await tasks.update(id, { add_blocked_by: ['other_task_id'] });
     * 
     * // Remove a blocker
     * await tasks.update(id, { remove_blocked_by: ['other_task_id'] });
     */
    async update(taskId, updates) {
        await this.ready();
        return TaskManager._send('update', { taskId, updates });
    }
    
    /**
     * List tasks with optional filtering
     * @param {object} [filter] - Filter criteria
     * @param {string} [filter.status] - Filter by status (pending, in_progress, blocked, completed)
     * @param {string} [filter.owner] - Filter by owner
     * @param {string} [filter.sub_agent] - Filter by sub-agent
     * @param {boolean} [filter.ready_only] - Only show ready tasks (pending with no blockers)
     * @returns {Promise<TaskSummary[]>} Array of task summaries
     */
    async list(filter = undefined) {
        await this.ready();
        return TaskManager._send('list', { filter });
    }
    
    /**
     * Get full details of a task
     * @param {string} taskId - ID of the task
     * @returns {Promise<Task>} The full task object
     */
    async get(taskId) {
        await this.ready();
        return TaskManager._send('get', { taskId });
    }
    
    /**
     * Delete a task
     * @param {string} taskId - ID of the task to delete
     */
    async delete(taskId) {
        await this.ready();
        return TaskManager._send('delete', { taskId });
    }
    
    // =========================================================================
    // Convenience Methods
    // =========================================================================
    
    /**
     * Mark a task as in progress
     */
    async start(taskId) {
        return this.update(taskId, { status: 'in_progress' });
    }
    
    /**
     * Mark a task as completed
     * This will automatically unblock any dependent tasks
     */
    async complete(taskId) {
        return this.update(taskId, { status: 'completed' });
    }
    
    /**
     * Block a task with another task
     * @param {string} taskId - Task to be blocked
     * @param {string} blockerId - Task that blocks it
     */
    async block(taskId, blockerId) {
        return this.update(taskId, { add_blocked_by: [blockerId] });
    }
    
    /**
     * Unblock a task
     * @param {string} taskId - Task to unblock
     * @param {string} blockerId - Task that was blocking it
     */
    async unblock(taskId, blockerId) {
        return this.update(taskId, { remove_blocked_by: [blockerId] });
    }
    
    /**
     * Assign a task to an owner
     */
    async assign(taskId, owner) {
        return this.update(taskId, { owner });
    }
    
    /**
     * Assign a task to a sub-agent
     */
    async assignSubAgent(taskId, subAgent) {
        return this.update(taskId, { sub_agent: subAgent });
    }
    
    /**
     * Get tasks that are ready to work on (pending with no blockers)
     */
    async getReady() {
        return this.list({ ready_only: true });
    }
    
    /**
     * Get tasks by status
     */
    async getByStatus(status) {
        return this.list({ status });
    }
    
    /**
     * Get task statistics
     */
    async stats() {
        await this.ready();
        return TaskManager._send('stats', {});
    }
    
    // =========================================================================
    // Bulk Operations
    // =========================================================================
    
    /**
     * Import tasks from markdown
     * @param {string} markdown - Markdown text with task definitions
     * @returns {Promise<Task[]>} Array of created tasks
     * 
     * @example
     * const md = `
     * ## First Task
     * Description of the first task
     * - status: pending
     * - owner: agent-1
     * 
     * ## Second Task
     * Description of the second task
     * `;
     * const tasks = await manager.hydrate(md);
     */
    async hydrate(markdown) {
        await this.ready();
        return TaskManager._send('hydrate', { markdown });
    }
    
    // =========================================================================
    // Event Handling
    // =========================================================================
    
    /**
     * Subscribe to task changes
     * @param {function} callback - Called with { type, data } on changes
     * @returns {function} Unsubscribe function
     */
    subscribe(callback) {
        TaskManager.listeners.add(callback);
        return () => TaskManager.listeners.delete(callback);
    }
}

// Export a singleton instance for convenience
export const tasks = new TaskManager();

// Auto-initialize
TaskManager.init().catch(console.error);
