/**
 * SessionTreeUi Component - Visualize and navigate session branches
 */
import { LitElement, html } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

export class SessionTreeUi extends LitElement {
  static properties = {
    sessions: { type: Array },
    selectedSession: { type: String }
  };

  constructor() {
    super();
    this.sessions = [];
    this.selectedSession = null;
  }

  render() {
    return html`
      <div class="h-full bg-gray-50">
        <div class="p-3 border-b border-gray-200">
          <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide">Sessions</h2>
        </div>
        
        <div class="overflow-y-auto">
          ${this.sessions.length === 0 ? html`
            <div class="p-4 text-center text-gray-400 text-sm">
              No sessions yet
            </div>
          ` : html`
            <ul class="divide-y divide-gray-100">
              ${this.sessions.map(session => this.renderSession(session))}
            </ul>
          `}
        </div>
        
        <div class="p-3 border-t border-gray-200">
          <button 
            @click="${this.createNewSession}"
            class="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium
                   hover:bg-blue-700 transition-colors">
            New Session
          </button>
        </div>
      </div>
    `;
  }

  renderSession(session) {
    const isSelected = session.id === this.selectedSession;
    
    return html`
      <li 
        class="p-3 cursor-pointer hover:bg-gray-100 transition-colors
               ${isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}"
        @click="${() => this.selectSession(session.id)}">
        <div class="flex items-center justify-between">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-900 truncate">
              ${session.name || 'Untitled Session'}
            </p>
            <p class="text-xs text-gray-500">
              ${new Date(session.timestamp).toLocaleDateString()}
            </p>
          </div>
          <button 
            @click="${(e) => this.deleteSession(e, session.id)}"
            class="ml-2 text-gray-400 hover:text-red-500 p-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </li>
    `;
  }

  selectSession(id) {
    this.selectedSession = id;
    this.dispatchEvent(new CustomEvent('session-select', {
      detail: { id },
      bubbles: true,
      composed: true
    }));
  }

  createNewSession() {
    this.dispatchEvent(new CustomEvent('session-create', {
      bubbles: true,
      composed: true
    }));
  }

  deleteSession(e, id) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('session-delete', {
      detail: { id },
      bubbles: true,
      composed: true
    }));
  }
}

customElements.define('session-tree-ui', SessionTreeUi);
