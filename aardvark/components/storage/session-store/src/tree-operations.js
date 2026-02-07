/**
 * TreeOperations - Complex session tree logic
 */

export class TreeOperations {
  constructor(db) {
    this.db = db;
  }

  /**
   * Get the history path from root to a specific node (context reconstruction)
   * @param {string} sessionId 
   * @param {string} nodeId 
   * @returns {Promise<Array>} Array of nodes
   */
  async getHistory(sessionId, nodeId) {
    const history = [];
    let currentId = nodeId;

    while (currentId) {
      const node = await this.db.get('nodes', currentId);
      if (!node) break;
      
      // Safety check to prevent infinite loops or cross-session leaks
      if (node.sessionId !== sessionId) break;

      history.unshift(node); // Add to front
      currentId = node.parentId;
    }

    return history;
  }

  /**
   * Find the root node of a branch
   */
  async getRoot(sessionId, nodeId) {
    const history = await this.getHistory(sessionId, nodeId);
    return history[0] || null;
  }

  /**
   * Get all nodes in a session as a flat list (client can reconstruct tree)
   * For very large sessions, this strategy might need pagination.
   */
  async getTree(sessionId) {
      // In a real implementation with indexes, we'd use getAllByIndex('sessionId', sessionId)
      // Since our simple IndexedDBProvider might not expose advanced querying yet:
      const allNodes = await this.db.getAll('nodes');
      return allNodes.filter(n => n.sessionId === sessionId);
  }

  /**
   * Identify all "leaf" nodes that represent branch tips
   */
  async getBranches(sessionId) {
      const nodes = await this.getTree(sessionId);
      
      // A branch tip is a node with no children
      // But wait, our node.children array is updated on addNode.
      // So we can check node.children.length === 0
      
      const tips = nodes.filter(n => !n.children || n.children.length === 0);
      
      // Map to BranchInfo
      return tips.map(node => ({
          nodeId: node.id,
          name: node.content.slice(0, 50) + (node.content.length > 50 ? '...' : ''),
          created: node.timestamp,
          messageCount: 0 // TODO: Calculate depth/count efficiently
      }));
  }
}
