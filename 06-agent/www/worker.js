import init, { Agent } from './pkg/agent_worker.js';

let agent = null;

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    try {
        switch (type) {
            case 'init':
                await init();
                const { apiKey, model, systemPrompt } = payload;
                agent = new Agent(apiKey, model, systemPrompt);
                self.postMessage({ type: 'ready' });
                break;

            case 'set_tools':
                if (!agent) throw new Error('Agent not initialized');
                // Payload.tools should be an array of tool definitions
                const toolsJson = JSON.stringify(payload.tools);
                agent.set_tools(toolsJson);
                self.postMessage({ type: 'tools_set' });
                break;

            case 'chat':
                if (!agent) throw new Error('Agent not initialized');
                const userMsg = payload.message;
                const responseJson = await agent.chat(userMsg);
                const step = JSON.parse(responseJson);
                self.postMessage({ type: 'step', step });
                break;

            case 'tool_result':
                if (!agent) throw new Error('Agent not initialized');
                const { toolName, result, runNext } = payload;
                // result expects a JSON string
                const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
                
                agent.add_tool_result(toolName, resultStr);
                
                // Only run next step if requested (defaults to true for backward compatibility if needed, but false is safer for batching)
                if (runNext !== false) {
                    const nextStepJson = await agent.run_step();
                    const nextStep = JSON.parse(nextStepJson);
                    self.postMessage({ type: 'step', step: nextStep });
                }
                break;

            case 'clear_history':
                 if (!agent) throw new Error('Agent not initialized');
                 agent.clear_history();
                 self.postMessage({ type: 'history_cleared' });
                 break;
        }
    } catch (error) {
        console.error('Worker Error:', error);
        self.postMessage({ 
            type: 'error', 
            error: error.message || String(error) 
        });
    }
};
