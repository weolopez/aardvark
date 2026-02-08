/**
 * Tool Store - Tool definitions and pending approval workflow
 * Manages tool discovery from OPFS, SKILL.md parsing, and approval workflow
 */

import { parseSkillMd, extractParametersSchema } from './skill-parser.js';
import { validateToolDefinition, validatePendingToolInput } from './validator.js';
import { FileStore } from '../../../storage/file-store/src/index.js';
import { EventBus } from '../../../core/event-bus/src/index.js';
import { IndexedDBProvider } from '../../../core/indexeddb-provider/src/index.js';

/**
 * @typedef {Object} ToolDefinition
 * @property {string} name - Tool identifier
 * @property {string} description - Tool description
 * @property {Object} parameters - JSON schema for parameters
 * @property {string[]} allowedTools - List of allowed sub-tools
 * @property {string} version - Tool version
 * @property {string} repo - Repository name
 * @property {string} skillMdPath - Path to SKILL.md file
 * @property {string} [instructions] - Full instructions content
 */

/**
 * @typedef {Object} PendingTool
 * @property {string} toolId - Unique tool ID
 * @property {string} name - Tool name
 * @property {string} description - Tool description
 * @property {string} skillMdContent - Full SKILL.md content
 * @property {string} status - 'pending', 'approved', or 'rejected'
 * @property {number} created - Timestamp
 * @property {string} requestedBy - 'llm' or 'user'
 * @property {string} [reason] - Reason for creation
 * @property {number} [reviewedAt] - When reviewed
 * @property {string} [reviewReason] - Reason for rejection
 */

export class ToolStore {
  /**
   * @param {Object} options
   * @param {FileStore} [options.fileStore] - FileStore instance for OPFS access
   * @param {EventBus} [options.eventBus] - EventBus for publishing events
   * @param {IndexedDBProvider} [options.db] - IndexedDB provider for pending tools
   */
  constructor(options = {}) {
    this.fileStore = options.fileStore || new FileStore();
    this.eventBus = options.eventBus || new EventBus();
    this.db = options.db || new IndexedDBProvider('aardvark-tools', 1);
    
    // In-memory registry cache
    this.registry = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the tool store
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    await this.fileStore.initialize();
    
    // Initialize IndexedDB for pending tools
    await this.db.initialize([
      {
        name: 'pending_tools',
        keyPath: 'toolId',
        indexes: [
          { name: 'status', keyPath: 'status' },
          { name: 'created', keyPath: 'created' }
        ]
      }
    ]);

    // Load existing registry from file system
    await this.refreshRegistry();
    
    this.initialized = true;
  }

  // --- Tool Discovery ---

  /**
   * Scan a repository for tools in the .tools/ directory
   * @param {string} repo - Repository name
   * @returns {Promise<ToolDefinition[]>} Array of tool definitions
   */
  async scanTools(repo) {
    const toolsDir = `/.tools`;
    const tools = [];

    try {
      // Check if .tools directory exists
      const exists = await this.fileStore.exists(repo, toolsDir);
      if (!exists) {
        return tools;
      }

      // List all entries in .tools directory
      const entries = await this.fileStore.list(repo, toolsDir);

      for (const entry of entries) {
        if (entry.type === 'directory') {
          try {
            const tool = await this._loadToolFromDirectory(repo, entry.name);
            if (tool) {
              tools.push(tool);
              
              // Add to registry
              const registryKey = `${repo}/${tool.name}`;
              this.registry.set(registryKey, tool);
              
              // Publish event
              this.eventBus.publish('tool:discovered', { 
                repo, 
                tool,
                path: tool.skillMdPath 
              });
            }
          } catch (e) {
            console.warn(`Failed to load tool from ${entry.name}:`, e.message);
          }
        }
      }
    } catch (e) {
      console.warn(`Failed to scan tools in ${repo}:`, e.message);
    }

    return tools;
  }

  /**
   * Scan all repositories for tools
   * @returns {Promise<Map<string, ToolDefinition[]>>} Map of repo -> tools
   */
  async scanAllRepos() {
    const allTools = new Map();
    
    try {
      const repos = await this.fileStore.listRepos();
      
      for (const repoInfo of repos) {
        const tools = await this.scanTools(repoInfo.name);
        if (tools.length > 0) {
          allTools.set(repoInfo.name, tools);
        }
      }
    } catch (e) {
      console.error('Failed to scan all repos:', e);
    }
    
    return allTools;
  }

