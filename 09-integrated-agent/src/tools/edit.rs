use crate::models::{ToolDefinition, ToolOutput};
use crate::shell::Shell;
use serde_json::json;

pub fn definition() -> ToolDefinition {
    ToolDefinition {
        name: "edit".to_string(),
        description: "Edit a file by replacing exact text. The old_text must match exactly \
                       (including whitespace). Use this for precise, surgical edits. \
                       Will try fuzzy matching if exact match fails."
            .to_string(),
        parameters: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to edit"
                },
                "old_text": {
                    "type": "string",
                    "description": "Exact text to find and replace (must match exactly)"
                },
                "new_text": {
                    "type": "string",
                    "description": "New text to replace the old text with"
                }
            },
            "required": ["path", "old_text", "new_text"]
        }),
    }
}

pub fn execute(shell: &mut Shell, args: &serde_json::Value) -> ToolOutput {
    let path = match args.get("path").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return ToolOutput::err("Missing required parameter: path".to_string()),
    };
    let old_text = match args.get("old_text").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return ToolOutput::err("Missing required parameter: old_text".to_string()),
    };
    let new_text = match args.get("new_text").and_then(|v| v.as_str()) {
        Some(t) => t,
        None => return ToolOutput::err("Missing required parameter: new_text".to_string()),
    };

    let resolved = shell.resolve_path(path);
    let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

    // Read the file
    let content = match shell.fs.read_file(path_refs.clone()) {
        Ok(c) => c,
        Err(e) => return ToolOutput::err(format!("File not found: {} ({})", path, e)),
    };

    // Normalize line endings to LF for matching
    let normalized = normalize_to_lf(&content);
    let normalized_old = normalize_to_lf(old_text);
    let normalized_new = normalize_to_lf(new_text);

    // Try exact match first
    let match_result = find_match(&normalized, &normalized_old);

    match match_result {
        MatchResult::NotFound => {
            ToolOutput::err(format!(
                "Could not find the exact text in {}. The old_text must match exactly \
                 including all whitespace and newlines.",
                path
            ))
        }
        MatchResult::Multiple(count) => {
            ToolOutput::err(format!(
                "Found {} occurrences of the text in {}. The text must be unique. \
                 Please provide more context to make it unique.",
                count, path
            ))
        }
        MatchResult::Found { index, match_len, content_for_replacement } => {
            // Perform replacement
            let new_content = format!(
                "{}{}{}",
                &content_for_replacement[..index],
                normalized_new,
                &content_for_replacement[index + match_len..]
            );

            if content_for_replacement == new_content {
                return ToolOutput::err(format!(
                    "No changes made to {}. The replacement produced identical content.",
                    path
                ));
            }

            // Write back
            match shell.fs.write_file(path_refs, new_content.clone()) {
                Ok(_) => {
                    // Generate a simple diff for the response
                    let diff = generate_diff(&content_for_replacement, &new_content, path);
                    ToolOutput::ok_with_fs(diff)
                }
                Err(e) => ToolOutput::err(format!("Failed to write {}: {}", path, e)),
            }
        }
    }
}

// ============================================================================
// Matching Logic (ported from edit-diff.ts)
// ============================================================================

enum MatchResult {
    NotFound,
    Multiple(usize),
    Found {
        index: usize,
        match_len: usize,
        content_for_replacement: String,
    },
}

fn find_match(content: &str, old_text: &str) -> MatchResult {
    // Try exact match
    if let Some(index) = content.find(old_text) {
        // Check uniqueness
        let count = content.matches(old_text).count();
        if count > 1 {
            return MatchResult::Multiple(count);
        }
        return MatchResult::Found {
            index,
            match_len: old_text.len(),
            content_for_replacement: content.to_string(),
        };
    }

    // Try fuzzy match
    let fuzzy_content = normalize_for_fuzzy_match(content);
    let fuzzy_old = normalize_for_fuzzy_match(old_text);

    if let Some(index) = fuzzy_content.find(&fuzzy_old) {
        let count = fuzzy_content.matches(&fuzzy_old).count();
        if count > 1 {
            return MatchResult::Multiple(count);
        }
        return MatchResult::Found {
            index,
            match_len: fuzzy_old.len(),
            content_for_replacement: fuzzy_content,
        };
    }

    MatchResult::NotFound
}

fn normalize_to_lf(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn normalize_for_fuzzy_match(text: &str) -> String {
    let trimmed: Vec<&str> = text.lines().map(|line| line.trim_end()).collect();
    let joined = trimmed.join("\n");

    joined
        // Smart single quotes → '
        .replace('\u{2018}', "'")
        .replace('\u{2019}', "'")
        .replace('\u{201A}', "'")
        .replace('\u{201B}', "'")
        // Smart double quotes → "
        .replace('\u{201C}', "\"")
        .replace('\u{201D}', "\"")
        .replace('\u{201E}', "\"")
        .replace('\u{201F}', "\"")
        // Various dashes → -
        .replace('\u{2010}', "-")
        .replace('\u{2011}', "-")
        .replace('\u{2012}', "-")
        .replace('\u{2013}', "-")
        .replace('\u{2014}', "-")
        .replace('\u{2015}', "-")
        .replace('\u{2212}', "-")
        // Special spaces → regular space
        .replace('\u{00A0}', " ")
}

// ============================================================================
// Diff Generation
// ============================================================================

fn generate_diff(old_content: &str, new_content: &str, path: &str) -> String {
    let old_lines: Vec<&str> = old_content.split('\n').collect();
    let new_lines: Vec<&str> = new_content.split('\n').collect();

    let mut output = Vec::new();
    output.push(format!("--- {}", path));
    output.push(format!("+++ {}", path));

    // Simple diff: find first and last differing lines
    let max_len = old_lines.len().max(new_lines.len());
    let mut first_diff = None;
    let mut last_diff = 0;

    for i in 0..max_len {
        let old = old_lines.get(i).unwrap_or(&"");
        let new = new_lines.get(i).unwrap_or(&"");
        if old != new {
            if first_diff.is_none() {
                first_diff = Some(i);
            }
            last_diff = i;
        }
    }

    if let Some(first) = first_diff {
        let context = 3;
        let start = first.saturating_sub(context);
        let end = (last_diff + context + 1).min(max_len);

        let line_width = format!("{}", end).len();

        // Context before
        for i in start..first {
            if let Some(line) = old_lines.get(i) {
                output.push(format!(" {:>width$} | {}", i + 1, line, width = line_width));
            }
        }

        // Changed lines from old
        for i in first..=(last_diff.min(old_lines.len().saturating_sub(1))) {
            if let Some(line) = old_lines.get(i) {
                output.push(format!("-{:>width$} | {}", i + 1, line, width = line_width));
            }
        }

        // Changed lines from new
        for i in first..=(last_diff.min(new_lines.len().saturating_sub(1))) {
            if let Some(line) = new_lines.get(i) {
                output.push(format!("+{:>width$} | {}", i + 1, line, width = line_width));
            }
        }

        // Context after
        for i in (last_diff + 1)..end {
            if let Some(line) = new_lines.get(i) {
                output.push(format!(" {:>width$} | {}", i + 1, line, width = line_width));
            }
        }
    }

    output.join("\n")
}
