import init, { SessionTree } from './pkg/session_tree.js';

let tree;

async function run() {
    await init();
    
    // Initialize session
    tree = new SessionTree("/home/user/project");
    
    // Seed some initial data for demo purposes
    seedData();

    // Initial Render
    updateUI();

    // Event Listeners
    document.getElementById('send-btn').addEventListener('click', handleSendMessage);
    document.getElementById('reset-btn').addEventListener('click', handleReset);
    
    // Cmd+Enter to send
    document.getElementById('message-input').addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            handleSendMessage();
        }
    });
}

function seedData() {
    const m1 = tree.append_message("user", "Let's build a React app.");
    const m2 = tree.append_message("assistant", "Sure! I can help with that. What kind of app?");
    
    // Branch 1
    const m3 = tree.append_message("user", "A todo list.");
    tree.append_message("assistant", "Classic choice. Here is the structure...");
    
    // Branch 2 (Time travel back to m2)
    tree.branch(m2);
    const m3_alt = tree.append_message("user", "Actually, a 3D game.");
    tree.append_message("assistant", "Ooh, ambitious! We should use Three.js.");
    
    // Set leaf back to the todo list for initial view
    // (We need to traverse to find the ID, but for now we just let it stay at the last added one)
}

function handleSendMessage() {
    const roleSelect = document.getElementById('role-select');
    const input = document.getElementById('message-input');
    const content = input.value.trim();

    if (!content) return;

    tree.append_message(roleSelect.value, content);
    input.value = '';
    
    updateUI();
}

function handleReset() {
    tree = new SessionTree("/home/user/project");
    updateUI();
}

function updateUI() {
    renderStats();
    renderChatHistory();
    renderTreeViz();
}

function renderStats() {
    const rawTree = tree.get_tree(); // Returns Map<String, SessionEntry>
    const leafId = tree.get_leaf_id();
    
    document.getElementById('node-count').innerText = rawTree.size;
    document.getElementById('leaf-id').innerText = leafId.substring(0, 8);
}

function renderChatHistory() {
    const history = tree.get_history();
    const container = document.getElementById('chat-history');
    container.innerHTML = '';

    history.forEach(entry => {
        if (entry.type === 'session') {
            const div = document.createElement('div');
            div.className = 'message-card system';
            div.innerHTML = `<div class="message-meta">Session Start: ${entry.id.substring(0,8)}</div>`;
            container.appendChild(div);
        } else if (entry.type === 'message') {
            const div = document.createElement('div');
            div.className = `message-card ${entry.role}`;
            // Add click listener to jump to this node
            div.onclick = () => {
                console.log("Jumping to", entry.id);
                tree.branch(entry.id);
                updateUI();
            };

            div.innerHTML = `
                <div class="message-meta">
                    <span>${entry.role.toUpperCase()}</span>
                    <span>${entry.id.substring(0, 8)}</span>
                </div>
                <div class="message-content">${entry.content}</div>
            `;
            container.appendChild(div);
        }
    });

    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
}

// --- D3 Visualization ---

function renderTreeViz() {
    const container = document.getElementById('viz-container');
    container.innerHTML = ''; // Clear previous

    const width = container.clientWidth;
    const height = container.clientHeight || 600;
    const margin = { top: 20, right: 90, bottom: 30, left: 90 };

    // 1. Convert Flat Map to Hierarchy
    const rawMap = tree.get_tree(); // JS Map
    const rootId = tree.get_root_id();
    const leafId = tree.get_leaf_id();

    // Build adjacency list
    const nodes = [];
    const idToNode = {};

    // First pass: create node objects
    for (const [key, value] of rawMap.entries()) {
        const node = {
            id: key,
            data: value,
            children: []
        };
        nodes.push(node);
        idToNode[key] = node;
    }

    // Second pass: link children
    nodes.forEach(node => {
        let parentId = null;
        if (node.data.type === 'message') {
            parentId = node.data.parent_id;
        } else if (node.data.type === 'session') {
            parentId = node.data.parent_session;
        }

        if (parentId && idToNode[parentId]) {
            idToNode[parentId].children.push(node);
        }
    });

    const rootNode = idToNode[rootId];
    if (!rootNode) return; // Should not happen

    // 2. D3 Layout
    const hierarchy = d3.hierarchy(rootNode);
    const treeLayout = d3.tree().size([height - margin.top - margin.bottom, width - margin.left - margin.right]);
    
    const root = treeLayout(hierarchy);

    const svg = d3.select("#viz-container").append("svg")
        .attr("width", width)
        .attr("height", height)
        .call(d3.zoom().on("zoom", (event) => {
            g.attr("transform", event.transform);
        }))
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const g = svg.append("g");

    // 3. Mark the Active Path (Leaf -> Root)
    const activePathIds = new Set();
    let curr = leafId;
    while(curr) {
        activePathIds.add(curr);
        const node = idToNode[curr];
        if (node.data.type === 'message') curr = node.data.parent_id;
        else if (node.data.type === 'session') curr = node.data.parent_session; // or stop
        else curr = null;
        
        // Safety break for cycles (though it's a DAG)
        if (curr === rootId) {
            activePathIds.add(rootId);
            break; 
        }
    }
    
    // Draw Links
    g.selectAll(".link")
        .data(root.links())
        .enter().append("path")
        .attr("class", d => {
            // Check if link target is in active path
            return activePathIds.has(d.target.data.id) ? "link active-path" : "link";
        })
        .attr("d", d3.linkHorizontal()
            .x(d => d.y)
            .y(d => d.x));

    // Draw Nodes
    const node = g.selectAll(".node")
        .data(root.descendants())
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.y},${d.x})`)
        .on("click", (event, d) => {
            tree.branch(d.data.id);
            updateUI();
        });

    node.append("circle")
        .attr("r", 6)
        .attr("class", d => {
            let classes = [];
            if (activePathIds.has(d.data.id)) classes.push("active-path");
            if (d.data.id === leafId) classes.push("leaf");
            return classes.join(" ");
        });

    node.append("text")
        .attr("dy", ".35em")
        .attr("x", d => d.children ? -13 : 13)
        .style("text-anchor", d => d.children ? "end" : "start")
        .style("fill", "#ccc")
        .style("font-size", "10px")
        .text(d => {
            const data = d.data.data;
            if (data.type === 'session') return "ROOT";
            return data.content.substring(0, 15) + (data.content.length > 15 ? "..." : "");
        });
}

run();
