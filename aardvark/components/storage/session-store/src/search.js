/**
 * SearchOperations - Full text search for sessions
 */

export class SearchOperations {
  constructor(db) {
    this.db = db;
  }

  /**
   * Search sessions by name or description
   * @param {string} query 
   */
  async searchSessions(query) {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    
    const sessions = await this.db.getAll('sessions');
    
    return sessions.filter(s => 
      (s.name && s.name.toLowerCase().includes(lowerQuery)) ||
      (s.description && s.description.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Search nodes content within a session
   * @param {string} sessionId 
   * @param {string} query 
   */
  async searchNodes(sessionId, query) {
    if (!query) return [];
    const lowerQuery = query.toLowerCase();
    
    // PERF: This scans all nodes. In production, use an index or specific store method.
    const allNodes = await this.db.getAll('nodes');
    
    return allNodes.filter(n => 
      n.sessionId === sessionId &&
      n.content && 
      n.content.toLowerCase().includes(lowerQuery)
    );
  }
}
