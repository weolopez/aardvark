use crate::llm::{LLMClient, Message, ToolDefinition};
use crate::session::SessionTree;
use crate::tools::ToolDispatcher;
use serde::{Deserialize, Serialize};

pub struct AgentCore {
    llm_client: LLMClient,
    tool_dispatcher: ToolDispatcher,
    config: Option<crate::AgentConfig>,
}

impl AgentCore {
    pub fn new() -> Self {
        Self {
            llm_client: LLMClient::new(),
            tool_dispatcher: ToolDispatcher::new(),
            config: None,
        }
    }

    pub fn initialize(&mut self, config: crate::AgentConfig) {
        self.config = Some(config.clone());
        self.llm_client.initialize(config);
    }

    pub fn process_message(&mut self, text: String, session: &mut SessionTree) -> AgentResponse {
        // Add user message to session
        session.append_message("user".to_string(), text);

        // Build context from session
        let messages = session.build_context();
        let tools = self.get_tools();

        // Call LLM
        let llm_response = self.llm_client.send_request(messages, Some(tools));

        // Process response
        let response = match llm_response {
            Ok(resp) => {
                // Check if tool calls are needed
                if let Some(tool_calls) = resp.tool_calls {
                    AgentResponse {
                        content: "Executing tools...".to_string(),
                        tool_calls: Some(tool_calls),
                        done: false,
                    }
                } else {
                    // Add assistant message to session
                    session.append_message("assistant".to_string(), resp.content.clone());

                    AgentResponse {
                        content: resp.content,
                        tool_calls: None,
                        done: true,
                    }
                }
            }
            Err(e) => AgentResponse {
                content: format!("Error: {}", e),
                tool_calls: None,
                done: true,
            },
        };

        response
    }

    pub fn process_tool_result(
        &mut self,
        result: ToolResult,
        session: &mut SessionTree,
    ) -> AgentResponse {
        // Add tool result to session
        session.add_tool_result(result.tool_name, result.output);

        // Continue conversation with updated context
        let messages = session.build_context();
        let tools = self.get_tools();

        let llm_response = self.llm_client.send_request(messages, Some(tools));

        match llm_response {
            Ok(resp) => {
                if resp.tool_calls.is_none() {
                    session.append_message("assistant".to_string(), resp.content.clone());
                }

                AgentResponse {
                    content: resp.content,
                    tool_calls: resp.tool_calls,
                    done: resp.tool_calls.is_none(),
                }
            }
            Err(e) => AgentResponse {
                content: format!("Error: {}", e),
                tool_calls: None,
                done: true,
            },
        }
    }

    pub fn get_tools(&self) -> Vec<ToolDefinition> {
        self.tool_dispatcher.get_tool_definitions()
    }
}

#[derive(Serialize, Deserialize)]
pub struct AgentResponse {
    pub content: String,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub done: bool,
}

#[derive(Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Serialize, Deserialize)]
pub struct ToolResult {
    pub tool_name: String,
    pub output: String,
    pub error: Option<String>,
}
