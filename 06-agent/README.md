# 06 - Agent: LLM Agent with Tool Execution (ReAct Loop)

A Rust/WASM agent that implements the **ReAct (Reason + Act) loop** — the core pattern of the coding agent. The agent thinks, decides to call tools, receives results, and continues reasoning until it produces a final text response.

## What This Project Teaches

- **Agent Loop Pattern**: LLM call → tool calls → tool results → LLM call → ...
- **Stateful Agent in WASM**: Rust struct holds conversation history and tool definitions
- **Tool Registration**: Dynamic tool registration from JavaScript
- **Tool Execution Bridge**: Tools execute in JS main thread, results feed back to Rust agent
- **Async WASM**: Full async/await flow for API calls from within WASM

## Project Structure

```
06-agent/
├── Cargo.toml           # Rust dependencies
├── src/
│   ├── lib.rs           # Agent struct, chat loop, tool result handling
│   └── llm.rs           # Gemini API types and HTTP call
└── www/
    ├── index.html        # Chat UI with tool logs
    ├── worker.js         # Web Worker: Agent lifecycle
    └── AgentClient.js    # Main-thread client with tool execution
```

## Architecture

```
Main Thread (AgentClient.js)
    │
    │ registerTool(name, desc, schema, implementation)
    │ chat(message) ──────────────────────────┐
    │                                          │
    │                                          ▼
    │                                   Web Worker (worker.js)
    │                                          │
    │                                          │ Agent.chat(message)
    │                                          │ Agent.run_step()
    │                                          │        │
    │                                          │        ▼
    │                                          │   Gemini API
    │                                          │        │
    │                                          │        ▼
    │                              ◄──── step: tool_call ────┐
    │                                                         │
    │  executeTools(tool_calls)                               │
    │  ├─ tool.implementation(args) ──► result                │
    │  └─ postMessage(tool_result) ──────────────────────────►│
    │                                          │              │
    │                                          │ Agent.add_tool_result()
    │                                          │ Agent.run_step() ──► Gemini API
    │                                          │        │
    │                              ◄──── step: text ────┘
    │
    ▼ resolve(response)
```

## Quick Start

```bash
# Build the WASM module
cd 06-agent && wasm-pack build --target web --out-dir www/pkg

# Serve the demo
cd www && python3 -m http.server 8080

# Open http://localhost:8080
```

## API Reference

### Rust Agent (WASM)

| Method | Description |
|--------|-------------|
| `Agent::new(api_key, model, system_prompt)` | Create agent with LLM config |
| `agent.set_tools(tools_json)` | Register available tools |
| `agent.chat(message)` | Start a turn with user message, returns `AgentStep` |
| `agent.run_step()` | Continue after adding tool results, returns `AgentStep` |
| `agent.add_tool_result(name, result_json)` | Feed tool execution result back |
| `agent.get_history()` | Get full conversation history as JSON |
| `agent.clear_history()` | Reset conversation |

### AgentStep Response

```json
{ "type": "text", "content": "The result is 42.", "tool_calls": null }
```

```json
{ "type": "tool_call", "content": null, "tool_calls": [
    { "name": "calculator", "args": { "operation": "add", "a": 5, "b": 3 } }
]}
```

### JavaScript Client (AgentClient.js)

```javascript
import { AgentClient } from './AgentClient.js';

const agent = new AgentClient(apiKey, "gemini-2.0-flash", "You are helpful.");
await agent.ready();

agent.registerTool("calculator", "Arithmetic", schema, async (args) => {
    return { result: args.a + args.b };
});

const response = await agent.chat("What is 5 + 3?", (step) => {
    console.log("Step:", step);
});
```

## Coding Agent Goal Alignment

This is the **most critical building block** — it implements the agent loop that is the heart of [`agent-loop.ts`](../agent/agent-loop.ts). The Rust `Agent` struct is the WASM equivalent of the TypeScript [`Agent`](../agent/agent.ts) class.

| Coding Agent Requirement | How This Project Addresses It |
|--------------------------|-------------------------------|
| Agent loop (prompt → tool calls → results → response) | `chat()` → `run_step()` loop matches [`runLoop()`](../agent/agent-loop.ts:51) |
| Tool registration and execution | `set_tools()` + JS-side execution mirrors [`AgentTool`](../agent/types.ts:157) |
| Conversation history management | `Agent.history` is the WASM equivalent of [`AgentState.messages`](../agent/types.ts:139) |
| System prompt injection | Constructor param matches [`AgentContext.systemPrompt`](../agent/types.ts:170) |
| Tool result feedback | `add_tool_result()` mirrors [`ToolResultMessage`](../agent/types.ts:11) handling |

### Mapping to TypeScript Agent

| TypeScript Agent | Rust Agent Equivalent |
|------------------|----------------------|
| [`agentLoop()`](../agent/agent-loop.ts:28) | `Agent::chat()` + `Agent::run_step()` loop |
| [`AgentState`](../agent/types.ts:134) | `Agent` struct fields |
| [`AgentTool.execute()`](../agent/types.ts:160) | JS-side `tool.implementation()` in `AgentClient.js` |
| [`AgentEvent`](../agent/types.ts:179) stream | `step` messages via `postMessage` |
| [`convertToLlm()`](../agent/types.ts:48) | Direct message construction in `run_step()` |
| [`AgentLoopConfig.model`](../agent/types.ts:23) | `self.model` field |

### What's Still Needed

- **Event streaming** — Returns complete steps, not granular events like `message_update` with deltas
- **Streaming LLM responses** — Uses `generateContent` (full response), not `streamGenerateContent`
- **Multi-provider support** — Only Gemini; needs Anthropic, OpenAI adapter layer
- **Abort/cancel support** — No `AbortSignal` equivalent yet
- **Steering messages** — No mid-turn interruption support
- **Context transformation** — No `transformContext` for token pruning
- **Parallel tool execution** — Sequential execution; could run independent tools in parallel

**Status: ✅ Core Complete** — ReAct loop with tool execution works. Needs streaming and multi-provider for production.
