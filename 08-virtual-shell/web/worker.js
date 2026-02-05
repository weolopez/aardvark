import init, { Shell } from './pkg/virtual_shell.js';
import { Octokit } from "https://esm.sh/octokit";

let shell = null;
let octokit = null;
let initPromise = null;

async function initialize() {
    if (shell) return; // Already initialized
    if (initPromise) return initPromise; // Initialization in progress

    initPromise = (async () => {
        await init();
        shell = new Shell();
        octokit = new Octokit();
        
        // Load GitHub Repo
        try {
            await loadGitHubRepo("weolopez", "aardvark");
            
            // Navigate to root to show repo contents
            shell.execute("cd /");
            
            postMessage({
                type: 'TERMINAL_OUTPUT',
                payload: {
                    cmd: 'init',
                    stdout: 'GitHub repository weolopez/aardvark loaded.\nChanged directory to root (/)',
                    stderr: ''
                }
            });
        } catch (e) {
            console.error("Failed to init GitHub repo:", e);
            postMessage({
                type: 'TERMINAL_OUTPUT',
                payload: {
                    cmd: 'init',
                    stdout: '',
                    stderr: `Failed to load GitHub repo: ${e.message}`
                }
            });
        }

        // Send initial state
        postMessage({
            type: 'READY',
            payload: {
                pwd: getPwd(),
                fs: getFs()
            }
        });
    })();
    
    return initPromise;
}

async function loadGitHubRepo(owner, repo) {
    console.log(`Fetching tree for ${owner}/${repo}...`);
    
    // 1. Get default branch SHA (optimistic)
    // For simplicity, we'll try 'main', then 'master' if that fails, or just fetch repo info
    let branch = 'main';
    try {
        await octokit.request(`GET /repos/${owner}/${repo}/git/trees/${branch}`);
    } catch (e) {
        branch = 'master';
    }

    // 2. Fetch recursive tree
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1', {
        owner,
        repo,
        branch
    });

    // 3. Convert to VirtualFile format
    // We only take blobs (files). Directories are implied by paths in our Rust fs implementation.
    const files = data.tree
        .filter(item => item.type === 'blob')
        .map(item => ({
            path: item.path,
            name: item.path.split('/').pop(),
            // We don't fetch content to avoid rate limits/bandwidth. 
            // A full implementation would fetch on demand or fetch small files.
            content: `(Content from GitHub: ${item.sha})`, 
            sha: item.sha || null,
            status: "synced"
        }));

    console.log(`Loaded ${files.length} files from GitHub. First file:`, files[0]);
    
    // 4. Load into Shell
    // Breaking into chunks to avoid potential stack/memory issues with large JSONs if that's the cause
    // although 500 files should be fine.
    try {
        const resultJson = shell.load_files(JSON.stringify(files));
        const result = JSON.parse(resultJson);
        if (result.stderr) {
            console.error("Shell load_files error:", result.stderr);
            throw new Error(result.stderr);
        }
    } catch (err) {
        // If "recursive use" happens here, it's very strange.
        console.error("Critical error loading files into shell:", err);
        throw err;
    }
}

function getPwd() {
    if (!shell) return "/";
    const resultJson = shell.execute("pwd");
    const result = JSON.parse(resultJson);
    return result.stdout;
}

function getFs() {
    if (!shell) return {};
    return JSON.parse(shell.get_fs_json());
}

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    // Handle INIT specially
    if (type === 'INIT') {
        await initialize();
        return;
    }

    // For other messages, ensure init
    if (!shell) {
        await initialize();
    }

    switch (type) {
        case 'EXECUTE':
            const cmd = payload;
            const resultJson = shell.execute(cmd);
            const result = JSON.parse(resultJson);
            
            // Post result back
            postMessage({
                type: 'TERMINAL_OUTPUT',
                payload: {
                    cmd,
                    stdout: result.stdout,
                    stderr: result.stderr
                }
            });

            // If FS changed, send update
            if (result.fs_changed) {
                postMessage({
                    type: 'FS_UPDATE',
                    payload: getFs()
                });
            }
            
            // Always update PWD (cd might have changed it without 'fs_changed')
            postMessage({
                type: 'PWD_UPDATE',
                payload: getPwd()
            });
            break;
            
        case 'GET_FS':
             postMessage({
                type: 'FS_UPDATE',
                payload: getFs()
            });
            break;
    }
};

// Remove auto-init at bottom to prevent race with INIT message
// initialize(); 

