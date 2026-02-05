use crate::models::ToolDefinition;
use serde_json::json;

pub fn definition() -> ToolDefinition {
    ToolDefinition {
        name: "commit".to_string(),
        description: "Commit changed files to the GitHub repository. Returns the GitHub URLs \
                       of committed files. Use this after writing or editing files to push \
                       changes to the remote repository."
            .to_string(),
        parameters: json!({
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "Git commit message describing the changes"
                }
            },
            "required": ["message"]
        }),
    }
}