  /**
   * Load a single tool from a .tools/ subdirectory
   * @private
   */
  async _loadToolFromDirectory(repo, toolDirName) {
    const skillMdPath = `/.tools/${toolDirName}/SKILL.md`;
    
    try {
      const content = await this.fileStore.read(repo, skillMdPath);
      const parsed = parseSkillMd(content);
      
      // Extract parameters schema from instructions
      const parameters = extractParametersSchema(parsed.instructions);
      
      const tool = {
        name: parsed.frontmatter.name,
        description: parsed.frontmatter.description,
        parameters,
        allowedTools: parsed.frontmatter.allowedTools 
          ? parsed.frontmatter.allowedTools.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        version: parsed.frontmatter.version || '1.0.0',
        author: parsed.frontmatter.author || 'Unknown',
        repo,
        skillMdPath,
        instructions: parsed.instructions
      };

      // Validate tool definition
      const validation = validateToolDefinition(tool);
      if (!validation.valid) {
        console.warn(`Tool ${tool.name} validation failed:`, validation.errors);
        return null;
      }

      return tool;
    } catch (e) {
      console.warn(`Failed to parse SKILL.md in ${toolDirName}:`, e.message);
      return null;
    }
  }

  /**
   * Get a specific tool by repo and name
   * @param {string} repo - Repository name
   * @param {string} name - Tool name
   * @returns {Promise<ToolDefinition|null>} Tool definition or null
   */
  async getTool(repo, name) {
    // Check registry first
    const registryKey = `${repo}/${name}`;
    if (this.registry.has(registryKey)) {
      return this.registry.get(registryKey);
    }

    // Try to load from file system
    const tool = await this._loadToolFromDirectory(repo, name);
    if (tool) {
      this.registry.set(registryKey, tool);
    }
    
    return tool;
  }

  /**
   * List all tools (optionally filtered by repo)
   * @param {string} [repo] - Optional repo filter
   * @returns {Promise<ToolDefinition[]>} Array of tools
   */
  async listTools(repo) {
    if (repo) {
      return this.scanTools(repo);
    }

    // Return all tools from registry
    return Array.from(this.registry.values());
  }

  // --- Tool CRUD Operations ---

  /**
   * Create a new tool from SKILL.md content
   * @param {string} repo - Repository name
   * @param {string} name - Tool name
   * @param {string} skillMd - Full SKILL.md content
   * @returns {Promise<ToolDefinition>}
   */
  async createTool(repo, name, skillMd) {
    // Validate SKILL.md format
    const parsed = parseSkillMd(skillMd);
    
    if (parsed.frontmatter.name !== name) {
      throw new Error(`Tool name mismatch: expected "${name}", found "${parsed.frontmatter.name}"`);
    }

    // Create .tools/{name}/ directory and write SKILL.md
    const toolDir = `/.tools/${name}`;
    const skillMdPath = `${toolDir}/SKILL.md`;

    // Ensure directory exists
    await this.fileStore.write(repo, skillMdPath, skillMd);

    // Load and validate the created tool
    const tool = await this._loadToolFromDirectory(repo, name);
    if (!tool) {
      throw new Error('Failed to load created tool');
    }

    // Add to registry
    const registryKey = `${repo}/${tool.name}`;
    this.registry.set(registryKey, tool);

    // Publish event
    this.eventBus.publish('tool:created', { repo, tool });

    return tool;
  }

  /**
   * Update an existing tool
   * @param {string} repo - Repository name
   * @param {string} name - Tool name
   * @param {string} skillMd - New SKILL.md content
   * @returns {Promise<ToolDefinition>}
   */
  async updateTool(repo, name, skillMd) {
    // Parse to validate
    const parsed = parseSkillMd(skillMd);
    
    if (parsed.frontmatter.name !== name) {
      throw new Error('Cannot change tool name in update');
    }

    const skillMdPath = `/.tools/${name}/SKILL.md`;
    await this.fileStore.write(repo, skillMdPath, skillMd);

    // Reload from file system
    const tool = await this._loadToolFromDirectory(repo, name);
    if (!tool) {
      throw new Error('Failed to load updated tool');
    }

    // Update registry
    const registryKey = `${repo}/${tool.name}`;
    this.registry.set(registryKey, tool);

    // Publish event
    this.eventBus.publish('tool:updated', { repo, tool });

    return tool;
  }

  /**
   * Delete a tool
   * @param {string} repo - Repository name
   * @param {string} name - Tool name
   * @returns {Promise<void>}
   */
  async deleteTool(repo, name) {
    const toolDir = `/.tools/${name}`;
    
    // Delete the tool directory
    await this.fileStore.delete(repo, toolDir);

    // Remove from registry
    const registryKey = `${repo}/${name}`;
    this.registry.delete(registryKey);

    // Publish event
    this.eventBus.publish('tool:deleted', { repo, name });
  }

