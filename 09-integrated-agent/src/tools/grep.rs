use crate::models::{ToolDefinition, ToolOutput};
use crate::shell::Shell;
use crate::truncate;
use serde_json::json;

const DEFAULT_LIMIT: usize = 100;

pub fn definition() -> ToolDefinition {
    ToolDefinition {
        name: "grep".to_string(),
        description: format!(
            "Search file contents for a pattern. Returns matching lines with file paths \
             and line numbers. Output is truncated to {} matches or {}KB.",
            DEFAULT_LIMIT,
            truncate::MAX_BYTES / 1024
        ),
        parameters: json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Search pattern (regex or literal string)"
                },
                "path": {
                    "type": "string",
                    "description": "Directory or file to search (default: current directory)"
                },
                "ignore_case": {
                    "type": "boolean",
                    "description": "Case-insensitive search (default: false)"
                },
                "limit": {
                    "type": "number",
                    "description": "Maximum number of matches to return (default: 100)"
                }
            },
            "required": ["pattern"]
        }),
    }
}

pub fn execute(shell: &mut Shell, args: &serde_json::Value) -> ToolOutput {
    let pattern_str = match args.get("pattern").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return ToolOutput::err("Missing required parameter: pattern".to_string()),
    };

    let ignore_case = args
        .get("ignore_case")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(DEFAULT_LIMIT);

    let search_path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");

    // Build regex
    let regex_pattern = if ignore_case {
        format!("(?i){}", pattern_str)
    } else {
        pattern_str.to_string()
    };

    let regex = match regex::Regex::new(&regex_pattern) {
        Ok(r) => r,
        Err(_) => {
            // Fall back to literal match if not valid regex
            match regex::Regex::new(&regex::escape(pattern_str)) {
                Ok(r) => r,
                Err(e) => return ToolOutput::err(format!("Invalid pattern: {}", e)),
            }
        }
    };

    // Resolve search path relative to cwd
    let resolved = shell.resolve_path(search_path);
    let base = if resolved.is_empty() {
        "".to_string()
    } else {
        resolved.join("/")
    };

    let matches = shell.fs.grep(&regex, &base, limit);

    if matches.is_empty() {
        return ToolOutput::ok("No matches found".to_string());
    }

    let result = matches.join("\n");
    let (output, _) = truncate::truncate_head(&result, truncate::MAX_LINES, truncate::MAX_BYTES);

    let mut final_output = output;
    if matches.len() >= limit {
        final_output += &format!("\n\n[{} results limit reached]", limit);
    }

    ToolOutput::ok(final_output)
}
