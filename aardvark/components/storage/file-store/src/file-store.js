/**
 * FileStore - Repository file management on top of OPFS Provider
 * 
 * Provides high-level file operations with:
 * - Repository namespacing
 * - GitHub repository loading
 * - File tree caching
 * - Path normalization
 * - Event notifications
 */

import { OPFSProvider } from '../../../core/opfs-provider/src/index.js';
import { EventBus } from '../../../core/event-bus/src/index.js';

/**
 * @typedef {Object} RepoInfo
 * @property {string} name
 * @property {number} created
 * @property {number} modified
 * @property {number} fileCount
 * @property {number} totalSize
 */

/**
 * @typedef {Object} DirEntry
 * @property {string} name
 * @property {string} path
 * @property {'file' | 'directory'} type
 * @property {number} [size]
 * @property {number} [modified]
 */

/**
 * @typedef {Object} FileMetadata
 * @property {string} path
 * @property {number} size
 * @property {number} created
 * @property {number} modified
 * @property {string} [checksum]
 */

/**
 * @typedef {Object} RepoStats
 * @property {number} fileCount
 * @property {number} directoryCount
 * @property {number} totalSize
 * @property {Map<string, number>} languages
 */

/**
 * @typedef {Object} LoadProgress
 * @property {number} totalFiles
 * @property {number} loadedFiles
 * @property {string} currentFile
 * @property {number} percentage
 */

export class FileStore {
  /**
   * Create a new FileStore
   * @param {Object} options - Configuration options
   * @param {OPFSProvider} [options.opfs] - OPFS Provider instance
   * @param {EventBus} [options.eventBus] - Event Bus instance
   */
  constructor(options = {}) {
    this.opfs = options.opfs || new OPFSProvider();
    this.eventBus = options.eventBus || new EventBus();
    this.cache = new Map(); // repo -> file tree cache
    this.repoPath = '/repos';
  }

  /**
   * Initialize the file store
   * @returns {Promise<void>}
   */
  async initialize() {
    await this.opfs.initialize();
    
    // Ensure repos directory exists
    try {
      await this.opfs.readDir(this.repoPath);
    } catch {
      await this.opfs.createDir(this.repoPath);
    }
  }

  /**
   * Get the full path for a repository
   * @private
   * @param {string} repo - Repository name
   * @param {string} [path] - Relative path within repo
   * @returns {string}
   */
  _getRepoPath(repo, path = '') {
    if (path.startsWith('/')) {
      path = path.slice(1);
    }
    return path 
      ? `${this.repoPath}/${repo}/${path}`
      : `${this.repoPath}/${repo}`;
  }

  /**
   * Normalize a path (resolve . and ..)
   * @private
   * @param {string} path - Path to normalize
   * @returns {string}
   */
  _normalizePath(path) {
    if (!path) return '';
    
    // Remove leading slash
    if (path.startsWith('/')) {
      path = path.slice(1);
    }
    
    // Split and filter out empty parts and .
    const parts = path.split('/').filter(part => part && part !== '.');
    const normalized = [];
    
    for (const part of parts) {
      if (part === '..') {
        normalized.pop();
      } else {
        normalized.push(part);
      }
    }
    
    return normalized.join('/');
  }

  /**
   * Clear cache for a repository
   * @private
   * @param {string} repo
   */
  _clearCache(repo) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${repo}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Create a new repository
   * @param {string} name - Repository name
   * @returns {Promise<void>}
   */
  async createRepo(name) {
    const repoPath = this._getRepoPath(name);
    await this.opfs.createDir(repoPath);
    
    const now = Date.now();
    const repoInfo = {
      name,
      created: now,
      modified: now,
      fileCount: 0,
      totalSize: 0
    };
    
    // Store repo metadata
    await this.opfs.writeFile(
      `${repoPath}/.repo-meta.json`,
      JSON.stringify(repoInfo)
    );
    
    // Publish event
    this.eventBus.publish('repo:created', { repo: name });
  }

  /**
   * Delete a repository
   * @param {string} name - Repository name
   * @returns {Promise<void>}
   */
  async deleteRepo(name) {
    const repoPath = this._getRepoPath(name);
    await this.opfs.deleteDir(repoPath);
    
    this._clearCache(name);
    
    // Publish event
    this.eventBus.publish('repo:deleted', { repo: name });
  }

