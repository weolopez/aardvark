/**
 * History Store - Tool execution history and statistics
 * Tracks all tool executions for debugging, auditing, and analytics
 */

import { EventBus } from '../../../core/event-bus/src/index.js';
import { IndexedDBProvider } from '../../../core/indexeddb-provider/src/index.js';

/**
 * @typedef {Object} ExecutionRecord
 * @property {string} executionId - Unique execution ID
 * @property {string} sessionId - Session ID
 * @property {string} nodeId - Node ID in session tree
 * @property {string} toolName - Name of tool executed
 * @property {Object} arguments - Tool arguments
 * @property {ToolResult} result - Execution result
 * @property {'running'|'completed'|'failed'} status - Execution status
 * @property {number} startedAt - Start timestamp
 * @property {number} [completedAt] - Completion timestamp
 * @property {number} [duration] - Duration in ms
 */

/**
 * @typedef {Object} ToolResult
 * @property {boolean} success - Whether execution succeeded
 * @property {string} [output] - Output content
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} ExecutionRecordInput
 * @property {string} sessionId
 * @property {string} nodeId
 * @property {string} toolName
 * @property {Object} arguments
 * @property {ToolResult} result
 * @property {number} startedAt
 * @property {number} completedAt
 */

/**
 * @typedef {Object} QueryOptions
 * @property {string} [sessionId]
 * @property {string} [toolName]
 * @property {'running'|'completed'|'failed'} [status]
 * @property {number} [from]
 * @property {number} [to]
 * @property {number} [limit]
 * @property {number} [offset]
 * @property {'startedAt'|'duration'} [sortBy]
 * @property {'asc'|'desc'} [sortOrder]
 */

/**
 * @typedef {Object} ExecutionStats
 * @property {number} totalExecutions
 * @property {number} successfulExecutions
 * @property {number} failedExecutions
 * @property {number} averageDuration
 * @property {number} totalDuration
 * @property {number} uniqueTools
 * @property {{from: number, to: number}} dateRange
 */

/**
 * @typedef {Object} ToolStats
 * @property {string} toolName
 * @property {number} executionCount
 * @property {number} successCount
 * @property {number} failureCount
 * @property {number} averageDuration
 * @property {number} lastExecuted
 */

/**
 * @typedef {Object} SessionExecutionStats
 * @property {string} sessionId
 * @property {number} totalExecutions
 * @property {Map<string, number>} toolBreakdown
 * @property {number} averageDuration
 * @property {TimelineEntry[]} timeline
 */

/**
 * @typedef {Object} TimelineEntry
 * @property {number} timestamp
 * @property {string} toolName
 * @property {number} duration
 * @property {'success'|'failure'} status
 */

/**
 * @typedef {Object} ToolUsage
 * @property {string} toolName
 * @property {number} count
 * @property {number} percentage
 */

/**
 * @typedef {Object} StatsOptions
 * @property {number} [from]
 * @property {number} [to]
 * @property {string} [sessionId]
 */

export class HistoryStore {
  /**
   * @param {Object} options
   * @param {EventBus} [options.eventBus] - EventBus for publishing events
   * @param {IndexedDBProvider} [options.db] - IndexedDB provider
   */
  constructor(options = {}) {
    this.eventBus = options.eventBus || new EventBus();
    this.db = options.db || new IndexedDBProvider('aardvark-history', 1);
    this.initialized = false;
  }

  /**
   * Initialize the history store
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    await this.db.initialize([
      {
        name: 'history',
        keyPath: 'executionId',
        indexes: [
          { name: 'sessionId', keyPath: 'sessionId' },
          { name: 'toolName', keyPath: 'toolName' },
          { name: 'startedAt', keyPath: 'startedAt' },
          { name: 'status', keyPath: 'status' }
        ]
      }
    ]);

    this.initialized = true;
  }

  // --- Recording ---

  /**
   * Record a complete execution
   * @param {ExecutionRecordInput} record - Execution record
   * @returns {Promise<string>} executionId
   */
  async recordExecution(record) {
    const executionId = crypto.randomUUID();
    const duration = record.completedAt - record.startedAt;
    
    const executionRecord = {
      executionId,
      sessionId: record.sessionId,
      nodeId: record.nodeId,
      toolName: record.toolName,
      arguments: record.arguments,
      result: record.result,
      status: record.result.success ? 'completed' : 'failed',
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      duration
    };

    await this.db.add('history', executionRecord);

    // Publish event
    const eventType = record.result.success ? 'execution:completed' : 'execution:failed';
    this.eventBus.publish(eventType, {
      executionId,
      sessionId: record.sessionId,
      toolName: record.toolName,
      duration,
      status: record.result.success ? 'success' : 'failure',
      error: record.result.error
    });

    return executionId;
  }

