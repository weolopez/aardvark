/**
 * GeminiProvider - Google Gemini API implementation
 * Supports both streaming and non-streaming requests
 */

import { BaseProvider } from './base.js';

export class GeminiProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.model = config.model || 'gemini-3-flash-preview';
  }

  /**
   * Build the API URL with model and API key
   * @private
   */
  _buildUrl(endpoint) {
    // URL format: https://generativelanguage.googleapis.com/v1beta/models/{model}:{endpoint}?key={apiKey}
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:${endpoint}?key=${this.apiKey}`;
  }

  /**
   * Send a non-streaming request to Gemini API
   */
  async sendRequest(request) {
    return this._retryWithBackoff(async () => {
      const controller = this._createAbortController();
      
      try {
        const response = await fetch(
          this._buildUrl('generateContent'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this._formatRequest(request)),
            signal: controller.signal
          }
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
          throw this._formatError(new Error(error.error?.message || `HTTP ${response.status}`), response);
        }

        const data = await response.json();
        return this._formatResponse(data);
      } finally {
        this.abortController = null;
      }
    });
  }

  /**
   * Send a streaming request to Gemini API
   */
  async streamRequest(request, onChunk) {
    return this._retryWithBackoff(async () => {
      const controller = this._createAbortController();
      
      try {
        const response = await fetch(
          this._buildUrl('streamGenerateContent'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this._formatRequest(request)),
            signal: controller.signal
          }
        );

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
          throw this._formatError(new Error(error.error?.message || `HTTP ${response.status}`), response);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            if (line.trim()) {
              try {
                const chunk = JSON.parse(line);
                const text = this._extractTextFromChunk(chunk);
                if (text) {
                  onChunk(text);
                }
              } catch (e) {
                // Ignore malformed JSON lines
              }
            }
          }
        }
      } finally {
        this.abortController = null;
      }
    });
  }

  /**
   * Format request for Gemini API
   * @private
   */
  _formatRequest(request) {
    const formatted = {
      contents: this._formatMessages(request.messages)
    };

    if (request.tools) {
      formatted.tools = this._formatTools(request.tools);
    }

    if (request.temperature !== undefined) {
      formatted.generationConfig = {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens
      };
    }

    return formatted;
  }

  /**
   * Format messages for Gemini
   * @private
   */
  _formatMessages(messages) {
    return messages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));
  }

  /**
   * Format tools for Gemini
   * @private
   */
  _formatTools(tools) {
    return tools.map(tool => ({
      functionDeclarations: [{
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }]
    }));
  }

  /**
   * Format response from Gemini
   * @private
   */
  _formatResponse(data) {
    const candidate = data.candidates?.[0];
    const content = candidate?.content;
    
    if (!content) {
      throw new Error('No content in response');
    }

    const text = content.parts?.[0]?.text || '';
    const toolCalls = this._extractToolCalls(content);

    return {
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        prompt: data.usageMetadata?.promptTokenCount || 0,
        completion: data.usageMetadata?.candidatesTokenCount || 0,
        total: data.usageMetadata?.totalTokenCount || 0
      },
      finishReason: candidate.finishReason
    };
  }

  /**
   * Extract text from streaming chunk
   * @private
   */
  _extractTextFromChunk(chunk) {
    return chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * Extract tool calls from content
   * @private
   */
  _extractToolCalls(content) {
    if (!content.parts) return [];
    
    return content.parts
      .filter(part => part.functionCall)
      .map(part => ({
        name: part.functionCall.name,
        arguments: part.functionCall.args
      }));
  }

  /**
   * Get token count for Gemini (approximate)
   * Gemini uses ~4 characters per token on average
   */
  getTokenCount(text) {
    return Math.ceil(text.length / 4);
  }
}

export default GeminiProvider;
