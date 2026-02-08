/**
 * OPFSProvider - Wrapper around Origin Private File System API
 * @module components/core/opfs-provider
 */

export class OPFSProvider {
  constructor() {
    this.root = null;
  }

  /**
   * Initialize and get root directory
   * @returns {Promise<void>}
   */
  async initialize() {
    this.root = await navigator.storage.getDirectory();
  }

  /**
   * Read a file from OPFS
   * @param {string} path - File path
   * @returns {Promise<string>} File content
   */
  async readFile(path) {
    const parts = path.split('/').filter(p => p);
    
    let dir = this.root;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    return await file.text();
  }

  /**
   * Write a file to OPFS
   * @param {string} path - File path
   * @param {string} content - File content
   * @returns {Promise<void>}
   */
  async writeFile(path, content) {
    const parts = path.split('/').filter(p => p);
    
    let dir = this.root;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    
    const fileHandle = await dir.getFileHandle(parts[parts.length - 1], { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  /**
   * Read directory contents
   * @param {string} path - Directory path
   * @returns {Promise<Array>} Directory entries
   */
  async readDir(path = '') {
    const parts = path.split('/').filter(p => p);
    
    let dir = this.root;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part);
    }
    
    const entries = [];
    for await (const [name, handle] of dir.entries()) {
      entries.push({
        name,
        path: path ? `${path}/${name}` : name,
        type: handle.kind,
        handle
      });
    }
    return entries;
  }

  /**
   * Check if path exists
   * @param {string} path - Path to check
   * @returns {Promise<boolean>}
   */
  async exists(path) {
    try {
      await this.readFile(path);
      return true;
    } catch {
      try {
        await this.readDir(path);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Delete a file or directory
   * @param {string} path - Path to delete
   * @param {Object} options - Delete options
   * @param {boolean} options.recursive - Recursively delete directories
   * @returns {Promise<void>}
   */
  async delete(path, { recursive = false } = {}) {
    const parts = path.split('/').filter(p => p);
    
    let dir = this.root;
    for (const part of parts.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(part);
    }
    
    await dir.removeEntry(parts[parts.length - 1], { recursive });
  }

  /**
   * Delete a directory and all its contents
   * @param {string} path - Directory path to delete
   * @returns {Promise<void>}
   */
  async deleteDir(path) {
    await this.delete(path, { recursive: true });
  }

  /**
   * Delete a file
   * @param {string} path - File path to delete
   * @returns {Promise<void>}
   */
  async deleteFile(path) {
    await this.delete(path, { recursive: false });
  }

  /**
   * Walk directory tree
   * @param {string} path - Starting path
   * @param {Function} callback - Callback for each entry
   * @returns {Promise<void>}
   */
  async walkDir(path = '', callback) {
    const entries = await this.readDir(path);
    
    for (const entry of entries) {
      await callback(entry);
      
      if (entry.type === 'directory') {
        await this.walkDir(entry.path, callback);
      }
    }
  }

  /**
   * Create a directory
   * @param {string} path - Directory path
   * @returns {Promise<void>}
   */
  async createDir(path) {
    const parts = path.split('/').filter(p => p);
    
    let dir = this.root;
    for (const part of parts) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
  }
}

export const opfs = new OPFSProvider();
export default OPFSProvider;