  /**
   * Record the start of an execution
   * @param {string} sessionId - Session ID
   * @param {string} nodeId - Node ID
   * @param {string} toolName - Tool name
   * @param {Object} args - Tool arguments
   * @returns {Promise<string>} executionId
   */
  async recordStart(sessionId, nodeId, toolName, args) {
    const executionId = crypto.randomUUID();
    
    const record = {
      executionId,
      sessionId,
      nodeId,
      toolName,
      arguments: args,
      result: null,
      status: 'running',
      startedAt: Date.now()
    };

    await this.db.add('history', record);

    // Publish event
    this.eventBus.publish('execution:started', {
      executionId,
      sessionId,
      nodeId,
      toolName,
      arguments: args
    });

    return executionId;
  }

  /**
   * Record completion of an execution
   * @param {string} executionId - Execution ID
   * @param {ToolResult} result - Execution result
   * @returns {Promise<void>}
   */
  async recordComplete(executionId, result) {
    const record = await this.db.get('history', executionId);
    if (!record) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const completedAt = Date.now();
    const duration = completedAt - record.startedAt;

    record.result = result;
    record.status = result.success ? 'completed' : 'failed';
    record.completedAt = completedAt;
    record.duration = duration;

    await this.db.put('history', record);

    // Publish event
    const eventType = result.success ? 'execution:completed' : 'execution:failed';
    this.eventBus.publish(eventType, {
      executionId,
      sessionId: record.sessionId,
      toolName: record.toolName,
      duration,
      status: result.success ? 'success' : 'failure',
      error: result.error
    });
  }

  // --- Querying ---

  /**
   * Get a single execution by ID
   * @param {string} executionId - Execution ID
   * @returns {Promise<ExecutionRecord|null>}
   */
  async getExecution(executionId) {
    return this.db.get('history', executionId);
  }

  /**
   * Query executions with filters
   * @param {QueryOptions} options - Query options
   * @returns {Promise<ExecutionRecord[]>}
   */
  async getExecutions(options = {}) {
    let executions = await this.db.getAll('history');

    // Apply filters
    if (options.sessionId) {
      executions = executions.filter(e => e.sessionId === options.sessionId);
    }

    if (options.toolName) {
      executions = executions.filter(e => e.toolName === options.toolName);
    }

    if (options.status) {
      executions = executions.filter(e => e.status === options.status);
    }

    if (options.from) {
      executions = executions.filter(e => e.startedAt >= options.from);
    }

    if (options.to) {
      executions = executions.filter(e => e.startedAt <= options.to);
    }

    // Apply sorting
    const sortBy = options.sortBy || 'startedAt';
    const sortOrder = options.sortOrder || 'desc';

    executions.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'startedAt') {
        comparison = a.startedAt - b.startedAt;
      } else if (sortBy === 'duration') {
        comparison = (a.duration || 0) - (b.duration || 0);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Apply pagination
    if (options.offset) {
      executions = executions.slice(options.offset);
    }

    if (options.limit) {
      executions = executions.slice(0, options.limit);
    }

    return executions;
  }

