# API Client Component

LLM API communication with multiple provider support, streaming responses, and intelligent retry logic.

## Overview

The API Client provides a unified interface for communicating with Large Language Model (LLM) APIs including Google Gemini and OpenAI. It supports both streaming and non-streaming requests, with built-in retry logic, error classification, and token counting.

**Key Features:**
- Multi-provider support (Gemini, OpenAI)
- Streaming responses with real-time chunks
- Retry logic with exponential backoff
- Error classification (retryable vs fatal)
- Request abortion
- Token counting (approximate)
- Tool/Function calling support

## Installation

```javascript
import { APIClient } from './src/index.js';
```

## Usage

### Basic Example

```javascript
import { APIClient } from './components/core/api-client/src/index.js';

const client = new APIClient();

client.initialize({
  provider: 'gemini',
  apiKey: 'your-api-key',
  model: 'gemini-pro'
});

// Send a simple request
const response = await client.sendRequest({
  messages: [
    { role: 'user', content: 'What is the capital of France?' }
  ]
});

console.log(response.content); // "The capital of France is Paris."
console.log(response.usage);   // { prompt: 12, completion: 8, total: 20 }
```

### Streaming Example

```javascript
// Send a streaming request
await client.streamRequest(
  {
    messages: [
      { role: 'user', content: 'Tell me a story about space exploration.' }
    ],
    temperature: 0.8
  },
  (chunk) => {
    // Called for each chunk as it arrives
    process.stdout.write(chunk);
  }
);
```

### Multi-turn Conversation

```javascript
const messages = [
  { role: 'user', content: 'Hello!' },
  { role: 'assistant', content: 'Hello! How can I help you today?' },
  { role: 'user', content: 'What is TypeScript?' }
];

const response = await client.sendRequest({ messages });
console.log(response.content);
```

### Tool/Function Calling

```javascript
const response = await client.sendRequest({
  messages: [
    { role: 'user', content: 'What is the weather in Tokyo?' }
  ],
  tools: [
    {
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' }
        },
        required: ['location']
      }
    }
  ]
});

if (response.toolCalls) {
  console.log('Function call:', response.toolCalls[0].name);
  console.log('Arguments:', response.toolCalls[0].arguments);
}
```

### Aborting Requests

```javascript
// Start a streaming request
const streamPromise = client.streamRequest(
  { messages: [{ role: 'user', content: 'Write a very long story...' }] },
  (chunk) => console.log(chunk)
);

// Abort after 5 seconds
setTimeout(() => client.abort(), 5000);

await streamPromise; // Will complete or throw AbortError
```

## Configuration

### APIClient Options

```javascript
client.initialize({
  provider: 'gemini',           // Provider: 'gemini' or 'openai'
  apiKey: 'your-api-key',       // API key (required)
  model: 'gemini-pro',          // Model name (required)
  baseUrl: 'https://...',       // Custom base URL (optional)
  timeout: 30000,               // Request timeout in ms (default: 30000)
  retries: 3,                   // Number of retries (default: 3)
  retryDelay: 1000              // Initial retry delay in ms (default: 1000)
});
```

### Request Parameters

```javascript
{
  messages: [                   // Array of messages (required)
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi!' }
  ],
  tools: [...],                 // Tool definitions (optional)
  temperature: 0.7,             // Creativity (0-1, optional)
  maxTokens: 1024               // Max output tokens (optional)
}
```

### Response Format

```javascript
{
  content: "Response text",              // Generated text
  toolCalls: [...],                      // Tool calls if any
  usage: {
    prompt: 15,                          // Input tokens
    completion: 25,                      // Output tokens
    total: 40                            // Total tokens
  },
  finishReason: "stop"                   // Why generation stopped
}
```

## Providers

### Google Gemini

```javascript
client.initialize({
  provider: 'gemini',
  apiKey: process.env.GEMINI_API_KEY,
  model: 'gemini-pro'  // or 'gemini-pro-vision', 'gemini-ultra'
});
```

