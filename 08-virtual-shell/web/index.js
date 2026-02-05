const worker = new Worker('./worker.js', { type: 'module' });

// State
let promptPath = "...";
let cmdHistory = [];
let historyIndex = -1;

// UI Elements
const outputDiv = document.getElementById('output');
const promptSpan = document.getElementById('prompt');
const input = document.getElementById('cmd-input');
const fsTree = document.getElementById('fs-tree');

// Initialize
worker.postMessage({ type: 'INIT' });

worker.onmessage = (e) => {
    const { type, payload } = e.data;
    
    switch (type) {
        case 'READY':
            promptPath = payload.pwd;
            updatePrompt();
            updateFsView(payload.fs);
            break;
            
        case 'TERMINAL_OUTPUT':
            renderCommandOutput(payload);
            break;
            
        case 'FS_UPDATE':
            updateFsView(payload);
            break;
            
        case 'PWD_UPDATE':
            promptPath = payload;
            updatePrompt();
            break;
    }
};

function updatePrompt() {
    promptSpan.innerText = `${promptPath} $`;
}

function renderCommandOutput({ cmd, stdout, stderr }) {
    // 1. Echo Command
    const cmdLine = document.createElement('div');
    cmdLine.className = 'command-line';
    cmdLine.innerText = `${promptSpan.innerText} ${cmd}`;
    outputDiv.appendChild(cmdLine);

    // 2. Render Output
    if (stderr) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'command-output error';
        errorDiv.innerText = stderr;
        outputDiv.appendChild(errorDiv);
    } else if (stdout) {
        const outDiv = document.createElement('div');
        outDiv.className = 'command-output';
        outDiv.innerText = stdout;
        outputDiv.appendChild(outDiv);
    }

    // Scroll
    const container = document.querySelector('.terminal-container');
    container.scrollTop = container.scrollHeight;
}

function updateFsView(fsRoot) {
    // fsRoot is VirtualFileSystem { root: ... }
    const formatted = formatNode(fsRoot.root, "");
    fsTree.innerText = formatted;
}

function formatNode(node, prefix) {
     if (node.Directory) {
        let output = "";
        const children = node.Directory.children;
        const keys = Object.keys(children).sort();
        
        keys.forEach((key, index) => {
            const child = children[key];
            const isLast = index === keys.length - 1;
            const marker = isLast ? "└── " : "├── ";
            const newPrefix = prefix + (isLast ? "    " : "│   ");
            
            let lineSuffix = "";
            if (child.File) {
                const s = child.File.status;
                if (s === 'new') lineSuffix = " (U)"; // Untracked
                if (s === 'modified') lineSuffix = " (M)";
            }
            
            output += `${prefix}${marker}${key}${lineSuffix}\n`;
            
            // Recurse
            output += formatNode(child, newPrefix);
        });
        return output;
    }
    return "";
}

// Event Listeners
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const cmd = input.value.trim();
        if (cmd) {
            worker.postMessage({ type: 'EXECUTE', payload: cmd });
            input.value = '';
        }
    }
});

document.querySelector('.terminal-container').addEventListener('click', () => {
    input.focus();
});