  /**
   * List all repositories
   * @returns {Promise<RepoInfo[]>}
   */
  async listRepos() {
    const entries = await this.opfs.readDir(this.repoPath);
    const repos = [];
    
    for (const entry of entries) {
      if (entry.type === 'directory') {
        try {
          const info = await this.getRepoInfo(entry.name);
          repos.push(info);
        } catch {
          // Skip invalid repos
        }
      }
    }
    
    return repos.sort((a, b) => b.modified - a.modified);
  }

  /**
   * Get repository info
   * @param {string} name - Repository name
   * @returns {Promise<RepoInfo>}
   */
  async getRepoInfo(name) {
    const metaPath = `${this._getRepoPath(name)}/.repo-meta.json`;
    
    try {
      const content = await this.opfs.readFile(metaPath);
      return JSON.parse(content);
    } catch {
      // Return default info if meta file doesn't exist
      return {
        name,
        created: Date.now(),
        modified: Date.now(),
        fileCount: 0,
        totalSize: 0
      };
    }
  }

  /**
   * Update repository metadata
   * @private
   * @param {string} name
   */
  async _updateRepoMeta(name) {
    const stats = await this.getRepoStats(name);
    const metaPath = `${this._getRepoPath(name)}/.repo-meta.json`;
    
    let info;
    try {
      const content = await this.opfs.readFile(metaPath);
      info = JSON.parse(content);
    } catch {
      info = { name, created: Date.now() };
    }
    
    info.modified = Date.now();
    info.fileCount = stats.fileCount;
    info.totalSize = stats.totalSize;
    
    await this.opfs.writeFile(metaPath, JSON.stringify(info));
  }

  /**
   * Read a file from a repository
   * @param {string} repo - Repository name
   * @param {string} path - File path
   * @returns {Promise<string>}
   */
  async read(repo, path) {
    const fullPath = this._getRepoPath(repo, this._normalizePath(path));
    return this.opfs.readFile(fullPath);
  }

  /**
   * Write a file to a repository
   * @param {string} repo - Repository name
   * @param {string} path - File path
   * @param {string} content - File content
   * @returns {Promise<void>}
   */
  async write(repo, path, content) {
    const normalizedPath = this._normalizePath(path);
    const fullPath = this._getRepoPath(repo, normalizedPath);
    
    // Check if file exists (for event type)
    let exists = false;
    try {
      await this.opfs.readFile(fullPath);
      exists = true;
    } catch {
      // File doesn't exist
    }
    
    await this.opfs.writeFile(fullPath, content);
    this._clearCache(repo);
    
    // Update repo metadata
    await this._updateRepoMeta(repo);
    
    // Publish event
    const eventType = exists ? 'file:updated' : 'file:created';
    this.eventBus.publish(eventType, {
      repo,
      path: normalizedPath,
      size: new Blob([content]).size
    });
  }

  /**
   * Delete a file from a repository
   * @param {string} repo - Repository name
   * @param {string} path - File path
   * @returns {Promise<void>}
   */
  async delete(repo, path) {
    const normalizedPath = this._normalizePath(path);
    const fullPath = this._getRepoPath(repo, normalizedPath);
    
    await this.opfs.deleteFile(fullPath);
    this._clearCache(repo);
    
    // Update repo metadata
    await this._updateRepoMeta(repo);
    
    // Publish event
    this.eventBus.publish('file:deleted', {
      repo,
      path: normalizedPath
    });
  }

  /**
   * Check if a file exists
   * @param {string} repo - Repository name
   * @param {string} path - File path
   * @returns {Promise<boolean>}
   */
  async exists(repo, path) {
    const fullPath = this._getRepoPath(repo, this._normalizePath(path));
    return this.opfs.exists(fullPath);
  }

  /**
   * List directory contents
   * @param {string} repo - Repository name
   * @param {string} [path] - Directory path (empty for root)
   * @returns {Promise<DirEntry[]>}
   */
  async list(repo, path = '') {
    const fullPath = this._getRepoPath(repo, this._normalizePath(path));
    const entries = await this.opfs.readDir(fullPath);
    
    return entries
      .filter(entry => !entry.name.startsWith('.')) // Hide hidden files
      .map(entry => ({
        name: entry.name,
        path: path ? `${path}/${entry.name}` : entry.name,
        type: entry.type,
        size: entry.size,
        modified: entry.modified
      }));
  }

