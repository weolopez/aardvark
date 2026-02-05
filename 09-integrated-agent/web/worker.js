import init, { CodingAgent } from './pkg/coding_agent.js';
import { Octokit } from "https://esm.sh/octokit";

let agent = null;
let octokit = null;

// ============================================================================
// Callbacks from WASM
// ============================================================================

// Called by Rust agent to emit events to the main thread
globalThis.emitAgentEvent = (eventJson) => {
    try {
        const event = JSON.parse(eventJson);
        postMessage({ type: 'agent_event', event });
    } catch (e) {
        postMessage({ type: 'agent_event', event: { type: 'error', content: eventJson } });
    }
};

// Called by Rust agent to persist session entries
globalThis.persistSessionEntry = (sessionId, entryJson) => {
    postMessage({
        type: 'persist_entry',
        sessionId,
        entryJson,
    });
};

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
                const { owner, repo, branch: branchName } = payload;
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
// GitHub Repo Loading
// ============================================================================

async function loadGitHubRepo(owner, repo, requestedBranch) {
    let branch = requestedBranch || 'main';

    // Detect default branch
    if (!requestedBranch) {
        try {
            await octokit.request(`GET /repos/${owner}/${repo}/git/trees/${branch}`);
        } catch (e) {
            branch = 'master';
        }
    }

    // Fetch recursive tree
    const { data } = await octokit.request(
        'GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1',
        { owner, repo, branch }
    );

    // Convert to VirtualFile format
    const files = data.tree
        .filter(item => item.type === 'blob')
        .map(item => ({
            path: item.path,
            name: item.path.split('/').pop(),
            content: `// Content placeholder (sha: ${item.sha})`,
            sha: item.sha || null,
            status: 'synced',
        }));

    // For small repos, fetch actual content of text files
    const TEXT_EXTENSIONS = [
        '.ts', '.js', '.rs', '.py', '.rb', '.go', '.java', '.c', '.h', '.cpp',
        '.hpp', '.css', '.html', '.json', '.toml', '.yaml', '.yml', '.md',
        '.txt', '.sh', '.bash', '.zsh', '.fish', '.env', '.gitignore',
        '.dockerfile', '.xml', '.svg', '.sql', '.graphql', '.proto',
    ];

    const smallTextFiles = files.filter(f => {
        const ext = '.' + f.name.split('.').pop()?.toLowerCase();
        return TEXT_EXTENSIONS.includes(ext);
    });

    // Fetch content for up to 50 small files to stay under rate limits
    const filesToFetch = smallTextFiles.slice(0, 50);
    for (const file of filesToFetch) {
        try {
            const { data: fileData } = await octokit.request(
                'GET /repos/{owner}/{repo}/contents/{path}',
                { owner, repo, path: file.path, ref: branch }
            );
            if (fileData.content && fileData.encoding === 'base64') {
                file.content = atob(fileData.content);
            }
        } catch (e) {
            // Keep placeholder content
        }
    }

    // Load into Shell's virtual filesystem
    agent.load_files(JSON.stringify(files));

    console.log(`Loaded ${files.length} files from ${owner}/${repo} (${filesToFetch.length} with content)`);
}
