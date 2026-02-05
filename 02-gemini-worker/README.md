# 02 - Gemini Worker

Chat with Google's Gemini API using Rust/WASM in a Web Worker.

## What This Project Teaches

- **HTTP Requests from WASM**: Using `web-sys` fetch API
- **Async Rust**: `wasm-bindgen-futures` for async/await
- **Structured Data**: Serde for JSON serialization
- **API Key Management**: Secure storage in localStorage
- **Error Handling**: Custom error types with error codes

## Project Structure

```
02-gemini-worker/
├── Cargo.toml       # Rust dependencies
├── build.sh         # Build script
├── README.md        # This file
├── src/
│   └── lib.rs       # Rust: API calls, message handling
└── www/
    ├── index.html   # Chat UI
    ├── worker.js    # Web Worker
    └── pkg/         # Generated WASM (after build)
```

## Quick Start

```bash
# Build the WASM module
./build.sh

# Serve the demo
cd www && python3 -m http.server 8080

# Open http://localhost:8080
```

## Getting an API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key and paste it in the app

The key is stored in `localStorage` under `GEMINI_API_KEY`.

## Architecture

```
Main Thread (index.html)
    │
    │ postMessage({ type: 'chat', payload: { message } })
    ▼
Web Worker (worker.js)
    │
    │ Rust: build_request_body()
    │ Rust: call_gemini_api() ─────► Gemini API
    │ Rust: parse_response()  ◄─────
    │
    ▼ postMessage({ type: 'response', message })
Main Thread
```

## Rust Functions

| Function | Description |
|----------|-------------|
| `validate_api_key(key)` | Check if API key format is valid |
| `build_request_body(history, message)` | Create Gemini API request JSON |
| `parse_response(json)` | Extract message from API response |
| `add_to_history(history, role, text)` | Add message to conversation |
| `call_gemini_api(key, body)` | Make async HTTP request to Gemini |

## Worker Messages

| Type | Direction | Description |
|------|-----------|-------------|
| `set_api_key` | Main → Worker | Set the Gemini API key |
| `chat` | Main → Worker | Send a chat message |
| `clear_history` | Main → Worker | Clear conversation history |
| `api_key_status` | Worker → Main | API key validation result |
| `thinking` | Worker → Main | Processing indicator |
| `response` | Worker → Main | Chat response from Gemini |
| `error` | Worker → Main | Error with code |

## Error Codes

| Code | Meaning |
|------|---------|
| `MISSING_API_KEY` | No API key configured |
| `INVALID_API_KEY` | API key rejected by Gemini |
| `RATE_LIMIT` | Too many requests |
| `PARSE_ERROR` | Failed to parse API response |
| `WORKER_ERROR` | General worker error |

## Key Code Examples

**Async HTTP Request in Rust:**
```rust
#[wasm_bindgen]
pub async fn call_gemini_api(api_key: &str, request_body: &str) -> Result<String, JsValue> {
    let mut opts = RequestInit::new();
    opts.method("POST");
    opts.body(Some(&JsValue::from_str(request_body)));

    let request = Request::new_with_str_and_init(&url, &opts)?;
    
    let window = web_sys::window().unwrap();
    let resp = JsFuture::from(window.fetch_with_request(&request)).await?;
    // ...
}
```

**Conversation History:**
```rust
#[wasm_bindgen]
pub fn add_to_history(history_json: &str, role: &str, text: &str) -> String {
    let mut history: Vec<ChatMessage> = serde_json::from_str(history_json).unwrap_or_default();
    history.push(ChatMessage { role, parts: vec![Part { text }] });
    serde_json::to_string(&history).unwrap()
}
```

## Coding Agent Goal Alignment

This project proves that the **LLM communication layer** can run entirely from Rust/WASM inside a Web Worker — the core requirement for a browser-based coding agent.

| Coding Agent Requirement | How This Project Addresses It |
|--------------------------|-------------------------------|
| LLM API calls | `call_gemini_api()` makes HTTP requests from WASM via `web-sys` fetch |
| Conversation history | `add_to_history()` manages multi-turn message arrays identical to [`AgentState.messages`](../agent/types.ts:139) |
| JSON request/response | Serde serialization mirrors the TypeScript agent's message format |
| API key management | localStorage-based key storage, matching browser security constraints |
| Error handling | Typed error codes map to the agent's error reporting pattern |

### Mapping to TypeScript Agent

| TypeScript Agent | Rust/WASM Equivalent |
|------------------|---------------------|
| [`streamSimple()`](../agent/agent-loop.ts:10) | `call_gemini_api()` — non-streaming for now |
| [`AgentMessage`](../agent/types.ts:129) history array | `add_to_history()` conversation history |
| [`AgentLoopConfig.model`](../agent/types.ts:23) | `model` parameter in API URL |
| Provider API key resolution | `validate_api_key()` + localStorage |

### What's Still Needed

- **Streaming responses** — Currently uses `generateContent` (non-streaming); needs `streamGenerateContent` for real-time token output
- **Multi-provider support** — Only Gemini; the TypeScript agent supports Anthropic, OpenAI, and 15+ providers
- **Token counting** — No token usage tracking yet

**Status: ✅ Complete** — LLM communication from WASM is proven. Streaming and multi-provider are future enhancements.

## Next Steps

Continue to [03-kv-worker](../03-kv-worker/) to learn about IndexedDB and the hybrid JS/Rust architecture.
