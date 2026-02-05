import init, { CodingAgent } from './pkg/coding_agent.js';
import { Octokit } from "https://esm.sh/octokit";

let agent = null;
let octokit = null;
let repoConfig = null; // { owner, repo, branch, token }

// ============================================================================
// Callbacks from WASM
// ============================================================================

globalThis.emitAgentEvent = (eventJson) => {
    try {
        const event = JSON.parse(eventJson);
        postMessage({ type: 'agent_event', event });
    } catch (e) {
        postMessage({ type: 'agent_event', event: { type: 'error', content: eventJson } });
    }
};

globalThis.persistSessionEntry = (sessionId, entryJson) => {
    postMessage({
        type: 'persist_entry',
        sessionId,
        entryJson,
    });
};

// Called by Rust agent when LLM uses the commit tool — returns a Promise
globalThis.commitChangedFiles = async (message, filesJson) => {
    if (!repoConfig || !repoConfig.token) {
        throw new Error('GitHub token not configured. Please set a GitHub token with repo scope in the setup screen.');
    }

    const files = JSON.parse(filesJson);
    if (files.length === 0) {
        return JSON.stringify({ committed: [], errors: [], message: 'No files to commit' });
    }

    const { owner, repo, branch } = repoConfig;
    const results = await commitFilesToGitHub(files, message);

    // Build GitHub URLs for committed files
    const urls = results.committed.map(f =>
        `https://github.com/${owner}/${repo}/blob/${branch}/${f.path}`
    );

    const response = {
        committed: results.committed,
        errors: results.errors,
        urls,
        message: results.errors.length === 0
            ? `Successfully committed ${results.committed.length} file(s) to ${owner}/${repo}`
            : `Committed ${results.committed.length}, failed ${results.errors.length}`,
        github_urls: urls,
    };

    return JSON.stringify(response);
};

// ============================================================================
// IndexedDB Content Cache
// ============================================================================

const CACHE_DB_NAME = 'github-content-cache';
const CACHE_DB_VERSION = 1;
const CACHE_STORE = 'files';

function openCacheDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(CACHE_STORE)) {
                db.createObjectStore(CACHE_STORE); // keyed by "owner/repo/sha"
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getCachedContent(cacheKey) {
    try {
        const db = await openCacheDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CACHE_STORE, 'readonly');
            const store = tx.objectStore(CACHE_STORE);
            const req = store.get(cacheKey);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

async function setCachedContent(cacheKey, content) {
    try {
        const db = await openCacheDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CACHE_STORE, 'readwrite');
            const store = tx.objectStore(CACHE_STORE);
            store.put(content, cacheKey);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve(); // Don't fail on cache write errors
        });
    } catch {
        // Cache write failures are non-fatal
    }
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    try {
        switch (type) {
            case 'init': {
                await init();
                const { apiKey, model } = payload;
                agent = new CodingAgent(apiKey, model || 'gemini-2.0-flash');
                octokit = new Octokit();

                postMessage({
                    type: 'ready',
                    payload: {
                        pwd: agent.get_pwd(),
                    },
                });
                break;
            }

            case 'load_repo': {
                if (!agent) throw new Error('Agent not initialized');
                const { owner, repo, branch: branchName, token } = payload;
                
                // Store repo config for commits
                repoConfig = { owner, repo, branch: branchName || 'main', token };
                
                // If token provided, use authenticated Octokit
                if (token) {
                    octokit = new Octokit({ auth: token });
                }

                await loadGitHubRepo(owner, repo, branchName);

                postMessage({
                    type: 'repo_loaded',
                    payload: {
                        pwd: agent.get_pwd(),
                        fs: agent.get_fs_json(),
                    },
                });
                break;
            }

            case 'set_token': {
                const { token: ghToken } = payload;
                if (repoConfig) repoConfig.token = ghToken;
                octokit = new Octokit({ auth: ghToken });
                postMessage({ type: 'token_set' });
                break;
            }

            case 'get_changed_files': {
                if (!agent) throw new Error('Agent not initialized');
                const changedJson = agent.get_changed_files();
                postMessage({
                    type: 'changed_files',
                    payload: JSON.parse(changedJson),
                });
                break;
            }

            case 'commit_changes': {
                if (!agent) throw new Error('Agent not initialized');
                if (!repoConfig) throw new Error('No repo loaded');
                if (!repoConfig.token) throw new Error('GitHub token required for commits. Set it in settings.');

                const { message: commitMsg } = payload;
                const changedFiles = JSON.parse(agent.get_changed_files());

                if (changedFiles.length === 0) {
                    postMessage({ type: 'commit_result', payload: { success: true, message: 'No changes to commit' } });
                    break;
                }

                const results = await commitFilesToGitHub(changedFiles, commitMsg || 'Changes from browser coding agent');

                // Mark successfully committed files as synced
                for (const r of results.committed) {
                    try {
                        agent.mark_file_synced(r.path, r.sha || null);
                    } catch (e) {
                        console.warn('Failed to mark synced:', r.path, e);
                    }
                }

                postMessage({
                    type: 'commit_result',
                    payload: {
                        success: results.errors.length === 0,
                        committed: results.committed.length,
                        failed: results.errors.length,
                        message: results.errors.length === 0
                            ? `Committed ${results.committed.length} file(s)`
                            : `Committed ${results.committed.length}, failed ${results.errors.length}: ${results.errors[0]}`,
                    },
                });
                break;
            }

            case 'chat': {
                if (!agent) throw new Error('Agent not initialized');
                const resultJson = await agent.chat(payload.message);
                postMessage({
                    type: 'chat_done',
                    result: JSON.parse(resultJson),
                });
                break;
            }

            case 'get_fs': {
                if (!agent) throw new Error('Agent not initialized');
                postMessage({
                    type: 'fs_state',
                    payload: agent.get_fs_json(),
                });
                break;
            }

            case 'get_history': {
                if (!agent) throw new Error('Agent not initialized');
                const history = agent.get_history();
                postMessage({
                    type: 'history',
                    payload: history,
                });
                break;
            }

            case 'get_tree': {
                if (!agent) throw new Error('Agent not initialized');
                const tree = agent.get_tree();
                postMessage({
                    type: 'tree',
                    payload: tree,
                });
                break;
            }

            case 'branch': {
                if (!agent) throw new Error('Agent not initialized');
                agent.branch(payload.entryId);
                postMessage({
                    type: 'branched',
                    payload: {
                        leafId: agent.get_leaf_id(),
                    },
                });
                break;
            }

            case 'get_pwd': {
                if (!agent) throw new Error('Agent not initialized');
                postMessage({
                    type: 'pwd',
                    payload: agent.get_pwd(),
                });
                break;
            }

            case 'clear': {
                if (!agent) throw new Error('Agent not initialized');
                agent.clear_history();
                postMessage({ type: 'cleared' });
                break;
            }

            default:
                console.warn('Unknown message type:', type);
        }
    } catch (error) {
        console.error('Worker Error:', error);
        postMessage({
            type: 'error',
            error: error.message || String(error),
        });
    }
};

// ============================================================================
// GitHub Repo Loading — uses raw.githubusercontent.com + IndexedDB cache
// ============================================================================

const TEXT_EXTENSIONS = new Set([
    '.ts', '.js', '.mjs', '.cjs', '.jsx', '.tsx',
    '.rs', '.py', '.rb', '.go', '.java', '.c', '.h', '.cpp', '.hpp', '.cs',
    '.css', '.scss', '.less', '.html', '.htm', '.vue', '.svelte',
    '.json', '.toml', '.yaml', '.yml', '.ini', '.cfg',
    '.md', '.txt', '.rst', '.adoc',
    '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
    '.env', '.env.example', '.gitignore', '.gitattributes', '.editorconfig',
    '.dockerfile', '.dockerignore',
    '.xml', '.svg', '.sql', '.graphql', '.proto',
    '.lock', '.sum',
]);

function isTextFile(filename) {
    const dot = filename.lastIndexOf('.');
    if (dot === -1) {
        // Files without extensions that are commonly text
        const basename = filename.split('/').pop().toLowerCase();
        return ['makefile', 'readme', 'license', 'changelog', 'dockerfile', 'procfile', 'gemfile', 'rakefile'].includes(basename);
    }
    return TEXT_EXTENSIONS.has(filename.substring(dot).toLowerCase());
}

