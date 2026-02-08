/**
 * Aggregation functions for history statistics
 */

/**
 * @typedef {Object} ExecutionRecord
 * @property {string} executionId
 * @property {string} sessionId
 * @property {string} nodeId
 * @property {string} toolName
 * @property {Object} arguments
 * @property {Object} result
 * @property {string} status
 * @property {number} startedAt
 * @property {number} [completedAt]
 * @property {number} [duration]
 */

/**
 * Calculate execution statistics from a list of records
 * @param {ExecutionRecord[]} executions
 * @returns {Object} Statistics
 */
export function calculateStats(executions) {
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
    successRate: completed.length > 0 ? Math.round((successful.length / completed.length) * 100) : 0,
    dateRange: {
      from: timestamps.length > 0 ? Math.min(...timestamps) : Date.now(),
      to: timestamps.length > 0 ? Math.max(...timestamps) : Date.now()
    }
  };
}

/**
 * Group executions by tool
 * @param {ExecutionRecord[]} executions
 * @returns {Map<string, ExecutionRecord[]>}
 */
export function groupByTool(executions) {
  const groups = new Map();
  
  executions.forEach(e => {
    if (!groups.has(e.toolName)) {
      groups.set(e.toolName, []);
    }
    groups.get(e.toolName).push(e);
  });

  return groups;
}

/**
 * Group executions by session
 * @param {ExecutionRecord[]} executions
 * @returns {Map<string, ExecutionRecord[]>}
 */
export function groupBySession(executions) {
  const groups = new Map();
  
  executions.forEach(e => {
    if (!groups.has(e.sessionId)) {
      groups.set(e.sessionId, []);
    }
    groups.get(e.sessionId).push(e);
  });

  return groups;
}

/**
 * Calculate tool usage statistics
 * @param {ExecutionRecord[]} executions
 * @returns {Array<{toolName: string, count: number, percentage: number}>}
 */
export function calculateToolUsage(executions) {
  const counts = new Map();
  executions.forEach(e => {
    const count = counts.get(e.toolName) || 0;
    counts.set(e.toolName, count + 1);
  });

  const total = executions.length;

  return Array.from(counts.entries())
    .map(([toolName, count]) => ({
      toolName,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Calculate success rate over time (for charts)
 * @param {ExecutionRecord[]} executions
 * @param {number} [bucketSize=3600000] - Bucket size in ms (default: 1 hour)
 * @returns {Array<{timestamp: number, total: number, successful: number, rate: number}>}
 */
export function calculateSuccessRateOverTime(executions, bucketSize = 3600000) {
  if (executions.length === 0) return [];

  const completed = executions.filter(e => e.status !== 'running');
  if (completed.length === 0) return [];

  // Sort by timestamp
  const sorted = [...completed].sort((a, b) => a.startedAt - b.startedAt);
  
  const minTime = sorted[0].startedAt;
  const maxTime = sorted[sorted.length - 1].startedAt;
  
  // Create buckets
  const buckets = new Map();
  
  for (let t = minTime; t <= maxTime; t += bucketSize) {
    buckets.set(t, { total: 0, successful: 0 });
  }

  // Fill buckets
  sorted.forEach(e => {
    const bucketTime = Math.floor(e.startedAt / bucketSize) * bucketSize;
    const bucket = buckets.get(bucketTime);
    if (bucket) {
      bucket.total++;
      if (e.status === 'completed') {
        bucket.successful++;
      }
    }
  });

  // Convert to array with rates
  return Array.from(buckets.entries())
    .map(([timestamp, data]) => ({
      timestamp,
      total: data.total,
      successful: data.successful,
      rate: data.total > 0 ? Math.round((data.successful / data.total) * 100) : 0
    }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Calculate average duration by tool
 * @param {ExecutionRecord[]} executions
 * @returns {Array<{toolName: string, averageDuration: number, minDuration: number, maxDuration: number}>}
 */
export function calculateDurationStats(executions) {
  const toolDurations = new Map();

  executions
    .filter(e => e.status !== 'running' && e.duration !== undefined)
    .forEach(e => {
      if (!toolDurations.has(e.toolName)) {
        toolDurations.set(e.toolName, []);
      }
      toolDurations.get(e.toolName).push(e.duration);
    });

  return Array.from(toolDurations.entries())
    .map(([toolName, durations]) => {
      const sorted = durations.sort((a, b) => a - b);
      const sum = durations.reduce((a, b) => a + b, 0);
      
      return {
        toolName,
        averageDuration: Math.round(sum / durations.length),
        minDuration: sorted[0],
        maxDuration: sorted[sorted.length - 1]
      };
    })
    .sort((a, b) => b.averageDuration - a.averageDuration);
}

/**
 * Export executions to JSONL format
 * @param {ExecutionRecord[]} executions
 * @returns {string}
 */
export function exportToJsonl(executions) {
  return executions
    .map(e => JSON.stringify(e))
    .join('\n');
}

/**
 * Export executions to CSV format
 * @param {ExecutionRecord[]} executions
 * @returns {string}
 */
export function exportToCsv(executions) {
  if (executions.length === 0) return '';

  const headers = ['executionId', 'sessionId', 'toolName', 'status', 'startedAt', 'completedAt', 'duration', 'success'];
  
  const rows = executions.map(e => [
    e.executionId,
    e.sessionId,
    e.toolName,
    e.status,
    new Date(e.startedAt).toISOString(),
    e.completedAt ? new Date(e.completedAt).toISOString() : '',
    e.duration || '',
    e.result?.success || false
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * Import executions from JSONL format
 * @param {string} jsonl
 * @returns {ExecutionRecord[]}
 */
export function importFromJsonl(jsonl) {
  return jsonl
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

/**
 * Filter executions by time range
 * @param {ExecutionRecord[]} executions
 * @param {number} from - Start timestamp
 * @param {number} to - End timestamp
 * @returns {ExecutionRecord[]}
 */
export function filterByTimeRange(executions, from, to) {
  return executions.filter(e => e.startedAt >= from && e.startedAt <= to);
}

/**
 * Filter executions by multiple criteria
 * @param {ExecutionRecord[]} executions
 * @param {Object} criteria
 * @param {string} [criteria.sessionId]
 * @param {string} [criteria.toolName]
 * @param {string} [criteria.status]
 * @returns {ExecutionRecord[]}
 */
export function filterExecutions(executions, criteria) {
  return executions.filter(e => {
    if (criteria.sessionId && e.sessionId !== criteria.sessionId) return false;
    if (criteria.toolName && e.toolName !== criteria.toolName) return false;
    if (criteria.status && e.status !== criteria.status) return false;
    return true;
  });
}
