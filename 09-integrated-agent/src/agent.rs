use crate::llm;
use crate::models::*;
use crate::prompt;
use crate::session::SessionManager;
use crate::shell::Shell;
use crate::tools::ToolRegistry;
use wasm_bindgen::prelude::*;

// JS callback for emitting events to the main thread
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_name = "emitAgentEvent")]
    fn emit_agent_event(event_json: &str);

    #[wasm_bindgen(js_name = "persistSessionEntry")]
    fn persist_session_entry(session_id: &str, entry_json: &str);
}

/// Maximum number of tool call rounds before forcing a stop
const MAX_TOOL_ROUNDS: usize = 25;

#[wasm_bindgen]
pub struct CodingAgent {
    api_key: String,
    model: String,
    system_prompt: String,
    history: Vec<ChatMessage>,
    shell: Shell,
    tools: ToolRegistry,
    session: SessionManager,
}

#[wasm_bindgen]
impl CodingAgent {
    #[wasm_bindgen(constructor)]
    pub fn new(api_key: String, model: String) -> CodingAgent {
        let shell = Shell::new();
        let tools = ToolRegistry::all_tools();
        let cwd = shell.get_pwd();
        let system_prompt = prompt::build_system_prompt(&tools, &cwd);
        let session = SessionManager::new(cwd);

        CodingAgent {
            api_key,
            model,
            system_prompt,
            history: Vec::new(),
            shell,
            tools,
            session,
        }
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /// Send a user message and run the full agent loop.
    /// Returns the final text response as a JSON AgentStep.
    pub async fn chat(&mut self, user_message: String) -> Result<String, JsValue> {
        // Add user message to session and history
        let (_, entry_json) = self.session.append_message("user".to_string(), user_message.clone());
        persist_session_entry(&self.session.session_id, &entry_json);

        self.history.push(ChatMessage {
            role: "user".to_string(),
            parts: vec![Part::Text {
                text: user_message,
            }],
        });

        // Run the agent loop
        self.run_loop().await
    }

    /// Load files into the virtual filesystem (e.g., from GitHub)
    pub fn load_files(&mut self, files_json: &str) -> Result<(), JsValue> {
        let files: Vec<VirtualFile> = serde_json::from_str(files_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse files: {}", e)))?;
        self.shell.fs.load_files(files);

        // Update system prompt with current cwd
        self.system_prompt = prompt::build_system_prompt(&self.tools, &self.shell.get_pwd());

        Ok(())
    }

    /// Get the filesystem tree as JSON
    pub fn get_fs_json(&self) -> String {
        serde_json::to_string(&self.shell.fs).unwrap_or("{}".to_string())
    }

    /// Get the current working directory
    pub fn get_pwd(&self) -> String {
        self.shell.get_pwd()
    }

    /// Get session history as JSON
    pub fn get_history(&self) -> Result<JsValue, JsValue> {
        let history = self.session.get_history();
        Ok(serde_wasm_bindgen::to_value(&history)?)
    }

    /// Get full session tree as JSON
    pub fn get_tree(&self) -> Result<JsValue, JsValue> {
        Ok(serde_wasm_bindgen::to_value(self.session.get_all_entries())?)
    }

    /// Branch the session to a specific entry
    pub fn branch(&mut self, entry_id: String) -> Result<(), JsValue> {
        self.session
            .branch(entry_id)
            .map_err(|e| JsValue::from_str(&e))?;

        // Rebuild history from session tree
        self.rebuild_history_from_session();
        Ok(())
    }

    /// Get session leaf ID
    pub fn get_leaf_id(&self) -> String {
        self.session.leaf_id.clone()
    }

    /// Get session root ID
    pub fn get_root_id(&self) -> String {
        self.session.root_id.clone()
    }

    /// Clear history and start fresh
    pub fn clear_history(&mut self) {
        self.history.clear();
        let cwd = self.shell.get_pwd();
        self.session = SessionManager::new(cwd.clone());
        self.system_prompt = prompt::build_system_prompt(&self.tools, &cwd);
    }

    // ========================================================================
    // Internal: Agent Loop
    // ========================================================================

    async fn run_loop(&mut self) -> Result<String, JsValue> {
        let mut rounds = 0;

        loop {
            rounds += 1;
            if rounds > MAX_TOOL_ROUNDS {
                let step = AgentStep::error(
                    "Maximum tool call rounds reached. Please try a simpler request.".to_string(),
                );
                let json = serde_json::to_string(&step).unwrap();
                emit_agent_event(&json);
                return Ok(json);
            }

            // Call the LLM
            let step = self.call_llm().await?;
            let step_json = serde_json::to_string(&step).unwrap();

            match step.step_type.as_str() {
                "text" => {
                    // Final text response — save to session and return
                    if let Some(ref content) = step.content {
                        let (_, entry_json) = self
                            .session
                            .append_message("assistant".to_string(), content.clone());
                        persist_session_entry(&self.session.session_id, &entry_json);
                    }

                    emit_agent_event(&step_json);
                    return Ok(step_json);
                }
                "tool_call" => {
                    // Emit the tool call step
                    emit_agent_event(&step_json);

                    // Execute each tool call
                    if let Some(ref calls) = step.tool_calls {
                        for call in calls {
                            // Emit tool execution start
                            let start_event = serde_json::to_string(&serde_json::json!({
                                "type": "tool_exec_start",
                                "tool_name": call.name,
                                "args": call.args,
                            }))
                            .unwrap();
                            emit_agent_event(&start_event);

                            // Execute the tool
                            let result = self.tools.execute(&mut self.shell, &call.name, &call.args);

                            // Add tool result to LLM history
                            let result_value: serde_json::Value =
                                serde_json::from_str(&format!(
                                    "{{\"result\": {}}}",
                                    serde_json::to_string(&result.content).unwrap()
                                ))
                                .unwrap_or(serde_json::json!({"result": result.content}));

                            self.history.push(ChatMessage {
                                role: "function".to_string(),
                                parts: vec![Part::FunctionResponse {
                                    function_response: FunctionResponse {
                                        name: call.name.clone(),
                                        response: FunctionResponseContent {
                                            name: call.name.clone(),
                                            content: result_value,
                                        },
                                    },
                                }],
                            });

                            // Emit tool result event
                            let result_step =
                                AgentStep::tool_result(call.name.clone(), result.content.clone(), result.is_error);
                            let result_json = serde_json::to_string(&result_step).unwrap();
                            emit_agent_event(&result_json);

                            // Update system prompt if cwd changed or fs changed
                            if result.fs_changed {
                                self.system_prompt = prompt::build_system_prompt(
                                    &self.tools,
                                    &self.shell.get_pwd(),
                                );
                            }
                        }
                    }
                    // Loop continues — next LLM call with tool results
                }
                "error" => {
                    emit_agent_event(&step_json);
                    return Ok(step_json);
                }
                _ => {
                    emit_agent_event(&step_json);
                    return Ok(step_json);
                }
            }
        }
    }

    async fn call_llm(&mut self) -> Result<AgentStep, JsValue> {
        let request = GeminiRequest {
            contents: self.history.clone(),
            tools: Some(vec![GeminiTool {
                function_declarations: self.tools.to_gemini_declarations(),
            }]),
            system_instruction: Some(GeminiSystemInstruction {
                parts: vec![GeminiTextPart {
                    text: self.system_prompt.clone(),
                }],
            }),
        };

        let response = llm::call_gemini_api(&self.api_key, &self.model, &request)
            .await
            .map_err(|e| JsValue::from_str(&e))?;

        if let Some(error) = response.error {
            return Ok(AgentStep::error(format!(
                "Gemini API Error: {}",
                error.message
            )));
        }

        if let Some(candidates) = response.candidates {
            if let Some(candidate) = candidates.first() {
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
                    return Ok(AgentStep::tool_call(
                        tool_calls,
                        if text_content.is_empty() {
                            None
                        } else {
                            Some(text_content)
                        },
                    ));
                } else {
                    return Ok(AgentStep::text(text_content));
                }
            }
        }

        Ok(AgentStep::error("No response from LLM".to_string()))
    }

    /// Rebuild LLM history from the session tree's current branch
    fn rebuild_history_from_session(&mut self) {
        self.history.clear();
        let entries = self.session.get_history();

        for entry in entries {
            if let SessionEntry::Message(msg) = entry {
                let role = match msg.role.as_str() {
                    "user" => "user",
                    "assistant" | "model" => "model",
                    _ => continue,
                };

                self.history.push(ChatMessage {
                    role: role.to_string(),
                    parts: vec![Part::Text {
                        text: msg.content,
                    }],
                });
            }
        }
    }
}
