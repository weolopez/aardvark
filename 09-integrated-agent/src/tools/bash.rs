use crate::models::{ToolDefinition, ToolOutput};
use crate::shell::Shell;
use crate::truncate;
use serde_json::json;

pub fn definition() -> ToolDefinition {
    ToolDefinition {
        name: "bash".to_string(),
        description: "Execute a shell command in the virtual filesystem. Supports: \
                       ls, cd, pwd, mkdir, touch, echo, cat, rm, tree. \
                       Output is truncated to 50KB."
            .to_string(),
        parameters: json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute"
                }
            },
            "required": ["command"]
        }),
    }
}

pub fn execute(shell: &mut Shell, args: &serde_json::Value) -> ToolOutput {
    let command = match args.get("command").and_then(|v| v.as_str()) {
        Some(c) => c,
        None => return ToolOutput::err("Missing required parameter: command".to_string()),
    };

    let result = shell.execute(command);

    if let Some(stderr) = &result.stderr {
        return ToolOutput::err(stderr.clone());
    }

    let (output, _truncated) =
        truncate::truncate_tail(&result.stdout, truncate::MAX_LINES, truncate::MAX_BYTES);

    if result.fs_changed {
        ToolOutput::ok_with_fs(output)
    } else {
        ToolOutput::ok(output)
    }
}