async function loadGitHubRepo(owner, repo, requestedBranch) {
    let branch = requestedBranch || 'main';

    // Detect default branch (one API call)
    if (!requestedBranch) {
        try {
            await octokit.request(`GET /repos/${owner}/${repo}/git/trees/${branch}`);
        } catch (e) {
            branch = 'master';
        }
    }

    postMessage({ type: 'agent_event', event: { type: 'text', content: `Loading tree for ${owner}/${repo}@${branch}...` } });

    // Fetch recursive tree (one API call — gives us all file paths + SHAs)
    const { data } = await octokit.request(
        'GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1',
        { owner, repo, branch }
    );

    // Convert to VirtualFile format — initially with placeholder content
    const files = data.tree
        .filter(item => item.type === 'blob')
        .map(item => ({
            path: item.path,
            name: item.path.split('/').pop(),
            content: `// [content not yet loaded — sha: ${item.sha}]`,
            sha: item.sha || null,
            status: 'synced',
        }));

    // Identify text files to fetch content for
    const textFiles = files.filter(f => isTextFile(f.path));

    postMessage({
        type: 'agent_event',
        event: {
            type: 'text',
            content: `Found ${files.length} files (${textFiles.length} text files). Fetching content via raw.githubusercontent.com...`
        }
    });

    // Fetch content using raw.githubusercontent.com (NO API rate limit!)
    // Process in batches of 10 concurrent fetches
    const BATCH_SIZE = 10;
    let fetched = 0;
    let cached = 0;

    for (let i = 0; i < textFiles.length; i += BATCH_SIZE) {
        const batch = textFiles.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (file) => {
            try {
                const cacheKey = `${owner}/${repo}/${file.sha}`;

                // Check cache first (keyed by SHA — content-addressable, never stale)
                const cachedContent = await getCachedContent(cacheKey);
                if (cachedContent !== null) {
                    file.content = cachedContent;
                    cached++;
                    fetched++;
                    return;
                }

                // Fetch from raw.githubusercontent.com — no API rate limit
                const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
                const response = await fetch(rawUrl);

                if (response.ok) {
                    const text = await response.text();

                    // Skip binary-looking content (null bytes, very long lines)
                    if (text.includes('\0') || (text.length > 0 && text.length > 500000)) {
                        file.content = `// [binary or very large file — ${text.length} bytes]`;
                    } else {
                        file.content = text;

                        // Cache by SHA (immutable — same SHA always means same content)
                        await setCachedContent(cacheKey, text);
                    }
                }

                fetched++;
            } catch (e) {
                // Keep placeholder content on failure
                fetched++;
            }
        }));

        // Progress update every batch
        if (textFiles.length > BATCH_SIZE) {
            postMessage({
                type: 'agent_event',
                event: {
                    type: 'text',
                    content: `Fetched ${fetched}/${textFiles.length} files (${cached} from cache)...`
                }
            });
        }
    }

    console.log(`Loaded ${files.length} files from ${owner}/${repo} (${fetched} fetched, ${cached} from cache)`);

    // Load into Shell's virtual filesystem
    agent.load_files(JSON.stringify(files));
}

// ============================================================================
// GitHub Commit — uses Octokit Contents API (requires auth token)
// ============================================================================

async function commitFilesToGitHub(changedFiles, commitMessage) {
    const { owner, repo, branch, token } = repoConfig;
    const committed = [];
    const errors = [];

    // Use authenticated Octokit
    const authOctokit = new Octokit({ auth: token });

    for (const file of changedFiles) {
        try {
            // Get current file SHA if it exists (needed for updates)
            let existingSha = file.sha || null;

            // If no SHA (new file) or file was synced from placeholder, try to get current SHA
            if (!existingSha || file.status === 'modified') {
                try {
                    const { data } = await authOctokit.request(
                        'GET /repos/{owner}/{repo}/contents/{path}',
                        { owner, repo, path: file.path, ref: branch }
                    );
                    existingSha = data.sha;
                } catch (e) {
                    // File doesn't exist on GitHub yet — that's fine for new files
                    existingSha = null;
                }
            }

            // Commit via Contents API (creates or updates)
            const params = {
                owner,
                repo,
                path: file.path,
                message: `${commitMessage}\n\nFile: ${file.path}`,
                content: btoa(unescape(encodeURIComponent(file.content))), // UTF-8 safe base64
                branch,
            };

            if (existingSha) {
                params.sha = existingSha;
            }

            const { data: result } = await authOctokit.request(
                'PUT /repos/{owner}/{repo}/contents/{path}',
                params
            );

            committed.push({
                path: file.path,
                sha: result.content?.sha || null,
            });

            console.log(`Committed: ${file.path}`);
        } catch (e) {
            console.error(`Failed to commit ${file.path}:`, e);
            errors.push(`${file.path}: ${e.message}`);
        }
    }

    return { committed, errors };
}
