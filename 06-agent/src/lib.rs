mod llm;

use llm::{ChatMessage, FunctionCall, FunctionDeclaration, GeminiRequest, Part, Tool};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ============================================================================
// Public Types
// ============================================================================

#[derive(Serialize, Deserialize)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Serialize, Deserialize)]
pub struct AgentStep {
    #[serde(rename = "type")]
    pub type_: String, // "text" or "tool_call" or "error"
    pub content: Option<String>,
    pub tool_calls: Option<Vec<FunctionCall>>,
}

// ============================================================================
// Agent Struct
// ============================================================================

#[wasm_bindgen]
pub struct Agent {
    api_key: String,
    model: String,
    system_prompt: String,
    history: Vec<ChatMessage>,
    tools: Vec<ToolDefinition>,
}

#[wasm_bindgen]
impl Agent {
    #[wasm_bindgen(constructor)]
    pub fn new(api_key: String, model: String, system_prompt: String) -> Agent {
        Agent {
            api_key,
            model,
            system_prompt,
            history: Vec::new(),
            tools: Vec::new(),
        }
    }

    pub fn set_tools(&mut self, tools_json: &str) -> Result<(), JsValue> {
        let tools: Vec<ToolDefinition> = serde_json::from_str(tools_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse tools: {}", e)))?;
        self.tools = tools;
        Ok(())
    }

    pub fn get_history(&self) -> String {
        serde_json::to_string(&self.history).unwrap_or_default()
    }

    pub fn clear_history(&mut self) {
        self.history.clear();
    }

    /// Start a new turn with a user message
    pub async fn chat(&mut self, user_message: String) -> Result<JsValue, JsValue> {
        // Add user message to history
        self.history.push(ChatMessage {
            role: "user".to_string(),
            parts: vec![Part::Text { text: user_message }],
        });

        self.run_step().await
    }

    /// Continue the conversation (e.g., after adding tool results)
    pub async fn run_step(&mut self) -> Result<JsValue, JsValue> {
        // Prepare request
        let mut contents = self.history.clone();
        
        // Inject system prompt if not empty and this is the start of a fresh request
        // For simplicity, we just ensure the first message, if user, has the system prompt prepended.
        // Or better: Use the "system" role if supported, or just prepend to history for the API call only.
        if !self.system_prompt.is_empty() {
             // Create a system message (Gemini often accepts this or it can be the first user part)
             // We'll insert it at the beginning of the contents sent to API (not stored in history to avoid duplication)
             // Note: Proper Gemini API has `system_instruction` field. We are using `contents`.
             // We will prepend a user message with the system prompt to guide behavior.
             contents.insert(0, ChatMessage {
                 role: "user".to_string(),
                 parts: vec![Part::Text { text: format!("System Instruction: {}", self.system_prompt) }],
             });
             // Then we need to make sure the next message is "model" (if history was empty) 
             // or if history started with "user", we now have "user", "user". Gemini merges them.
        }

        // Prepare tools
        let tools = if self.tools.is_empty() {
            None
        } else {
            let funcs: Vec<FunctionDeclaration> = self.tools.iter().map(|t| FunctionDeclaration {
                name: t.name.clone(),
                description: t.description.clone(),
                parameters: Some(t.parameters.clone()),
            }).collect();
            
            Some(vec![Tool {
                function_declarations: funcs,
            }])
        };

        let request = GeminiRequest {
            contents,
            tools,
        };

        // Call API
        let response = llm::call_gemini_api(&self.api_key, &self.model, &request)
            .await
            .map_err(|e| JsValue::from_str(&e))?;

        if let Some(error) = response.error {
            return Err(JsValue::from_str(&format!("Gemini API Error: {}", error.message)));
        }

        // Parse Response
        if let Some(candidates) = response.candidates {
            if let Some(candidate) = candidates.first() {
                // Determine step type
                let mut tool_calls = Vec::new();
                let mut text_content = String::new();

                for part in &candidate.content.parts {
                    match part {
                        Part::FunctionCall { function_call } => {
                            tool_calls.push(function_call.clone());
                        }
                        Part::Text { text } => {
                            text_content.push_str(text);
                        }
                        _ => {}
                    }
                }

                // Add assistant response to history
                self.history.push(ChatMessage {
                    role: "model".to_string(),
                    parts: candidate.content.parts.clone(),
                });

                if !tool_calls.is_empty() {
                    let step = AgentStep {
                        type_: "tool_call".to_string(),
                        content: if text_content.is_empty() { None } else { Some(text_content) },
                        tool_calls: Some(tool_calls),
                    };
                    return Ok(serde_json::to_string(&step).unwrap().into());
                } else {
                    let step = AgentStep {
                        type_: "text".to_string(),
                        content: Some(text_content),
                        tool_calls: None,
                    };
                    return Ok(serde_json::to_string(&step).unwrap().into());
                }
            }
        }

        Err(JsValue::from_str("No candidates returned"))
    }

    /// Feed back a tool result
    pub fn add_tool_result(&mut self, tool_name: String, result_json: String) -> Result<(), JsValue> {
        let result_value: serde_json::Value = serde_json::from_str(&result_json)
            .map_err(|e| JsValue::from_str(&format!("Invalid JSON result: {}", e)))?;

        // Construct FunctionResponse
        let part = Part::FunctionResponse {
            function_response: llm::FunctionResponse {
                name: tool_name.clone(),
                response: llm::FunctionResponseContent {
                    name: tool_name,
                    content: result_value,
                },
            },
        };

        self.history.push(ChatMessage {
            role: "function".to_string(), // Gemini uses 'function' role for results
            parts: vec![part],
        });

        Ok(())
    }
}
