import init, { Shell } from './pkg/virtual_shell.js';

let shell;

async function run() {
    await init();
    shell = new Shell();
    
    updatePrompt();
    updateInspector();

    const input = document.getElementById('cmd-input');
    
    // Focus input on click anywhere
    document.querySelector('.terminal-container').addEventListener('click', () => {
        input.focus();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmd = input.value;
            execute(cmd);
            input.value = '';
        }
    });
}

function execute(cmd) {
    if (!cmd.trim()) return;

    // 1. Render command
    const outputDiv = document.getElementById('output');
    const promptText = document.getElementById('prompt').innerText;
    
    const cmdLine = document.createElement('div');
    cmdLine.className = 'command-line';
    cmdLine.innerText = `${promptText} ${cmd}`;
    outputDiv.appendChild(cmdLine);

    // 2. Run in WASM
    // Clear console to debug WASM output
    console.log(`Executing: ${cmd}`);
    
    const result = shell.execute(cmd);
    
    // 3. Render output
    if (result) {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'command-output';
        // Check if it looks like an error for styling
        if (result.startsWith && (result.startsWith("error:") || result.includes(": command not found"))) {
            resultDiv.classList.add("error");
        }
        resultDiv.innerText = result;
        outputDiv.appendChild(resultDiv);
    }

    // 4. Update UI state
    updatePrompt();
    updateInspector();
    
    // Scroll to bottom
    const container = document.querySelector('.terminal-container');
    container.scrollTop = container.scrollHeight;
}

function updatePrompt() {
    // We haven't exposed get_pwd directly efficiently (execute("pwd") returns string).
    // But we implemented get_pwd in Rust, let's just use execute("pwd") internally 
    // or we can add a specific getter if we want to be cleaner.
    // Since execute("pwd") returns the path string, we can use that.
    const pwd = shell.execute("pwd");
    document.getElementById('prompt').innerText = `${pwd} $`;
}

function updateInspector() {
    const json = shell.get_fs_json();
    const fsObj = JSON.parse(json);
    const formatted = formatTree(fsObj.root, "");
    document.getElementById('fs-tree').innerText = formatted;
}

function formatTree(node, prefix) {
    if (!node) return "";
    
    // The JSON structure is { "File": { "content": ... } } or { "Directory": { "children": ... } }
    // Rust serde tagging might vary. Let's inspect the JSON format first by logging.
    // Based on default enum serialization: {"Directory": {"children": {...}}}
    
    if (node.Directory) {
        let output = "";
        const children = node.Directory.children;
        const keys = Object.keys(children).sort();
        
        keys.forEach((key, index) => {
            const isLast = index === keys.length - 1;
            const marker = isLast ? "└── " : "├── ";
            const newPrefix = prefix + (isLast ? "    " : "│   ");
            
            output += `${prefix}${marker}${key}/\n`;
            output += formatTree(children[key], newPrefix);
        });
        return output;
    } else if (node.File) {
        // Just show file exists, maybe size?
        return ""; // Files are leaf nodes, handled by parent iteration usually, 
                   // but here the parent call prints the name. 
                   // If we wanted to show content preview, we could do it here.
    }
    return "";
}

run();
