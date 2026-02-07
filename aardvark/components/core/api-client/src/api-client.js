/**
 * APIClient - LLM API communication with multiple provider support
 * Provides a unified interface for Gemini, OpenAI, and other providers
 */

import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';

export class APIClient {
  constructor() {
    this.provider = null;
    this.config = null;
  }

  /**
   * Initialize the API client with configuration
   * @param {Object} config - Configuration object
   * @param {string} config.provider - Provider name ('gemini', 'openai')
   * @param {string} config.apiKey - API key for the provider
   * @param {string} config.model - Model name
   * @param {string} [config.baseUrl] - Custom base URL (optional)
   * @param {number} [config.timeout=30000] - Request timeout in ms
   * @param {number} [config.retries=3] - Number of retries
   * @param {number} [config.retryDelay=1000] - Delay between retries in ms
   */
  initialize(config) {
    this.config = config;
    
    switch (config.provider) {
      case 'gemini':
        this.provider = new GeminiProvider(config);
        break;
      case 'openai':
        this.provider = new OpenAIProvider(config);
        break;
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  /**
   * Send a non-streaming request
   * @param {Object} request - Request parameters
   * @param {Array} request.messages - Array of message objects {role, content}
   * @param {Array} [request.tools] - Array of tool definitions
   * @param {number} [request.temperature] - Temperature (0-1)
   * @param {number} [request.maxTokens] - Maximum tokens to generate
   * @returns {Promise<Object>} - Response object
   */
  async sendRequest(request) {
    if (!this.provider) {
      throw new Error('APIClient not initialized. Call initialize() first.');
    }
    return this.provider.sendRequest(request);
  }

  /**
   * Send a streaming request
   * @param {Object} request - Request parameters
   * @param {Function} onChunk - Callback function for each chunk
   * @returns {Promise<void>}
   */
  async streamRequest(request, onChunk) {
    if (!this.provider) {
      throw new Error('APIClient not initialized. Call initialize() first.');
    }
    return this.provider.streamRequest(request, onChunk);
  }

  /**
   * Abort the current request
   */
  abort() {
    if (this.provider) {
      this.provider.abort();
    }
  }

  /**
   * Count tokens in text (approximate)
   * @param {string} text - Text to count
   * @returns {number} - Token count
   */
  getTokenCount(text) {
    if (!this.provider) {
      // Default approximation if not initialized
      return Math.ceil(text.length / 4);
    }
    return this.provider.getTokenCount(text);
  }

  /**
   * Get current provider name
   * @returns {string|null}
   */
  getProvider() {
    return this.config?.provider || null;
  }

  /**
   * Get current model name
   * @returns {string|null}
   */
  getModel() {
    return this.config?.model || null;
  }
}

// Re-export providers for direct use
export { GeminiProvider } from './providers/gemini.js';
export { OpenAIProvider } from './providers/openai.js';
export { BaseProvider } from './providers/base.js';

export default APIClient;
