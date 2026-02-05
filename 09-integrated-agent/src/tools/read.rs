use crate::models::{ToolDefinition, ToolOutput};
use crate::shell::Shell;
use crate::truncate;
use serde_json::json;

pub fn definition() -> ToolDefinition {
    ToolDefinition {
        name: "read".to_string(),
        description: format!(
            "Read the contents of a file. Output is line-numbered and truncated to {} lines or {}KB. \
             Use offset/limit for large files.",
            truncate::MAX_LINES,
            truncate::MAX_BYTES / 1024
        ),
        parameters: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to read (relative to working directory)"
                },
                "offset": {
                    "type": "number",
                    "description": "Line number to start reading from (1-indexed)"
                },
                "limit": {
                    "type": "number",
                    "description": "Maximum number of lines to read"
                }
            },
            "required": ["path"]
        }),
    }
}

pub fn execute(shell: &mut Shell, args: &serde_json::Value) -> ToolOutput {
    let path = match args.get("path").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return ToolOutput::err("Missing required parameter: path".to_string()),
    };

    let offset = args
        .get("offset")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize);
    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize);

    let resolved = shell.resolve_path(path);
    let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

    match shell.fs.read_file_with_lines(path_refs, offset, limit) {
        Ok((content, total_lines, shown_lines)) => {
            // Apply truncation
            let (output, truncated) =
                truncate::truncate_head(&content, truncate::MAX_LINES, truncate::MAX_BYTES);

            let mut result = output;

            // Add file info header
            let header = if let Some(off) = offset {
                format!(
                    "File: {} (lines {}-{} of {})\n\n",
                    path,
                    off,
                    off + shown_lines - 1,
                    total_lines
                )
            } else {
                if shown_lines < total_lines || truncated {
                    format!(
                        "File: {} (showing {} of {} lines)\n\n",
                        path, shown_lines, total_lines
                    )
                } else {
                    format!("File: {} ({} lines)\n\n", path, total_lines)
                }
            };

            result = header + &result;

            // If there are more lines, add a hint
            if shown_lines < total_lines {
                let next_offset = offset.unwrap_or(1) + shown_lines;
                result += &format!(
                    "\n\n[Use offset={} to continue reading]",
                    next_offset
                );
            }

            ToolOutput::ok(result)
        }
        Err(e) => ToolOutput::err(format!("Failed to read {}: {}", path, e)),
    }
}
