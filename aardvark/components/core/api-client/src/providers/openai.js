/**
 * OpenAIProvider - OpenAI API implementation
 * Compatible with OpenAI and OpenAI-compatible APIs (e.g., Groq, Together)
 */

import { BaseProvider } from './base.js';

export class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-3.5-turbo';
  }

  /**
   * Send a non-streaming request to OpenAI API
   */
  async sendRequest(request) {
    return this._retryWithBackoff(async () => {
      const controller = this._createAbortController();
      
      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this._getHeaders(),
          body: JSON.stringify(this._formatRequest(request)),
          signal: controller.signal
        });

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
   * Send a streaming request to OpenAI API
   */
  async streamRequest(request, onChunk) {
    return this._retryWithBackoff(async () => {
      const controller = this._createAbortController();
      
      try {
        const formattedRequest = this._formatRequest(request);
        formattedRequest.stream = true;

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this._getHeaders(),
          body: JSON.stringify(formattedRequest),
          signal: controller.signal
        });

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
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const chunk = JSON.parse(data);
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
   * Format request for OpenAI API
   * @private
   */
  _formatRequest(request) {
    const formatted = {
      model: this.model,
      messages: request.messages
    };

    if (request.tools) {
      formatted.tools = this._formatTools(request.tools);
    }

    if (request.temperature !== undefined) {
      formatted.temperature = request.temperature;
    }

    if (request.maxTokens !== undefined) {
      formatted.max_tokens = request.maxTokens;
    }

    return formatted;
  }

  /**
   * Format tools for OpenAI
   * @private
   */
  _formatTools(tools) {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  /**
   * Format response from OpenAI
   * @private
   */
  _formatResponse(data) {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('No choices in response');
    }

    const message = choice.message;
    const text = message?.content || '';
    const toolCalls = this._extractToolCalls(message);

    return {
      content: text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        prompt: data.usage?.prompt_tokens || 0,
        completion: data.usage?.completion_tokens || 0,
        total: data.usage?.total_tokens || 0
      },
      finishReason: choice.finish_reason
    };
  }

  /**
   * Extract text from streaming chunk
   * @private
   */
  _extractTextFromChunk(chunk) {
    return chunk.choices?.[0]?.delta?.content || '';
  }

  /**
   * Extract tool calls from message
   * @private
   */
  _extractToolCalls(message) {
    if (!message?.tool_calls) return [];
    
    return message.tool_calls
      .filter(tc => tc.type === 'function')
      .map(tc => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}')
      }));
  }

  /**
   * Override getTokenCount for OpenAI (more accurate approximation)
   * OpenAI uses ~4 characters per token on average
   */
  getTokenCount(text) {
    return Math.ceil(text.length / 4);
  }
}

export default OpenAIProvider;