  /**
   * Walk directory tree recursively
   * @param {string} repo - Repository name
   * @param {string} [path] - Starting path
   * @returns {Promise<string[]>} - Array of file paths
   */
  async walk(repo, path = '') {
    const cacheKey = `${repo}:${path}`;
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const fullPath = this._getRepoPath(repo, this._normalizePath(path));
    const files = [];
    
    const walkDir = async (dirPath, basePath) => {
      const entries = await this.opfs.readDir(dirPath);
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Skip hidden
        
        const relativePath = basePath 
          ? `${basePath}/${entry.name}`
          : entry.name;
        
        if (entry.type === 'directory') {
          await walkDir(`${dirPath}/${entry.name}`, relativePath);
        } else {
          files.push(relativePath);
        }
      }
    };
    
    await walkDir(fullPath, this._normalizePath(path));
    
    // Cache result
    this.cache.set(cacheKey, files);
    
    return files;
  }

  /**
   * Find files matching a glob pattern
   * @param {string} repo - Repository name
   * @param {string} pattern - Glob pattern (e.g., "*.js", "src/**\/*.rs")
   * @returns {Promise<string[]>}
   */
  async glob(repo, pattern) {
    const allFiles = await this.walk(repo);
    
    // Simple glob matching
    const regex = new RegExp(
      pattern
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.')
        .replace(/{{GLOBSTAR}}/g, '.*')
    );
    
    return allFiles.filter(file => regex.test(file));
  }

  /**
   * Get file metadata
   * @param {string} repo - Repository name
   * @param {string} path - File path
   * @returns {Promise<FileMetadata>}
   */
  async getMetadata(repo, path) {
    const normalizedPath = this._normalizePath(path);
    const fullPath = this._getRepoPath(repo, normalizedPath);
    
    const metadata = await this.opfs.getMetadata(fullPath);
    
    return {
      path: normalizedPath,
      size: metadata.size,
      created: metadata.created,
      modified: metadata.modified
    };
  }

  /**
   * Get repository statistics
   * @param {string} repo - Repository name
   * @returns {Promise<RepoStats>}
   */
  async getRepoStats(repo) {
    const files = await this.walk(repo);
    let totalSize = 0;
    let directoryCount = 0;
    const languages = new Map();
    
    for (const file of files) {
      try {
        const metadata = await this.getMetadata(repo, file);
        totalSize += metadata.size;
        
        // Count by extension
        const extParts = file.split('.').pop();
        const ext = extParts ? extParts.toLowerCase() : null;
        if (ext) {
          languages.set(ext, (languages.get(ext) || 0) + 1);
        }
      } catch {
        // Skip files we can't stat
      }
    }
    
    // Count directories by walking
    const countDirs = async (path) => {
      const entries = await this.list(repo, path);
      for (const entry of entries) {
        if (entry.type === 'directory') {
          directoryCount++;
          await countDirs(entry.path);
        }
      }
    };
    await countDirs('');
    
    return {
      fileCount: files.length,
      directoryCount,
      totalSize,
      languages
    };
  }

  /**
   * Load repository from GitHub
   * @param {string} repo - Local repository name to create
   * @param {string} owner - GitHub owner
   * @param {string} repoName - GitHub repository name
   * @param {string} [branch='main'] - Branch to load
   * @param {Object} [options]
 * @param {string} [options.token] - GitHub token for private repos
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<LoadProgress>}
   */
  async loadFromGitHub(repo, owner, repoName, branch = 'main', options = {}) {
    // Import GitHub loader dynamically
    const { GitHubLoader } = await import('./github-loader.js');
    const loader = new GitHubLoader({
      token: options.token,
      eventBus: this.eventBus
    });
    
    // Create repo directory
    await this.createRepo(repo);
    const repoPath = this._getRepoPath(repo);
    
    // Publish loading event
    this.eventBus.publish('repo:loading', {
      repo,
      owner,
      name: repoName,
      branch
    });
    
    try {
      // Load from GitHub
      const result = await loader.loadRepository({
        owner,
        repo: repoName,
        branch,
        targetPath: repoPath,
        onProgress: options.onProgress
      });
      
      // Update repo metadata
      await this._updateRepoMeta(repo);
      this._clearCache(repo);
      
      // Publish loaded event
      this.eventBus.publish('repo:loaded', {
        repo,
        owner,
        name: repoName,
        fileCount: result.fileCount
      });
      
      return result;
    } catch (error) {
      // Publish error event
      this.eventBus.publish('repo:load-error', {
        repo,
        owner,
        name: repoName,
        error: error.message
      });
      throw error;
    }
  }
}

// Default export
export default FileStore;
