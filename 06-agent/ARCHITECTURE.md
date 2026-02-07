# Rust Wasm Agent Architecture

This document outlines the architecture for the Rust-based WebAssembly (Wasm) agent, which is a reimplementation of the provided `typescript-agent-reference`. The goal is to reproduce the functionality of the TypeScript agent in Rust, compiling it to Wasm to run in a web environment.

## Core Principles

- **Fidelity to the Reference:** The Rust implementation will closely follow the architecture and patterns of the `typescript-agent-reference`.
- **Wasm-first:** The agent is designed to be compiled to WebAssembly and run in a web worker.
- **Asynchronous:** The architecture will be fully asynchronous, using Rust's `async/await` to handle streaming and other I/O-bound operations.
- **Type-safe:** Leveraging Rust's strong type system to ensure correctness and prevent common errors.
- **Extensible:** The design will allow for easy extension with new tools, models, and custom message types.

## Module Structure

The Rust crate will be organized into the following modules, mirroring the structure of the TypeScript reference:

### `src/lib.rs`

The main entry point of the crate. It will:

- Define the public API of the Wasm module using `#[wasm_bindgen]`.
- Expose the `Agent` struct and its methods to JavaScript.
- Handle the initialization of the Wasm module.

### `src/agent.rs`

This module will contain the `Agent` struct, which is the central component of the system. Its responsibilities include:

- **State Management:** Holding the agent's state in an `AgentState` struct, which includes the conversation history (`messages`), configured `tools`, the selected `model`, and other settings.
- **Lifecycle Management:** Providing methods to `prompt`, `continue`, `abort`, and `reset` the agent.
- **Event Subscription:** Allowing JavaScript code to subscribe to `AgentEvent`s to update the UI.
- **Orchestration:** Driving the conversation by invoking the `agent_loop`.

### `src/agent_loop.rs`

This module will implement the core logic of the agent's conversation loop. It will be responsible for:

- **Turn Management:** Processing conversation turns, each consisting of an assistant response and potential tool calls.
- **Streaming LLM Responses:** Handling the streaming of responses from the LLM.
- **Tool Execution:** Executing tools when requested by the assistant's response.
- **Steering and Follow-up:** Managing "steering" and "follow-up" messages to guide the conversation.
- **Event Emission:** Emitting `AgentEvent`s to notify listeners about the progress of the loop.

### `src/llm.rs`

This module will abstract the communication with the Language Model (LLM). Its responsibilities will be:

- **API Requests:** Sending requests to the LLM's API.
- **Streaming Responses:** Parsing the streaming responses from the LLM.
- **Extensibility:** Providing a generic interface to support different LLM providers.

### `src/proxy.rs`

This module will provide functionality for routing LLM calls through a proxy server, similar to `proxy.ts` in the reference implementation. This is essential for scenarios where authentication and request management are handled on a backend.

### `src/types.rs`

This module will define all the data structures used throughout the agent. These will be Rust `struct`s and `enum`s that correspond to the TypeScript types. Key types include:

- `AgentMessage`: An enum representing the different types of messages in the conversation.
- `AgentState`: A struct holding the complete state of the agent.
- `AgentTool`: A struct representing a tool that the agent can use.
- `AgentEvent`: An enum representing the events that the agent can emit.

All types that need to be shared with JavaScript will be annotated with `#[derive(serde::Serialize, serde::Deserialize)]` and `#[wasm_bindgen]`.

## Web Worker (`www/worker.js`)

The Wasm module will be loaded and run within a Web Worker. The `worker.js` file will be responsible for:

- **Wasm Initialization:** Loading and initializing the Wasm module.
- **Agent Instantiation:** Creating an instance of the `Agent`.
- **Message Passing:** Acting as a bridge between the main UI thread and the Wasm agent, passing messages back and forth.

## UI (`www/AgentClient.js` and `www/index.html`)

The UI will interact with the agent through the `AgentClient.js` module, which will communicate with the web worker.

- **`AgentClient.js`:** This will provide a high-level API for the UI to interact with the agent, abstracting away the details of the web worker communication.
- **`index.html`:** The main HTML file will host the UI and will use `AgentClient.js` to send prompts to the agent and display the results.
