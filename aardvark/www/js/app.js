/**
 * Aardvark Main Application
 */
import { EventBus, globalEventBus } from './core/event-bus.js';
import { opfs } from './core/opfs-provider.js';
import { db } from './core/indexeddb-provider.js';
import { MessageBridgeMain } from './core/message-bridge.js';

// Import UI components (registers custom elements)
import { ChatUi } from './ui/chat-ui.js';
import { SessionTreeUi } from './ui/session-tree-ui.js';
import { ToolApprovalUi } from './ui/tool-approval-ui.js';

// Import WASM
import init, { AardvarkAgent } from '../pkg/aardvark.js';

class AardvarkApp {
  constructor() {
    this.eventBus = globalEventBus;
    this.agent = null;
    this.messageBridge = null;
    this.chatUi = null;
    this.sessionTreeUi = null;
  }

  async initialize() {
    try {
      console.log('Initializing Aardvark...');
      
      // Initialize storage
      await opfs.initialize();
      await db.initialize();
      
      // Initialize WASM
      await init();
      this.agent = new AardvarkAgent();
      
      // Initialize message bridge
      this.messageBridge = new MessageBridgeMain('./js/worker.js');
      await this.messageBridge.initialize();
      
      // Get UI references
      this.chatUi = document.querySelector('chat-ui');
      this.sessionTreeUi = document.querySelector('session-tree-ui');
      
      // Wire up events
      this.setupEventListeners();
      
      // Initialize agent
      const config = {
        api_key: localStorage.getItem('api_key') || '',
        model: 'gemini-1.5-pro',
        provider: 'gemini'
      };
      
      this.agent.initialize(config);
      
      console.log('Aardvark initialized successfully');
      this.eventBus.publish('app:ready', {});
      
    } catch (error) {
      console.error('Failed to initialize Aardvark:', error);
      this.eventBus.publish('app:error', { error: error.message });
    }
  }

  setupEventListeners() {
    // Chat UI events
    this.chatUi.addEventListener('message-send', (e) => {
      this.handleUserMessage(e.detail.text);
    });
    
    // Message bridge events (from WASM worker)
    this.messageBridge.addEventListener('tool_call', (e) => {
      this.handleToolCall(e.detail);
    });
    
    this.messageBridge.addEventListener('response', (e) => {
      this.handleAgentResponse(e.detail);
    });
    
    // Export button
    document.getElementById('export-btn').addEventListener('click', () => {
      this.exportSession();
    });
  }

  async handleUserMessage(text) {
    // Add user message to UI
    this.chatUi.addMessage('user', text);
    this.chatUi.isLoading = true;
    
    try {
      // Send to WASM agent
      const response = this.agent.send_message(text);
      
      // Handle response
      if (response.tool_calls) {
        // Execute tools
        for (const toolCall of response.tool_calls) {
          await this.executeTool(toolCall);
        }
      } else {
        // Display response
        this.chatUi.addMessage('assistant', response.content);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      this.chatUi.addMessage('assistant', `Error: ${error.message}`);
    } finally {
      this.chatUi.isLoading = false;
    }
  }

  async executeTool(toolCall) {
    // Import tool dynamically
    const toolModule = await import(`./tools/${toolCall.name}.js`);
    const result = await toolModule.default(toolCall.arguments, { opfs, db });
    
    // Send result back to agent
    this.agent.process_tool_result({
      tool_name: toolCall.name,
      output: result,
      error: null
    });
  }

  handleAgentResponse(response) {
    this.chatUi.addMessage('assistant', response.content);
    this.chatUi.isLoading = false;
  }

  exportSession() {
    const jsonl = this.agent.export_session_jsonl();
    const blob = new Blob([jsonl], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `session-${Date.now()}.jsonl`;
    a.click();
    
    URL.revokeObjectURL(url);
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new AardvarkApp();
  app.initialize();
});
