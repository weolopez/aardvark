use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

pub mod agent;
pub mod session;
pub mod tools;
pub mod compaction;
pub mod export;
pub mod llm;

use agent::AgentCore;
use session::SessionTree;

#[wasm_bindgen]
pub struct AardvarkAgent {
    agent_core: AgentCore,
    session_tree: SessionTree,
}

#[wasm_bindgen]
impl AardvarkAgent {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        console_error_panic_hook::set_once();
        
        Self {
            agent_core: AgentCore::new(),
            session_tree: SessionTree::new(),
        }
    }

    pub fn initialize(&mut self, config: JsValue) -> Result<(), JsValue> {
        let config: AgentConfig = serde_wasm_bindgen::from_value(config)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse config: {}", e)))?;
        
        self.agent_core.initialize(config);
        Ok(())
    }

    pub fn send_message(&mut self, text: String) -> JsValue {
        let response = self.agent_core.process_message(text, &mut self.session_tree);
        serde_wasm_bindgen::to_value(&response).unwrap()
    }

    pub fn get_available_tools(&self) -> JsValue {
        let tools = self.agent_core.get_tools();
        serde_wasm_bindgen::to_value(&tools).unwrap()
    }

    pub fn get_session_history(&self) -> JsValue {
        let history = self.session_tree.get_history();
        serde_wasm_bindgen::to_value(&history).unwrap()
    }

    pub fn branch_session(&mut self, node_id: String) -> String {
        self.session_tree.branch(node_id)
    }

    pub fn export_session_jsonl(&self) -> String {
        export::export_to_jsonl(&self.session_tree)
    }

    pub fn export_session_markdown(&self) -> String {
        export::export_to_markdown(&self.session_tree)
    }
}

#[derive(Serialize, Deserialize)]
pub struct AgentConfig {
    pub api_key: String,
    pub model: String,
    pub provider: String,
}

#[wasm_bindgen(start)]
pub fn main() {
    console_error_panic_hook::set_once();
    web_sys::console::log_1(&"Aardvark Agent WASM loaded".into());
}
