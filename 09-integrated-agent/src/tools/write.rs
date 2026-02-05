use crate::models::{ToolDefinition, ToolOutput};
use crate::shell::Shell;
use serde_json::json;

pub fn definition() -> ToolDefinition {
    ToolDefinition {
        name: "write".to_string(),
        description: "Write content to a file. Creates the file if it doesn't exist, \
                       overwrites if it does. Automatically creates parent directories."
            .to_string(),
        parameters: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to write (relative to working directory)"
                },
                "content": {
                    "type": "string",
                    "description": "Content to write to the file"
                }
            },
            "required": ["path", "content"]
        }),
    }
}

pub fn execute(shell: &mut Shell, args: &serde_json::Value) -> ToolOutput {
    let path = match args.get("path").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return ToolOutput::err("Missing required parameter: path".to_string()),
    };

    let content = match args.get("content").and_then(|v| v.as_str()) {
        Some(c) => c,
        None => return ToolOutput::err("Missing required parameter: content".to_string()),
    };

    let resolved = shell.resolve_path(path);
    let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

    match shell.fs.write_file(path_refs, content.to_string()) {
        Ok(_) => ToolOutput::ok_with_fs(format!(
            "Successfully wrote {} bytes to {}",
            content.len(),
            path
        )),
        Err(e) => ToolOutput::err(format!("Failed to write {}: {}", path, e)),
    }
}
