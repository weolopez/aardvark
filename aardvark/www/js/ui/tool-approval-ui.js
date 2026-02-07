/**
 * ToolApprovalUi Component - Review and approve pending tools
 */
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class ToolApprovalUi extends LitElement {
  static properties = {
    pendingTools: { type: Array },
    selectedTool: { type: Object }
  };

  constructor() {
    super();
    this.pendingTools = [];
    this.selectedTool = null;
  }

  render() {
    return html`
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
          <div class="p-4 border-b border-gray-200 flex justify-between items-center">
            <h2 class="text-lg font-semibold text-gray-800">Tool Approval Required</h2>
            <button 
              @click="${this.close}"
              class="text-gray-400 hover:text-gray-600">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          
          <div class="flex flex-1 overflow-hidden">
            <!-- Tool List -->
            <div class="w-64 border-r border-gray-200 overflow-y-auto bg-gray-50">
              ${this.pendingTools.map(tool => html`
                <div 
                  class="p-3 cursor-pointer hover:bg-gray-100 border-b border-gray-200
                         ${this.selectedTool?.id === tool.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}"
                  @click="${() => this.selectTool(tool)}">
                  <div class="font-medium text-sm text-gray-800">${tool.name}</div>
                  <div class="text-xs text-gray-500 mt-1">${tool.description}</div>
                </div>
              `)}
            </div>
            
            <!-- Tool Preview -->
            <div class="flex-1 overflow-y-auto p-4">
              ${this.selectedTool ? html`
                <div class="prose max-w-none">
                  <h3 class="text-lg font-semibold mb-2">${this.selectedTool.name}</h3>
                  <p class="text-gray-600 mb-4">${this.selectedTool.description}</p>
                  
                  <div class="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 class="text-sm font-semibold text-gray-700 mb-2">SKILL.md Content</h4>
                    <pre class="text-xs bg-gray-100 p-3 rounded overflow-x-auto">${this.selectedTool.content}</pre>
                  </div>
                  
                  <div class="flex space-x-3">
                    <button 
                      @click="${this.approveTool}"
                      class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
                      Approve
                    </button>
                    <button 
                      @click="${this.rejectTool}"
                      class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors">
                      Reject
                    </button>
                  </div>
                </div>
              ` : html`
                <div class="text-center text-gray-400 mt-8">
                  Select a tool to review
                </div>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  selectTool(tool) {
    this.selectedTool = tool;
  }

  approveTool() {
    if (!this.selectedTool) return;
    
    this.dispatchEvent(new CustomEvent('tool-approve', {
      detail: { toolId: this.selectedTool.id },
      bubbles: true,
      composed: true
    }));
  }

  rejectTool() {
    if (!this.selectedTool) return;
    
    this.dispatchEvent(new CustomEvent('tool-reject', {
      detail: { toolId: this.selectedTool.id },
      bubbles: true,
      composed: true
    }));
  }

  close() {
    this.dispatchEvent(new CustomEvent('close', {
      bubbles: true,
      composed: true
    }));
  }

  show() {
    this.classList.remove('hidden');
  }

  hide() {
    this.classList.add('hidden');
  }
}

customElements.define('tool-approval-ui', ToolApprovalUi);
