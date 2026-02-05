import { AgentClient } from './agent-client.js';

let client = null;

// ============================================================================
// DOM References
// ============================================================================

const setupDiv = document.getElementById('setup');
const appDiv = document.getElementById('app');
const apiKeyInput = document.getElementById('apiKey');
const repoInput = document.getElementById('repoInput');
const connectBtn = document.getElementById('connectBtn');
const setupError = document.getElementById('setupError');
const ghTokenInput = document.getElementById('ghToken');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const commitBtn = document.getElementById('commitBtn');
const changedCountEl = document.getElementById('changedCount');
const refreshFs = document.getElementById('refreshFs');
const fileTree = document.getElementById('fileTree');
const pwdDisplay = document.getElementById('pwdDisplay');
const fileCountDisplay = document.getElementById('fileCount');
const repoLabel = document.getElementById('repoLabel');

let hasGhToken = false;

// ============================================================================
// Setup
// ============================================================================

// Restore saved API key
const savedKey = localStorage.getItem('GEMINI_API_KEY');
if (savedKey) apiKeyInput.value = savedKey;

const savedRepo = localStorage.getItem('GITHUB_REPO');
if (savedRepo) repoInput.value = savedRepo;

const savedToken = localStorage.getItem('GITHUB_TOKEN');
if (savedToken) ghTokenInput.value = savedToken;

connectBtn.onclick = async () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        setupError.textContent = 'API Key is required';
        return;
    }

    localStorage.setItem('GEMINI_API_KEY', apiKey);

    const repoStr = repoInput.value.trim();
    if (repoStr) localStorage.setItem('GITHUB_REPO', repoStr);

    const ghToken = ghTokenInput.value.trim();
    if (ghToken) {
        localStorage.setItem('GITHUB_TOKEN', ghToken);
        hasGhToken = true;
    }

    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    setupError.textContent = '';

    try {
        client = new AgentClient();

        // Wire up event handler
        client.onEvent = handleAgentEvent;
        client.onError = (err) => appendMessage('error', err);

        await client.init(apiKey);

        // Load repo if specified
        if (repoStr) {
            const [owner, repo] = repoStr.split('/');
            if (owner && repo) {
                connectBtn.textContent = 'Loading repo...';
                repoLabel.textContent = `${owner}/${repo}`;
                try {
                    const result = await client.loadRepo(owner, repo, 'fs', ghToken || null);
                    renderFileTree(result.fs);
                } catch (e) {
                    appendMessage('error', `Failed to load repo: ${e.message}`);
                }
            }
        }

        // Show commit button if we have a token and repo
        if (hasGhToken && repoStr) {
            commitBtn.style.display = '';
            changedCountEl.style.display = '';
        }

        // Switch to app view
        setupDiv.classList.add('hidden');
        appDiv.classList.remove('hidden');

        // Focus input
        messageInput.focus();
        refreshFileTree();
    } catch (e) {
        setupError.textContent = `Failed to connect: ${e.message}`;
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect Agent';
    }
};

// ============================================================================
// Chat
// ============================================================================

let isProcessing = false;

sendBtn.onclick = sendMessage;
messageInput.onkeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
};

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || isProcessing) return;

    messageInput.value = '';
    appendMessage('user', text);

    isProcessing = true;
    sendBtn.disabled = true;
    appendThinking();

    try {
        await client.chat(text);
    } catch (e) {
        appendMessage('error', `Error: ${e.message}`);
    } finally {
        removeThinking();
        isProcessing = false;
        sendBtn.disabled = false;
        messageInput.focus();
        refreshFileTree();
        updateChangedCount();
    }
}

clearBtn.onclick = async () => {
    if (!client) return;
    await client.clear();
    chatMessages.innerHTML = '';
    appendMessage('assistant', 'Session cleared. How can I help you?');
};

commitBtn.onclick = async () => {
    if (!client) return;
    const commitMsg = prompt('Commit message:', 'Changes from browser coding agent');
    if (!commitMsg) return;

    commitBtn.disabled = true;
    commitBtn.textContent = '⬆ Committing...';
    appendMessage('tool-call', `⬆ Committing changes to GitHub...\nMessage: ${commitMsg}`);

    try {
        const result = await client.commitChanges(commitMsg);
        if (result.success) {
            appendMessage('tool-result', `✅ ${result.message}`);
        } else {
            appendMessage('tool-result error', `⚠️ ${result.message}`);
        }
        updateChangedCount();
        refreshFileTree();
    } catch (e) {
        appendMessage('error', `Commit failed: ${e.message}`);
    } finally {
        commitBtn.disabled = false;
        commitBtn.textContent = '⬆ Commit';
    }
};

async function updateChangedCount() {
    if (!client || !hasGhToken) return;
    try {
        const changed = await client.getChangedFiles();
        const count = Array.isArray(changed) ? changed.length : 0;
        changedCountEl.textContent = `${count} changed`;
        changedCountEl.style.display = count > 0 ? '' : 'none';
    } catch (e) {
        // ignore
    }
}

// ============================================================================
// Agent Event Handler
// ============================================================================

