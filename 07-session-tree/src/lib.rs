mod models;
mod session;

use session::SessionManager;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct SessionTree {
    manager: SessionManager,
}

#[wasm_bindgen]
impl SessionTree {
    #[wasm_bindgen(constructor)]
    pub fn new(cwd: String) -> SessionTree {
        SessionTree {
            manager: SessionManager::new(cwd),
        }
    }

    pub fn append_message(&mut self, role: String, content: String) -> String {
        self.manager.append_message(role, content)
    }

    pub fn branch(&mut self, entry_id: String) -> Result<(), String> {
        self.manager.branch(entry_id)
    }

    pub fn get_history(&self) -> Result<JsValue, JsValue> {
        let history = self.manager.get_history();
        Ok(serde_wasm_bindgen::to_value(&history)?)
    }

    pub fn get_tree(&self) -> Result<JsValue, JsValue> {
        // Return the raw entries HashMap
        Ok(serde_wasm_bindgen::to_value(&self.manager.entries)?)
    }

    pub fn get_leaf_id(&self) -> String {
        self.manager.leaf_id.clone()
    }

    pub fn get_root_id(&self) -> String {
        self.manager.root_id.clone()
    }
}
