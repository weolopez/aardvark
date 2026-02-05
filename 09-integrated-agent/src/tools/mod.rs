pub mod read;
pub mod write;
pub mod edit;
pub mod bash;
pub mod grep;
pub mod find;
pub mod commit;

use crate::models::{FunctionDeclaration, ToolDefinition, ToolOutput};
use crate::shell::Shell;

/// Tool registry — holds definitions and dispatches execution
pub struct ToolRegistry {
    pub definitions: Vec<ToolDefinition>,
}

impl ToolRegistry {
    /// Create a registry with the default coding tools (read, write, edit, bash)
    pub fn coding_tools() -> Self {
        ToolRegistry {
            definitions: vec![
                read::definition(),
                write::definition(),
                edit::definition(),
                bash::definition(),
            ],
        }
    }

    /// Create a registry with all tools including grep, find, and commit
    pub fn all_tools() -> Self {
        ToolRegistry {
            definitions: vec![
                read::definition(),
                write::definition(),
                edit::definition(),
                bash::definition(),
                grep::definition(),
                find::definition(),
                commit::definition(),
            ],
        }
    }

    /// Check if a tool name is handled externally (async JS)
    pub fn is_external_tool(&self, name: &str) -> bool {
        name == "commit"
    }

    /// Execute a tool by name
    pub fn execute(
        &self,
        shell: &mut Shell,
        name: &str,
        args: &serde_json::Value,
    ) -> ToolOutput {
        match name {
            "read" => read::execute(shell, args),
            "write" => write::execute(shell, args),
            "edit" => edit::execute(shell, args),
            "bash" => bash::execute(shell, args),
            "grep" => grep::execute(shell, args),
            "find" => find::execute(shell, args),
            _ => ToolOutput::err(format!("Unknown tool: {}", name)),
        }
    }

    /// Convert to Gemini API function declarations
    pub fn to_gemini_declarations(&self) -> Vec<FunctionDeclaration> {
        self.definitions
            .iter()
            .map(|d| FunctionDeclaration {
                name: d.name.clone(),
                description: d.description.clone(),
                parameters: Some(d.parameters.clone()),
            })
            .collect()
    }
}
