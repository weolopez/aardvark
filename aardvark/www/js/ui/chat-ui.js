/**
 * ChatUi Component - Main chat interface using Lit HTML
 */
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class ChatUi extends LitElement {
  static properties = {
    messages: { type: Array },
    inputText: { type: String },
    isLoading: { type: Boolean }
  };

  constructor() {
    super();
    this.messages = [];
    this.inputText = '';
    this.isLoading = false;
  }

  render() {
    return html`
      <div class="flex flex-col h-full bg-white">
        <!-- Messages List -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4" id="messages-container">
          ${this.messages.map(msg => this.renderMessage(msg))}
          
          ${this.isLoading ? html`
            <div class="flex items-center space-x-2 text-gray-500">
              <div class="animate-bounce">●</div>
              <div class="animate-bounce" style="animation-delay: 0.1s">●</div>
              <div class="animate-bounce" style="animation-delay: 0.2s">●</div>
            </div>
          ` : ''}
        </div>
        
        <!-- Input Area -->
        <div class="flex p-4 border-t border-gray-200 bg-white">
          <textarea
            class="flex-1 p-3 border border-gray-300 rounded-lg resize-none 
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   disabled:bg-gray-100 disabled:cursor-not-allowed
                   text-gray-800 placeholder-gray-400"
            .value="${this.inputText}"
            @input="${this.handleInput}"
            @keydown="${this.handleKeydown}"
            placeholder="Type a message... (Shift+Enter for new line)"
            rows="2"
            ?disabled="${this.isLoading}"
          ></textarea>
          <button 
            class="ml-3 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium
                   hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500
                   disabled:bg-gray-400 disabled:cursor-not-allowed
                   transition-colors duration-200 flex items-center"
            @click="${this.sendMessage}" 
            ?disabled="${this.isLoading || !this.inputText.trim()}">
            ${this.isLoading ? 
              html`<span class="animate-pulse">Loading...</span>` : 
              html`<span>Send</span>`
            }
          </button>
        </div>
      </div>
    `;
  }

  renderMessage(msg) {
    const isUser = msg.role === 'user';
    
    return html`
      <div class="${isUser ? 'ml-12' : 'mr-12'}">
        <div class="${isUser 
          ? 'bg-blue-50 border border-blue-100' 
          : 'bg-gray-50 border border-gray-100'} 
          p-4 rounded-lg shadow-sm">
          <div class="flex items-center mb-2">
            <span class="text-xs font-semibold ${isUser ? 'text-blue-600' : 'text-gray-600'} uppercase tracking-wide">
              ${isUser ? 'You' : 'Assistant'}
            </span>
            <span class="text-xs text-gray-400 ml-2">
              ${new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
          <div class="text-gray-800 whitespace-pre-wrap leading-relaxed">${msg.content}</div>
          
          ${msg.toolCalls ? html`
            <div class="mt-3 pt-3 border-t border-gray-200">
              <div class="text-xs text-gray-500 mb-2">Tool Calls:</div>
              ${msg.toolCalls.map(call => html`
                <div class="bg-white p-2 rounded border border-gray-200 mb-2">
                  <div class="text-sm font-medium text-gray-700">${call.name}</div>
                  <pre class="text-xs text-gray-600 mt-1 overflow-x-auto">${JSON.stringify(call.arguments, null, 2)}</pre>
                </div>
              `)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  handleInput(e) {
    this.inputText = e.target.value;
  }

  handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage() {
    const text = this.inputText.trim();
    if (!text || this.isLoading) return;

    this.dispatchEvent(new CustomEvent('message-send', {
      detail: { text },
      bubbles: true,
      composed: true
    }));

    this.inputText = '';
  }

  addMessage(role, content, toolCalls = null) {
    this.messages = [...this.messages, { 
      role, 
      content, 
      toolCalls,
      timestamp: Date.now() 
    }];
    
    // Auto-scroll to bottom
    this.updateComplete.then(() => {
      const container = this.shadowRoot?.querySelector('#messages-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }

  clearMessages() {
    this.messages = [];
  }
}

customElements.define('chat-ui', ChatUi);