  /**
   * Get executions for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<ExecutionRecord[]>}
   */
  async getExecutionsBySession(sessionId) {
    const index = this.db.db.transaction('history').objectStore('history').index('sessionId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(sessionId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get executions for a tool
   * @param {string} toolName - Tool name
   * @returns {Promise<ExecutionRecord[]>}
   */
  async getExecutionsByTool(toolName) {
    const index = this.db.db.transaction('history').objectStore('history').index('toolName');
    return new Promise((resolve, reject) => {
      const request = index.getAll(toolName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get executions for a specific node
   * @param {string} sessionId - Session ID
   * @param {string} nodeId - Node ID
   * @returns {Promise<ExecutionRecord[]>}
   */
  async getExecutionsByNode(sessionId, nodeId) {
    const executions = await this.getExecutionsBySession(sessionId);
    return executions.filter(e => e.nodeId === nodeId);
  }

  // --- Statistics ---

  /**
   * Get overall execution statistics
   * @param {StatsOptions} options - Stats options
   * @returns {Promise<ExecutionStats>}
   */
  async getStats(options = {}) {
    let executions = await this.db.getAll('history');

    // Filter by options
    if (options.sessionId) {
      executions = executions.filter(e => e.sessionId === options.sessionId);
    }

    if (options.from) {
      executions = executions.filter(e => e.startedAt >= options.from);
    }

    if (options.to) {
      executions = executions.filter(e => e.startedAt <= options.to);
    }

    const completed = executions.filter(e => e.status !== 'running');
    const successful = completed.filter(e => e.status === 'completed');
    const failed = completed.filter(e => e.status === 'failed');

    const totalDuration = completed.reduce((sum, e) => sum + (e.duration || 0), 0);
    const uniqueTools = new Set(executions.map(e => e.toolName)).size;

    const timestamps = executions.map(e => e.startedAt);

    return {
      totalExecutions: executions.length,
      successfulExecutions: successful.length,
      failedExecutions: failed.length,
      averageDuration: completed.length > 0 ? Math.round(totalDuration / completed.length) : 0,
      totalDuration,
      uniqueTools,
      dateRange: {
        from: timestamps.length > 0 ? Math.min(...timestamps) : Date.now(),
        to: timestamps.length > 0 ? Math.max(...timestamps) : Date.now()
      }
    };
  }

  /**
   * Get statistics for a specific tool
   * @param {string} toolName - Tool name
   * @returns {Promise<ToolStats>}
   */
  async getToolStats(toolName) {
    const executions = await this.getExecutionsByTool(toolName);
    const completed = executions.filter(e => e.status !== 'running');
    const successful = completed.filter(e => e.status === 'completed');
    const failed = completed.filter(e => e.status === 'failed');

    const totalDuration = completed.reduce((sum, e) => sum + (e.duration || 0), 0);
    const timestamps = completed.map(e => e.startedAt);

    return {
      toolName,
      executionCount: executions.length,
      successCount: successful.length,
      failureCount: failed.length,
      averageDuration: completed.length > 0 ? Math.round(totalDuration / completed.length) : 0,
      lastExecuted: timestamps.length > 0 ? Math.max(...timestamps) : 0
    };
  }

  /**
   * Get statistics for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<SessionExecutionStats>}
   */
  async getSessionStats(sessionId) {
    const executions = await this.getExecutionsBySession(sessionId);
    const completed = executions.filter(e => e.status !== 'running');

    // Build tool breakdown
    const toolBreakdown = new Map();
    executions.forEach(e => {
      const count = toolBreakdown.get(e.toolName) || 0;
      toolBreakdown.set(e.toolName, count + 1);
    });

    // Build timeline
    const timeline = completed.map(e => ({
      timestamp: e.startedAt,
      toolName: e.toolName,
      duration: e.duration || 0,
      status: e.status === 'completed' ? 'success' : 'failure'
    })).sort((a, b) => a.timestamp - b.timestamp);

    const totalDuration = completed.reduce((sum, e) => sum + (e.duration || 0), 0);

    return {
      sessionId,
      totalExecutions: executions.length,
      toolBreakdown,
      averageDuration: completed.length > 0 ? Math.round(totalDuration / completed.length) : 0,
      timeline
    };
  }

  // --- Aggregation ---

  /**
   * Get most popular tools
   * @param {number} [limit=10] - Number of tools to return
   * @returns {Promise<ToolUsage[]>}
   */
  async getPopularTools(limit = 10) {
    const executions = await this.db.getAll('history');
    
    // Count by tool
    const counts = new Map();
    executions.forEach(e => {
      const count = counts.get(e.toolName) || 0;
      counts.set(e.toolName, count + 1);
    });

    // Calculate total for percentages
    const total = executions.length;

    // Convert to array and sort
    const sorted = Array.from(counts.entries())
      .map(([toolName, count]) => ({
        toolName,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count);

    return sorted.slice(0, limit);
  }

  /**
   * Get execution timeline for a session
   * @param {string} sessionId - Session ID
   * @returns {Promise<TimelineEntry[]>}
   */
  async getExecutionTimeline(sessionId) {
    return this.getSessionStats(sessionId).then(stats => stats.timeline);
  }

  // --- Cleanup ---

  /**
   * Delete old executions
   * @param {number} before - Delete executions before this timestamp
   * @returns {Promise<number>} Number of records deleted
   */
  async deleteOldExecutions(before) {
    const executions = await this.db.getAll('history');
    const toDelete = executions.filter(e => e.startedAt < before);

    for (const execution of toDelete) {
      await this.db.delete('history', execution.executionId);
    }

    return toDelete.length;
  }

  /**
   * Clear all history
   * @returns {Promise<void>}
   */
  async clearHistory() {
    const executions = await this.db.getAll('history');
    
    for (const execution of executions) {
      await this.db.delete('history', execution.executionId);
    }
  }
}

export default HistoryStore;