**Available Models:**
- `gemini-pro` - General purpose
- `gemini-pro-vision` - Multimodal (text + images)
- `gemini-ultra` - Most capable

### OpenAI

```javascript
client.initialize({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-3.5-turbo'  // or 'gpt-4', 'gpt-4-turbo'
});
```

**Available Models:**
- `gpt-3.5-turbo` - Fast and cost-effective
- `gpt-4` - More capable
- `gpt-4-turbo` - Latest GPT-4

### OpenAI-Compatible APIs

The OpenAI provider works with any OpenAI-compatible API:

```javascript
client.initialize({
  provider: 'openai',
  apiKey: 'your-key',
  model: 'llama2-70b',
  baseUrl: 'https://api.together.xyz/v1'
});
```

## Error Handling

```javascript
try {
  const response = await client.sendRequest({ messages });
} catch (error) {
  if (error.status === 401) {
    console.error('Invalid API key');
  } else if (error.status === 429) {
    console.error('Rate limit exceeded');
  } else if (error.retryable) {
    console.error('Temporary error, will retry:', error.message);
  } else {
    console.error('Request failed:', error.message);
  }
}
```

### Error Classification

- **Retryable:** Network errors, 5xx server errors, rate limits (429)
- **Non-retryable:** 4xx client errors (401, 403, 404)

## Retry Logic

The client automatically retries failed requests with exponential backoff:

```
Attempt 1: Immediate
Attempt 2: After 1000ms
Attempt 3: After 2000ms
Attempt 4: After 4000ms
...
```

Client errors (4xx) are not retried. Configure retries in initialization:

```javascript
client.initialize({
  provider: 'gemini',
  apiKey: 'key',
  retries: 5,        // Maximum retry attempts
  retryDelay: 2000   // Initial delay in ms
});
```

## Direct Provider Usage

Use providers directly for more control:

```javascript
import { GeminiProvider } from './components/core/api-client/src/index.js';

const provider = new GeminiProvider({
  apiKey: 'your-key',
  model: 'gemini-pro'
});

const response = await provider.sendRequest({
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

## API Reference

### APIClient

#### Methods
- `initialize(config)` - Initialize with provider configuration
- `sendRequest(request)` - Send non-streaming request
- `streamRequest(request, onChunk)` - Send streaming request
- `abort()` - Abort current request
- `getTokenCount(text)` - Count tokens in text
- `getProvider()` - Get current provider name
- `getModel()` - Get current model name

### Provider Classes

#### GeminiProvider
- `sendRequest(request)` - Non-streaming request
- `streamRequest(request, onChunk)` - Streaming request
- `abort()` - Abort request
- `getTokenCount(text)` - Token counting

#### OpenAIProvider
Same interface as GeminiProvider

## Testing

Open the test page in a browser:
```
http://localhost:8000/www/tests/index.html
```

Or run individual test files:
```
components/core/api-client/tests/unit/api-client.spec.html
```

## Demo

Interactive demo with chat interface:
```
http://localhost:8000/www/components/core/api-client/index.html
```

Features:
- Multi-provider support
- Streaming toggle
- Temperature and token controls
- Real-time stats
- Sample prompts

## Browser Support

- Chrome 80+ (fetch with streaming)
- Firefox 80+ (fetch with streaming)
- Safari 14+ (fetch with streaming)
- Edge 80+ (fetch with streaming)

**Note:** Streaming requires modern browsers with ReadableStream support.

## Security Notes

1. **Never commit API keys** - Use environment variables or secure storage
2. **Use HTTPS** in production to protect API keys in transit
3. **Implement rate limiting** on your server to prevent abuse
4. **Validate inputs** before sending to API

## Design Principles

1. **Unified Interface** - Same API regardless of provider
2. **Streaming First** - Real-time responses where supported
3. **Resilient** - Automatic retries with exponential backoff
4. **Abortable** - Cancel long-running requests
5. **Observable** - Token counting and usage tracking
6. **Zero Dependencies** - Pure JavaScript, no external libraries

## License

MIT
