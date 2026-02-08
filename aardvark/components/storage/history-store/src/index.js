/**
 * History Store - Tool execution history and statistics
 * @module @aardvark/history-store
 */

export { HistoryStore } from './history-store.js';
export {
  calculateStats,
  groupByTool,
  groupBySession,
  calculateToolUsage,
  calculateSuccessRateOverTime,
  calculateDurationStats,
  exportToJsonl,
  exportToCsv,
  importFromJsonl,
  filterByTimeRange,
  filterExecutions
} from './aggregations.js';

export { default } from './history-store.js';
