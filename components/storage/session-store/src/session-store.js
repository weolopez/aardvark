/**
 * SessionStore - Session tree persistence
 */

import { IndexedDBProvider } from '../../../core/indexeddb-provider/src/index.js';
import { EventBus } from '../../../core/event-bus/src/index.js';
import { TreeOperations } from './tree-operations.js';
import { SearchOperations } from './search.js';

/**
 * @typedef {Object} SessionMetadata
 * @property {string} name
 * @property {string} [description]
 * @property {string} [repo]
 */

/**
 * @typedef {Object} NodeData
 * @property {'user'|'assistant'|'system'} role
 * @property {string} content
 * @property {Array} [toolCalls]
 * @property {Array} [toolResults]
 * @property {Object} [metadata]
 */

export class SessionStore {
  /**
   * @param {Object} options
   * @param {IndexedDBProvider} [options.db]
   * @param {EventBus} [options.eventBus]
   */
  constructor(options = {}) {
    const dbName = options.dbName || 'aardvark-sessions';
    this.db = options.db || new IndexedDBProvider(dbName);
    this.eventBus = options.eventBus || new EventBus();
    this.treeOps = new TreeOperations(this.db);
    this.searchOps = new SearchOperations(this.db);
    this.initialized = false;
  }

  /**
   * Initialize the store and database schema
   * @param {string} [dbName='aardvark-sessions']
   */
  async initialize() {
    if (this.initialized) return;

    const stores = [
      {
        name: 'sessions',
        keyPath: 'sessionId',
        indexes: [
          { name: 'created', keyPath: 'created' },
          { name: 'modified', keyPath: 'modified' },
          { name: 'repo', keyPath: 'repo' }
        ]
      },
      {
        name: 'nodes',
        keyPath: 'id',
        indexes: [
          { name: 'sessionId', keyPath: 'sessionId' },
          { name: 'parentId', keyPath: 'parentId' },
          { name: 'timestamp', keyPath: 'timestamp' }
        ]
      }
    ];

    await this.db.initialize(stores);
    this.initialized = true;
  }

  // --- Session CRUD ---

  /**
   * Create a new session
   * @param {SessionMetadata} metadata
   * @returns {Promise<string>} sessionId
   */
  async createSession(metadata) {
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    
    const session = {
      sessionId,
      name: metadata.name || 'Untitled Session',
      description: metadata.description || '',
      repo: metadata.repo || null,
      currentNodeId: null,
      created: now,
      modified: now,
      messageCount: 0
    };

    await this.db.add('sessions', session);
    
    this.eventBus.publish('session:created', { 
      sessionId, 
      name: session.name,
      repo: session.repo 
    });

    return sessionId;
  }

  /**
   * Get a session by ID
   * @param {string} sessionId
   * @returns {Promise<Object>}
   */
  async getSession(sessionId) {
    const session = await this.db.get('sessions', sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    
    if (session.currentNodeId) {
        try {
            session.root = await this.treeOps.getRoot(sessionId, session.currentNodeId);
        } catch (e) {
            // If root resolution fails, don't crash, just ignore
        }
    }
    
    return session;
  }

  /**
   * Update session metadata
   * @param {string} sessionId
   * @param {Object} updates
   */
  async updateSession(sessionId, updates) {
    const session = await this.getSession(sessionId);
    const updated = {
      ...session,
      ...updates,
      modified: Date.now()
    };
    
    await this.db.put('sessions', updated);
    
    this.eventBus.publish('session:updated', { 
      sessionId, 
      updates 
    });
  }

  /**
   * Delete a session and all its nodes
   * @param {string} sessionId
   */
  async deleteSession(sessionId) {
    // Delete all nodes for this session
    // This might be slow for large sessions, ideally indexedDB provider has deleteBy
    const nodes = await this.db.getAll('nodes'); // PERF: Should use index
    const sessionNodes = nodes.filter(n => n.sessionId === sessionId);
    
    for (const node of sessionNodes) {
        await this.db.delete('nodes', node.id);
    }

    await this.db.delete('sessions', sessionId);
    
    this.eventBus.publish('session:deleted', { sessionId });
  }

  /**
   * List sessions
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  async listSessions(options = {}) {
    const sessions = await this.db.getAll('sessions');
    // Basic in-memory sort/limit (IndexedDB provider is simple)
    // For production, push this down to provider
    
    if (options.sortBy) {
        sessions.sort((a, b) => {
            const valA = a[options.sortBy];
            const valB = b[options.sortBy];
            return options.sortOrder === 'asc' ? valA - valB : valB - valA;
        });
    } else {
        // Default sort by modified desc
        sessions.sort((a, b) => b.modified - a.modified);
    }

    if (options.limit) {
        return sessions.slice(0, options.limit);
    }
    
    return sessions;
  }

  // --- Node Operations ---

  /**
   * Add a new node to the session tree
   * @param {string} sessionId
   * @param {string|null} parentId
   * @param {NodeData} data
   * @returns {Promise<string>} nodeId
   */
  async addNode(sessionId, parentId, data) {
    const nodeId = crypto.randomUUID();
    const now = Date.now();
    
    const node = {
      id: nodeId,
      sessionId,
      parentId,
      children: [],
      ...data,
      timestamp: now
    };

    // Save node
    await this.db.add('nodes', node);
    
    // Update parent's children list
    if (parentId) {
      const parent = await this.db.get('nodes', parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(nodeId);
        await this.db.put('nodes', parent);
      }
    }

    // Update session current pointer and counts
    const session = await this.getSession(sessionId);
    session.currentNodeId = nodeId;
    session.messageCount = (session.messageCount || 0) + 1;
    session.modified = now;
    await this.db.put('sessions', session);

    this.eventBus.publish('node:added', {
      sessionId,
      nodeId,
      parentId
    });

    return nodeId;
  }

  /**
   * Get a node
   * @param {string} sessionId
   * @param {string} nodeId
   */
  async getNode(sessionId, nodeId) {
    return this.db.get('nodes', nodeId);
  }

  /**
   * Update a node
   * @param {string} sessionId
   * @param {string} nodeId
   * @param {Object} updates
   */
  async updateNode(sessionId, nodeId, updates) {
    const node = await this.getNode(sessionId, nodeId);
    if (!node) throw new Error(`Node not found: ${nodeId}`);
    
    const updated = { ...node, ...updates };
    await this.db.put('nodes', updated);
    
    this.eventBus.publish('node:updated', {
      sessionId,
      nodeId
    });
  }

  // --- Tree Operations (Delegated) ---

  async getHistory(sessionId, nodeId) {
    return this.treeOps.getHistory(sessionId, nodeId);
  }

  async getTree(sessionId) {
    // Return flat list of nodes for now, or reconstructed tree?
    // Plan says "getTree(sessionId): Promise<SessionTree>"
    return this.treeOps.getTree(sessionId);
  }

  async branch(sessionId, fromNodeId, newNodeData) {
    // Branching is essentially adding a node to an existing parent 
    // that already has children. addNode handles this naturally.
    return this.addNode(sessionId, fromNodeId, newNodeData);
  }

  async getBranches(sessionId) {
    return this.treeOps.getBranches(sessionId);
  }

  // --- Search (Delegated) ---
  
  async searchSessions(query) {
    return this.searchOps.searchSessions(query);
  }

  async searchNodes(sessionId, query) {
    return this.searchOps.searchNodes(sessionId, query);
  }
}

export default SessionStore;