  // --- Pending Tools (Approval Workflow) ---

  /**
   * Add a tool to the pending approval queue
   * @param {Object} toolInput - Pending tool input
   * @param {string} toolInput.name - Tool name
   * @param {string} toolInput.description - Tool description
   * @param {string} toolInput.skillMdContent - Full SKILL.md content
   * @param {string} toolInput.requestedBy - 'llm' or 'user'
   * @param {string} [toolInput.reason] - Reason for creation
   * @returns {Promise<string>} toolId
   */
  async addPendingTool(toolInput) {
    // Validate input
    const validation = validatePendingToolInput(toolInput);
    if (!validation.valid) {
      throw new Error(`Invalid pending tool: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    const toolId = crypto.randomUUID();
    const pendingTool = {
      toolId,
      name: toolInput.name,
      description: toolInput.description,
      skillMdContent: toolInput.skillMdContent,
      status: 'pending',
      created: Date.now(),
      requestedBy: toolInput.requestedBy,
      reason: toolInput.reason || ''
    };

    await this.db.add('pending_tools', pendingTool);

    // Publish event
    this.eventBus.publish('tool:pending', { 
      toolId, 
      name: pendingTool.name,
      requestedBy: pendingTool.requestedBy 
    });

    return toolId;
  }

  /**
   * Get a pending tool by ID
   * @param {string} toolId - Tool ID
   * @returns {Promise<PendingTool|null>}
   */
  async getPendingTool(toolId) {
    return this.db.get('pending_tools', toolId);
  }

  /**
   * List all pending tools
   * @param {string} [status] - Filter by status ('pending', 'approved', 'rejected')
   * @returns {Promise<PendingTool[]>}
   */
  async listPendingTools(status = null) {
    const allTools = await this.db.getAll('pending_tools');
    
    if (status) {
      return allTools.filter(t => t.status === status);
    }
    
    return allTools;
  }

  /**
   * Approve a pending tool
   * @param {string} toolId - Tool ID to approve
   * @param {string} [repo] - Target repository (default: first available)
   * @returns {Promise<ToolDefinition>}
   */
  async approveTool(toolId, repo = null) {
    const pendingTool = await this.getPendingTool(toolId);
    if (!pendingTool) {
      throw new Error(`Pending tool not found: ${toolId}`);
    }

    if (pendingTool.status !== 'pending') {
      throw new Error(`Tool is not pending approval, current status: ${pendingTool.status}`);
    }

    // Determine target repo
    if (!repo) {
      const repos = await this.fileStore.listRepos();
      if (repos.length === 0) {
        throw new Error('No repositories available. Create a repo first.');
      }
      repo = repos[0].name;
    }

    // Create the tool
    const tool = await this.createTool(repo, pendingTool.name, pendingTool.skillMdContent);

    // Update pending status
    pendingTool.status = 'approved';
    pendingTool.reviewedAt = Date.now();
    await this.db.put('pending_tools', pendingTool);

    // Publish event
    this.eventBus.publish('tool:approved', { 
      toolId, 
      repo, 
      name: tool.name 
    });

    return tool;
  }

  /**
   * Reject a pending tool
   * @param {string} toolId - Tool ID to reject
   * @param {string} [reason] - Reason for rejection
   * @returns {Promise<void>}
   */
  async rejectTool(toolId, reason = '') {
    const pendingTool = await this.getPendingTool(toolId);
    if (!pendingTool) {
      throw new Error(`Pending tool not found: ${toolId}`);
    }

    if (pendingTool.status !== 'pending') {
      throw new Error(`Tool is not pending approval, current status: ${pendingTool.status}`);
    }

    pendingTool.status = 'rejected';
    pendingTool.reviewedAt = Date.now();
    pendingTool.reviewReason = reason;
    await this.db.put('pending_tools', pendingTool);

    // Publish event
    this.eventBus.publish('tool:rejected', { 
      toolId, 
      name: pendingTool.name,
      reason 
    });
  }

  // --- Registry Management ---

  /**
   * Refresh the in-memory tool registry from file system
   * @returns {Promise<void>}
   */
  async refreshRegistry() {
    this.registry.clear();
    
    try {
      const allTools = await this.scanAllRepos();
      
      for (const [repo, tools] of allTools) {
        for (const tool of tools) {
          const registryKey = `${repo}/${tool.name}`;
          this.registry.set(registryKey, tool);
        }
      }
    } catch (e) {
      console.error('Failed to refresh registry:', e);
    }
  }

  /**
   * Get the current tool registry
   * @returns {Map<string, ToolDefinition>} Map of "repo/name" -> tool
   */
  getRegistry() {
    return new Map(this.registry);
  }
}

export default ToolStore;
