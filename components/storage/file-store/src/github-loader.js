/**
 * GitHubLoader - Load repositories from GitHub API to OPFS
 * 
 * Features:
 * - Fetch repository tree via GitHub API
 * - Stream files to OPFS
 * - Progress tracking
 * - Rate limit handling
 * - Authentication support
 */

/**
 * @typedef {Object} LoadOptions
 * @property {string} owner - GitHub owner
 * @property {string} repo - Repository name
 * @property {string} [branch='main'] - Branch to load
 * @property {string} targetPath - Target path in OPFS
 * @property {string} [token] - GitHub token
 * @property {Function} [onProgress] - Progress callback (progress: LoadProgress) => void
 */

/**
 * @typedef {Object} LoadProgress
 * @property {number} totalFiles
 * @property {number} loadedFiles
 * @property {string} currentFile
 * @property {number} percentage
 * @property {number} fileCount
 */

/**
 * @typedef {Object} GitHubTreeItem
 * @property {string} path
 * @property {string} type ('blob' | 'tree')
 * @property {string} sha
 * @property {string} [url]
 */

export class GitHubLoader {
  /**
   * Create a new GitHubLoader
   * @param {Object} options
   * @param {string} [options.token] - GitHub personal access token
   * @param {EventBus} [options.eventBus] - Event Bus for publishing events
   */
  constructor(options = {}) {
    this.token = options.token;
    this.eventBus = options.eventBus;
    this.baseUrl = 'https://api.github.com';
    this.rateLimitRemaining = 60;
    this.rateLimitReset = 0;
  }

  /**
   * Make an authenticated GitHub API request
   * @private
   * @param {string} endpoint - API endpoint
   * @returns {Promise<Response>}
   */
  async _apiRequest(endpoint) {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Aardvark-FileStore'
    };
    
    if (this.token) {
      headers['Authorization'] = `token ${this.token}`;
    }
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, { headers });
    
    // Update rate limit info
    this.rateLimitRemaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '0');
    this.rateLimitReset = parseInt(response.headers.get('X-RateLimit-Reset') || '0') * 1000;
    
    if (response.status === 403 && this.rateLimitRemaining === 0) {
      const resetDate = new Date(this.rateLimitReset);
      throw new Error(`GitHub API rate limit exceeded. Resets at ${resetDate.toLocaleTimeString()}`);
    }
    
    if (response.status === 404) {
      throw new Error('Repository not found. Check the owner and repo name.');
    }
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `GitHub API error: ${response.status}`);
    }
    
    return response;
  }

  /**
   * Get repository tree
   * @private
   * @param {string} owner
   * @param {string} repo
   * @param {string} sha
   * @returns {Promise<GitHubTreeItem[]>}
   */
  async _getTree(owner, repo, sha) {
    const response = await this._apiRequest(
      `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`
    );
    
    const data = await response.json();
    return data.tree || [];
  }

  /**
   * Get default branch SHA
   * @private
   * @param {string} owner
   * @param {string} repo
   * @param {string} branch
   * @returns {Promise<string>}
   */
  async _getBranchSha(owner, repo, branch) {
    const response = await this._apiRequest(
      `/repos/${owner}/${repo}/branches/${branch}`
    );
    
    const data = await response.json();
    return data.commit.sha;
  }

  /**
   * Get file content
   * @private
   * @param {string} owner
   * @param {string} repo
   * @param {string} path
   * @param {string} ref
   * @returns {Promise<string>}
   */
  async _getFileContent(owner, repo, path, ref) {
    const response = await this._apiRequest(
      `/repos/${owner}/${repo}/contents/${path}?ref=${ref}`
    );
    
    const data = await response.json();
    
    // GitHub returns base64 encoded content
    if (data.content) {
      return atob(data.content.replace(/\n/g, ''));
    }
    
    throw new Error('No content in response');
  }

  /**
   * Get file content via blob API (for large files)
   * @private
   * @param {string} owner
   * @param {string} repo
   * @param {string} sha
   * @returns {Promise<string>}
   */
  async _getBlobContent(owner, repo, sha) {
    const response = await this._apiRequest(
      `/repos/${owner}/${repo}/git/blobs/${sha}`
    );
    
    const data = await response.json();
    
    if (data.content) {
      return atob(data.content.replace(/\n/g, ''));
    }
    
    throw new Error('No content in blob');
  }

  /**
   * Load a repository from GitHub
   * @param {LoadOptions} options
   * @returns {Promise<LoadProgress>}
   */
  async loadRepository(options) {
    const { owner, repo, branch = 'main', targetPath, onProgress } = options;
    
    // Get branch SHA
    const sha = await this._getBranchSha(owner, repo, branch);
    
    // Get repository tree
    const tree = await this._getTree(owner, repo, sha);
    
    // Filter to only files (blobs)
    const files = tree.filter(item => item.type === 'blob');
    const totalFiles = files.length;
    
    let loadedFiles = 0;
    const progress = {
      totalFiles,
      loadedFiles: 0,
      currentFile: '',
      percentage: 0,
      fileCount: 0
    };

    // Import OPFS provider dynamically
    const { OPFSProvider } = await import('../../../core/opfs-provider/src/index.js');
    const opfs = new OPFSProvider();
    await opfs.initialize();

    // Process files in batches to avoid overwhelming the API
    const batchSize = 10;
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (file) => {
        try {
          progress.currentFile = file.path;
          
          // Get file content
          let content;
          try {
            // Try contents API first
            content = await this._getFileContent(owner, repo, file.path, branch);
          } catch {
            // Fall back to blob API
            content = await this._getBlobContent(owner, repo, file.sha);
          }
          
          // Write to OPFS
          const targetFilePath = `${targetPath}/${file.path}`;
          await opfs.writeFile(targetFilePath, content);
          
          loadedFiles++;
          progress.loadedFiles = loadedFiles;
          progress.percentage = Math.round((loadedFiles / totalFiles) * 100);
          
          if (onProgress) {
            onProgress({ ...progress });
          }
          
          if (this.eventBus) {
            this.eventBus.publish('github:file-loaded', {
              path: file.path,
              progress: progress.percentage
            });
          }
        } catch (error) {
          console.warn(`Failed to load ${file.path}:`, error.message);
          // Continue with other files
        }
      }));
      
      // Small delay between batches to be nice to the API
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    progress.fileCount = loadedFiles;
    return progress;
  }

  /**
   * Get rate limit status
   * @returns {Object}
   */
  getRateLimitStatus() {
    return {
      remaining: this.rateLimitRemaining,
      resetTime: this.rateLimitReset,
      resetDate: new Date(this.rateLimitReset)
    };
  }
}

// Default export
export default GitHubLoader;