function handleAgentEvent(event) {
    switch (event.type) {
        case 'text':
            removeThinking();
            appendMessage('assistant', event.content || '(empty response)');
            break;

        case 'tool_call':
            removeThinking();
            if (event.tool_calls) {
                for (const call of event.tool_calls) {
                    const argsStr = JSON.stringify(call.args, null, 2);
                    appendMessage('tool-call', `🔧 ${call.name}\n${argsStr}`);
                }
            }
            appendThinking();
            break;

        case 'tool_result':
            removeThinking();
            const isError = event.tool_error;
            const cls = isError ? 'tool-result error' : 'tool-result';
            const prefix = isError ? '❌' : '✅';
            appendMessage(cls, `${prefix} ${event.tool_name}\n${event.tool_result || ''}`);
            appendThinking();
            break;

        case 'tool_exec_start':
            // Could show a spinner for the specific tool
            break;

        case 'error':
            removeThinking();
            appendMessage('error', event.content || 'Unknown error');
            break;
    }
}

// ============================================================================
// Message Rendering
// ============================================================================

function appendMessage(type, content) {
    const div = document.createElement('div');
    div.className = `message ${type}`;

    // Add label for tool messages
    if (type === 'tool-call') {
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Tool Call';
        div.appendChild(label);
    } else if (type.startsWith('tool-result')) {
        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = 'Tool Result';
        div.appendChild(label);
    }

    const text = document.createElement('div');
    text.textContent = content;
    div.appendChild(text);

    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendThinking() {
    removeThinking();
    const div = document.createElement('div');
    div.className = 'thinking';
    div.id = 'thinking-indicator';
    div.textContent = '● ● ● Thinking...';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeThinking() {
    const el = document.getElementById('thinking-indicator');
    if (el) el.remove();
}

// ============================================================================
// File Explorer
// ============================================================================

async function refreshFileTree() {
    if (!client) return;
    try {
        const fsJson = await client.getFs();
        renderFileTree(fsJson);
    } catch (e) {
        console.warn('Failed to refresh file tree:', e);
    }
}

refreshFs.onclick = refreshFileTree;

function renderFileTree(fsJsonStr) {
    fileTree.innerHTML = '';
    let fs;
    try {
        fs = typeof fsJsonStr === 'string' ? JSON.parse(fsJsonStr) : fsJsonStr;
    } catch (e) {
        fileTree.textContent = 'Failed to parse filesystem';
        return;
    }

    let fileCount = 0;

    function renderNode(node, name, depth) {
        if (node.File) {
            fileCount++;
            const div = document.createElement('div');
            div.className = 'node file';
            div.style.paddingLeft = `${depth * 16 + 8}px`;
            div.innerHTML = `<span class="icon">📄</span> ${name}`;
            fileTree.appendChild(div);
        } else if (node.Directory) {
            const div = document.createElement('div');
            div.className = 'node dir';
            div.style.paddingLeft = `${depth * 16 + 8}px`;
            div.innerHTML = `<span class="icon">📁</span> ${name}/`;
            fileTree.appendChild(div);

            const children = node.Directory.children;
            const sorted = Object.keys(children).sort((a, b) => {
                const aIsDir = !!children[a].Directory;
                const bIsDir = !!children[b].Directory;
                if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
                return a.localeCompare(b);
            });

            for (const childName of sorted) {
                renderNode(children[childName], childName, depth + 1);
            }
        }
    }

    if (fs.root) {
        const children = fs.root.Directory?.children || {};
        const sorted = Object.keys(children).sort();
        for (const name of sorted) {
            renderNode(children[name], name, 0);
        }
    }

    fileCountDisplay.textContent = `${fileCount} files`;
}

// ============================================================================
// Auto-connect on load
// ============================================================================

async function autoConnect() {
    const apiKey = localStorage.getItem('GEMINI_API_KEY');
    if (!apiKey) {
        // No API key, show setup
        setupDiv.classList.remove('hidden');
        return;
    }

    // We have an API key, try to connect automatically
    setupDiv.classList.add('hidden'); // Hide setup while connecting
    appDiv.classList.remove('hidden'); // Show app temporarily for loading state

    try {
        client = new AgentClient();
        client.onEvent = handleAgentEvent;
        client.onError = (err) => appendMessage('error', err);

        await client.init(apiKey);

        // Load repo if saved
        const savedRepo = localStorage.getItem('GITHUB_REPO');
        if (savedRepo) {
            const [owner, repo] = savedRepo.split('/');
            if (owner && repo) {
                repoLabel.textContent = `${owner}/${repo}`;
                try {
                    const result = await client.loadRepo(owner, repo, 'fs', localStorage.getItem('GITHUB_TOKEN') || null);
                    renderFileTree(result.fs);
                } catch (e) {
                    appendMessage('error', `Failed to load repo: ${e.message}`);
                }
            }
        }

        // Check for GitHub token
        const savedToken = localStorage.getItem('GITHUB_TOKEN');
        if (savedToken) {
            hasGhToken = true;
            if (savedRepo) {
                commitBtn.style.display = '';
                changedCountEl.style.display = '';
            }
        }

        // Successfully connected, show app
        setupDiv.classList.add('hidden');
        appDiv.classList.remove('hidden');
        messageInput.focus();
        refreshFileTree();

    } catch (e) {
        // Connection failed, show setup with error
        setupDiv.classList.remove('hidden');
        appDiv.classList.add('hidden');
        setupError.textContent = `Auto-connect failed: ${e.message}`;
        console.error('Auto-connect failed:', e);
    }
}

// Initialize on load
autoConnect();
