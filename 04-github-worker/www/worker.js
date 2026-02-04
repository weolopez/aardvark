// worker.js - Web Worker for GitHub file operations
//
// Hybrid architecture:
// - Octokit (JavaScript) handles GitHub API authentication and requests
// - Rust/WASM handles path normalization, content encoding/decoding, validation
//
// This follows the same pattern as your fs.js but running in a Web Worker

import { Octokit } from "https://esm.sh/octokit";
import initWasm, {
    init,
    parse_config,
    validate_config,
    normalize_path,
    encode_content,
    decode_content,
    parse_file_response,
    validate_file,
    search_files,
    get_file_extension,
    is_likely_directory
} from './pkg/github_worker.js';

// ============================================================================
// State
// ============================================================================

let wasmReady = false;
let octokit = null;
let config = null;

// File cache (like your local IndexedDB cache)
const fileCache = new Map();

// ============================================================================
// Initialization
// ============================================================================

async function loadWasm() {
    try {
        await initWasm();
        init();
        wasmReady = true;
        
        self.postMessage({ type: 'ready' });
        console.log('[Worker] WASM module initialized');
    } catch (error) {
        console.error('[Worker] Failed to initialize WASM:', error);
        self.postMessage({ type: 'error', error: error.toString() });
    }
}

function initOctokit(auth) {
    octokit = new Octokit({ auth: auth || undefined });
    console.log('[Worker] Octokit initialized', auth ? 'with auth' : 'without auth');
}

// ============================================================================
// GitHub Operations (using Octokit)
// ============================================================================

async function getFile(path) {
    if (!config) throw new Error('Config not set');
    
    // Normalize path using Rust
    const normResult = JSON.parse(normalize_path(path, JSON.stringify(config)));
    if (!normResult.success) throw new Error(normResult.error);
    const normalizedPath = normResult.data;
    
    // Check cache first
    const cached = fileCache.get(normalizedPath);
    if (cached && cached.status === 'modified') {
        return cached; // Return modified local version
    }
    
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: config.owner,
            repo: config.repo,
            path: normalizedPath,
            ref: config.branch
        });
        
        if (Array.isArray(data)) {
            throw new Error(`Path ${normalizedPath} is a directory, not a file.`);
        }
        
        // Parse response using Rust (handles base64 decoding)
        const parseResult = JSON.parse(parse_file_response(JSON.stringify(data), 'synced'));
        if (!parseResult.success) throw new Error(parseResult.error);
        
        const file = parseResult.data;
        file.lastSynced = Date.now();
        
        // Update cache
        fileCache.set(normalizedPath, file);
        
        return file;
    } catch (err) {
        if (err.status === 404) {
            throw new Error(`File not found: ${normalizedPath}`);
        }
        throw err;
    }
}

async function getDirectory(path) {
    if (!config) throw new Error('Config not set');
    
    // Normalize path using Rust
    const normResult = JSON.parse(normalize_path(path || '', JSON.stringify(config)));
    if (!normResult.success) throw new Error(normResult.error);
    const normalizedPath = normResult.data;
    
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner: config.owner,
            repo: config.repo,
            path: normalizedPath,
            ref: config.branch
        });
        
        if (!Array.isArray(data)) {
            throw new Error(`Path ${normalizedPath} is a file, not a directory.`);
        }
        
        // Return directory listing
        return data.map(item => ({
            name: item.name,
            path: item.path,
            type: item.type,
            sha: item.sha,
            size: item.size
        }));
    } catch (err) {
        if (err.status === 404) {
            throw new Error(`Directory not found: ${normalizedPath}`);
        }
        throw err;
    }
}

async function setFile(path, content, sha = null) {
    if (!config) throw new Error('Config not set');
    
    // Normalize path using Rust
    const normResult = JSON.parse(normalize_path(path, JSON.stringify(config)));
    if (!normResult.success) throw new Error(normResult.error);
    const normalizedPath = normResult.data;
    
    const name = normalizedPath.split('/').pop();
    
    // Update local cache as modified
    const file = {
        path: normalizedPath,
        name,
        content,
        sha,
        status: 'modified',
        type: 'file'
    };
    
    // Validate using Rust
    const validateResult = JSON.parse(validate_file(JSON.stringify(file)));
    if (!validateResult.success) throw new Error(validateResult.error);
    
    fileCache.set(normalizedPath, file);
    
    return file;
}

async function saveFileToGithub(path, content, message = 'Update file via GitHub Worker') {
    if (!config) throw new Error('Config not set');
    if (!config.auth) throw new Error('Authentication required to save files');
    
    // Normalize path using Rust
    const normResult = JSON.parse(normalize_path(path, JSON.stringify(config)));
    if (!normResult.success) throw new Error(normResult.error);
    const normalizedPath = normResult.data;
    
    const name = normalizedPath.split('/').pop();
    
    // Get SHA from cache or remote
    let sha = null;
    const cached = fileCache.get(normalizedPath);
    if (cached && cached.sha) {
        sha = cached.sha;
    } else {
        // Check if file exists on remote
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner: config.owner,
                repo: config.repo,
                path: normalizedPath,
                ref: config.branch
            });
            if (!Array.isArray(data)) {
                sha = data.sha;
            }
        } catch (e) {
            if (e.status !== 404) {
                console.warn('[Worker] Error checking remote file:', e);
            }
            // 404 means new file, no SHA needed
        }
    }
    
    // Encode content using Rust
    const encodeResult = JSON.parse(encode_content(content));
    if (!encodeResult.success) throw new Error(encodeResult.error);
    const encodedContent = encodeResult.data;
    
    // Push to GitHub
    const result = await octokit.rest.repos.createOrUpdateFileContents({
        owner: config.owner,
        repo: config.repo,
        path: normalizedPath,
        message,
        content: encodedContent,
        sha: sha || undefined,
        branch: config.branch,
        committer: {
            name: config.owner,
            email: config.email
        }
    });
    
    // Update cache as synced
    const file = {
        path: normalizedPath,
        name,
        content,
        sha: result.data.content.sha,
        status: 'synced',
        type: 'file',
        lastSynced: Date.now()
    };
    fileCache.set(normalizedPath, file);
    
    return {
        file,
        commit: result.data.commit
    };
}

