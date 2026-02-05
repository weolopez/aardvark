export class AgentClient {
    constructor(apiKey, model = "gemini-2.0-flash", systemPrompt = "") {
        this.worker = new Worker('./worker.js', { type: 'module' });
        this.tools = new Map(); // name -> { definition, implementation }
        this.pendingResolves = new Map(); // Not really needed for this flow
        
        this.worker.onmessage = this.handleMessage.bind(this);
        
        // Initialize worker
        this.initPromise = new Promise((resolve, reject) => {
            this.pendingInit = { resolve, reject };
            this.worker.postMessage({
                type: 'init',
                payload: { apiKey, model, systemPrompt }
            });
        });

        this.onStepCallback = null;
    }

    async ready() {
        return this.initPromise;
    }

    /**
     * Register a tool for the agent to use.
     * @param {string} name - Unique tool name
     * @param {string} description - Description for the LLM
     * @param {object} parameters - JSON Schema for parameters
     * @param {function} implementation - Async function(args) -> result
     */
    registerTool(name, description, parameters, implementation) {
        this.tools.set(name, {
            definition: { name, description, parameters },
            implementation
        });
        this.syncTools();
    }

    syncTools() {
        if (!this.initPromise) return; // Wait for init
        
        const tools = Array.from(this.tools.values()).map(t => t.definition);
        this.worker.postMessage({
            type: 'set_tools',
            payload: { tools }
        });
    }

    /**
     * Send a message to the agent and await the final text response.
     * Executes tools automatically in the loop.
     * @param {string} message 
     * @param {function} onStep - Optional callback (step) => void for logging
     */
    async chat(message, onStep = null) {
        await this.ready();
        this.onStepCallback = onStep;

        return new Promise((resolve, reject) => {
            this.currentTurn = { resolve, reject };
            this.worker.postMessage({
                type: 'chat',
                payload: { message }
            });
        });
    }

    async handleMessage(e) {
        const { type, step, error } = e.data;

        if (type === 'ready') {
            if (this.pendingInit) {
                this.pendingInit.resolve();
                this.pendingInit = null;
                // Sync any tools registered before init
                if (this.tools.size > 0) this.syncTools();
            }
            return;
        }

        if (type === 'error') {
            if (this.currentTurn) {
                this.currentTurn.reject(new Error(error));
                this.currentTurn = null;
            } else if (this.pendingInit) {
                this.pendingInit.reject(new Error(error));
            } else {
                console.error("Agent Error:", error);
            }
            return;
        }

        if (type === 'step') {
            // Notify listener
            if (this.onStepCallback) this.onStepCallback(step);

            if (step.type === 'text') {
                // Done
                if (this.currentTurn) {
                    this.currentTurn.resolve(step.content);
                    this.currentTurn = null;
                }
            } else if (step.type === 'tool_call') {
                // Execute tools
                this.executeTools(step.tool_calls);
            }
        }
    }

    async executeTools(toolCalls) {
        // Run them potentially in parallel?
        // For simplicity and safety with stateful tools, running them sequentially might be safer 
        // unless we know they are read-only. But usually Promise.all is fine for independent tools.
        // Rust side expects one `add_tool_result` call per function call?
        // Wait, my Rust `add_tool_result` takes `tool_name` and `result`.
        // If there are multiple calls, I should send multiple results. 
        // But the `run_step` should only be called once ALL results are back?
        // Actually, my Rust loop is:
        // 1. `chat` -> returns step
        // 2. JS calls `add_tool_result` -> Rust updates history
        // 3. JS calls `run_step` -> Rust updates history (user prompts?) No.
        
        // ISSUE: If I have 3 tool calls in one step:
        // I need to add 3 results to history.
        // Then call run_step ONCE.
        
        // My `worker.js` logic is: `case 'tool_result': agent.add_tool_result(); agent.run_step();`
        // This is a BUG in my `worker.js` if there are multiple tool calls. 
        // If I send 3 results sequentially, it will trigger 3 `run_step` calls (3 LLM calls).
        // That is wasteful and potentially confusing for the LLM.
        
        // FIX: I should update `worker.js` to handle batch results or separating `add_tool_result` from `run_step`.
        // Let's modify `worker.js` to allow `add_tool_result` without auto-running step, 
        // and a separate `run_next_step` message.
        // OR: `tool_result` payload contains `run_next: boolean`.

        for (const call of toolCalls) {
            const tool = this.tools.get(call.name);
            let result;
            if (!tool) {
                result = { error: `Tool ${call.name} not found` };
            } else {
                try {
                    console.log(`Executing ${call.name}`, call.args);
                    result = await tool.implementation(call.args);
                } catch (err) {
                    result = { error: err.message };
                }
            }
            
            // For now, let's assume one tool call per step usually, or handle the inefficiency.
            // But to fix it properly:
            // I'll assume I send them all, but only the LAST one triggers the next step?
            // Or I use Promise.all and send a batch.
            // Let's update worker.js first.
            
            // For this iteration (Simplicity): 
            // I will use a slight hack: send all results with `run_step: false`, then a final dummy or simple trigger?
            // No, let's just make `worker.js` smarter or simpler.
            // Let's change `worker.js` to accept `run_step` flag.
            
             this.worker.postMessage({
                type: 'tool_result',
                payload: {
                    toolName: call.name,
                    result: result,
                    // Only run next step if this is the last tool call
                    runNext: call === toolCalls[toolCalls.length - 1]
                }
            });
        }
    }
}
