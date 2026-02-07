/**
 * BaseProvider - Abstract base class for LLM API providers
 * Defines the interface that all providers must implement
 */

export class BaseProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * Send a non-streaming request to the API
   * @param {Object} request - Request parameters
   * @returns {Promise<Object>} - API response
   */
  async sendRequest(request) {
    throw new Error('sendRequest must be implemented by subclass');
  }

  /**
   * Send a streaming request to the API
   * @param {Object} request - Request parameters
   * @param {Function} onChunk - Callback for each chunk
   * @returns {Promise<void>}
   */
  async streamRequest(request, onChunk) {
    throw new Error('streamRequest must be implemented by subclass');
  }

  /**
   * Abort the current request
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Count tokens in text (approximate)
   * @param {string} text - Text to count
   * @returns {number} - Token count
   */
  getTokenCount(text) {
    // Default implementation: rough approximation (4 chars per token)
    return Math.ceil(text.length / 4);
  }

  /**
   * Create a new abort controller for requests
   * @protected
   */
  _createAbortController() {
    this.abortController = new AbortController();
    return this.abortController;
  }

  /**
   * Get headers for API requests
   * @protected
   */
  _getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    };
  }

  /**
   * Retry a function with exponential backoff
   * @protected
   */
  async _retryWithBackoff(fn) {
    let lastError;
    
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }
        
        // Wait before retrying (exponential backoff)
        if (attempt < this.retries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Format error response
   * @protected
   */
  _formatError(error, response) {
    const formatted = new Error(error.message || 'API request failed');
    formatted.status = response?.status;
    formatted.statusText = response?.statusText;
    formatted.originalError = error;
    
    // Classify as retryable
    formatted.retryable = !formatted.status || formatted.status >= 500 || formatted.status === 429;
    
    return formatted;
  }
}

export default BaseProvider;
