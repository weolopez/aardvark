/**
 * API Client - LLM API communication component
 * 
 * Provides unified interface for multiple LLM providers:
 * - Google Gemini
 * - OpenAI (and compatible APIs)
 * 
 * Features:
 * - Streaming responses
 * - Retry logic with exponential backoff
 * - Error classification
 * - Token counting
 * - Request abortion
 * 
 * @module api-client
 */

export { APIClient } from './api-client.js';
export { GeminiProvider } from './providers/gemini.js';
export { OpenAIProvider } from './providers/openai.js';
export { BaseProvider } from './providers/base.js';

// Default export
export { APIClient as default } from './api-client.js';