async function deleteFile(path, message = 'Delete file via GitHub Worker') {
    if (!config) throw new Error('Config not set');
    if (!config.auth) throw new Error('Authentication required to delete files');
    
    // Normalize path using Rust
    const normResult = JSON.parse(normalize_path(path, JSON.stringify(config)));
    if (!normResult.success) throw new Error(normResult.error);
    const normalizedPath = normResult.data;
    
    // Get SHA (required for deletion)
    let sha = null;
    const cached = fileCache.get(normalizedPath);
    if (cached && cached.sha) {
        sha = cached.sha;
    } else {
        const { data } = await octokit.rest.repos.getContent({
            owner: config.owner,
            repo: config.repo,
            path: normalizedPath,
            ref: config.branch
        });
        if (!Array.isArray(data)) {
            sha = data.sha;
        }
    }
    
    if (!sha) throw new Error('Cannot delete: file SHA not found');
    
    const result = await octokit.rest.repos.deleteFile({
        owner: config.owner,
        repo: config.repo,
        path: normalizedPath,
        message,
        sha,
        branch: config.branch,
        committer: {
            name: config.owner,
            email: config.email
        }
    });
    
    // Remove from cache
    fileCache.delete(normalizedPath);
    
    return { commit: result.data.commit };
}

async function searchCode(query) {
    if (!config) throw new Error('Config not set');
    
    // Search using GitHub API
    const { data } = await octokit.rest.search.code({
        q: `${query} repo:${config.owner}/${config.repo}`,
        per_page: 50
    });
    
    return data.items.map(item => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        url: item.html_url,
        repository: item.repository.full_name
    }));
}

function searchCachedFiles(query) {
    const files = Array.from(fileCache.values());
    const result = JSON.parse(search_files(JSON.stringify(files), query));
    return result.success ? result.data : [];
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async function(event) {
    const { id, type, payload } = event.data;
    
    const respond = (result) => {
        self.postMessage({ id, ...result });
    };
    
    console.log('[Worker] Received:', type);
    
    try {
        switch (type) {
            case 'set_config': {
                // Parse and validate config using Rust
                const parseResult = JSON.parse(parse_config(JSON.stringify(payload.config || {})));
                if (!parseResult.success) {
                    respond({ type: 'error', success: false, error: parseResult.error });
                    return;
                }
                
                config = parseResult.data;
                initOctokit(config.auth);
                
                respond({ 
                    type: 'config_set', 
                    success: true, 
                    data: config,
                    hasAuth: !!config.auth 
                });
                break;
            }
            
            case 'validate_config': {
                const result = JSON.parse(validate_config(JSON.stringify(payload.config)));
                respond({ type: 'config_validated', ...result });
                break;
            }
            
            case 'get_file': {
                const file = await getFile(payload.path);
                respond({ type: 'file', success: true, data: file });
                break;
            }
            
            case 'get_directory': {
                const items = await getDirectory(payload.path);
                respond({ type: 'directory', success: true, data: items });
                break;
            }
            
            case 'set_file': {
                const file = await setFile(payload.path, payload.content, payload.sha);
                respond({ type: 'file_set', success: true, data: file });
                break;
            }
            
            case 'save_file': {
                const result = await saveFileToGithub(payload.path, payload.content, payload.message);
                respond({ type: 'file_saved', success: true, data: result });
                break;
            }
            
            case 'delete_file': {
                const result = await deleteFile(payload.path, payload.message);
                respond({ type: 'file_deleted', success: true, data: result });
                break;
            }
            
            case 'search': {
                const results = await searchCode(payload.query);
                respond({ type: 'search_results', success: true, data: results });
                break;
            }
            
            case 'search_cached': {
                const results = searchCachedFiles(payload.query);
                respond({ type: 'search_results', success: true, data: results });
                break;
            }
            
            case 'get_cached_files': {
                const files = Array.from(fileCache.values());
                respond({ type: 'cached_files', success: true, data: files });
                break;
            }
            
            case 'clear_cache': {
                fileCache.clear();
                respond({ type: 'cache_cleared', success: true });
                break;
            }
            
            case 'normalize_path': {
                const result = JSON.parse(normalize_path(payload.path, JSON.stringify(config || {})));
                respond({ type: 'path_normalized', ...result });
                break;
            }
            
            case 'ping': {
                respond({ type: 'pong', ready: wasmReady, hasConfig: !!config });
                break;
            }
            
            default:
                respond({ type: 'error', success: false, error: `Unknown operation: ${type}` });
        }
    } catch (error) {
        console.error('[Worker] Operation error:', error);
        respond({ 
            type: 'error', 
            success: false, 
            error: error.message || error.toString(),
            errorCode: error.status ? `HTTP_${error.status}` : 'WORKER_ERROR'
        });
    }
};

// Start
loadWasm();
