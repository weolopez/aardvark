use crate::models::{ToolDefinition, ToolOutput};
use crate::shell::Shell;
use crate::truncate;
use serde_json::json;

const DEFAULT_LIMIT: usize = 1000;

pub fn definition() -> ToolDefinition {
    ToolDefinition {
        name: "find".to_string(),
        description: format!(
            "Search for files by glob pattern. Returns matching file paths. \
             Output is truncated to {} results or {}KB.",
            DEFAULT_LIMIT,
            truncate::MAX_BYTES / 1024
        ),
        parameters: json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to match files, e.g. '*.ts', '**/*.json'"
                },
                "path": {
                    "type": "string",
                    "description": "Directory to search in (default: current directory)"
                },
                "limit": {
                    "type": "number",
                    "description": "Maximum number of results (default: 1000)"
                }
            },
            "required": ["pattern"]
        }),
    }
}

pub fn execute(shell: &mut Shell, args: &serde_json::Value) -> ToolOutput {
    let pattern = match args.get("pattern").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return ToolOutput::err("Missing required parameter: pattern".to_string()),
    };

    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(DEFAULT_LIMIT);

    let search_path = args.get("path").and_then(|v| v.as_str()).unwrap_or(".");

    // Resolve search path
    let resolved = shell.resolve_path(search_path);
    let base = if resolved.is_empty() {
        "".to_string()
    } else {
        resolved.join("/")
    };

    // Get all file paths
    let all_paths = shell.fs.collect_file_paths(&base);

    // Filter by glob pattern
    let mut matches: Vec<String> = all_paths
        .into_iter()
        .filter(|path| {
            // Get just the filename for simple patterns, full path for ** patterns
            let to_match = if pattern.contains('/') || pattern.contains("**") {
                path.clone()
            } else {
                // Match against filename only
                path.rsplit('/').next().unwrap_or(path).to_string()
            };
            glob_match::glob_match(pattern, &to_match)
        })
        .take(limit)
        .collect();

    matches.sort();

    if matches.is_empty() {
        return ToolOutput::ok("No files found matching pattern".to_string());
    }

    let result = matches.join("\n");
    let (output, _) = truncate::truncate_head(&result, truncate::MAX_LINES, truncate::MAX_BYTES);

    let mut final_output = output;
    if matches.len() >= limit {
        final_output += &format!("\n\n[{} results limit reached]", limit);
    }

    ToolOutput::ok(final_output)
}
