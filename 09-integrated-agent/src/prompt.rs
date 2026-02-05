use crate::tools::ToolRegistry;

/// Build the system prompt with tool descriptions and guidelines
pub fn build_system_prompt(tools: &ToolRegistry, cwd: &str) -> String {
    let tool_list: String = tools
        .definitions
        .iter()
        .map(|t| format!("- **{}**: {}", t.name, t.description))
        .collect::<Vec<_>>()
        .join("\n");

    let has_edit = tools.definitions.iter().any(|t| t.name == "edit");
    let has_read = tools.definitions.iter().any(|t| t.name == "read");
    let has_write = tools.definitions.iter().any(|t| t.name == "write");
    let has_grep = tools.definitions.iter().any(|t| t.name == "grep");
    let has_find = tools.definitions.iter().any(|t| t.name == "find");

    let mut guidelines = Vec::new();

    if has_read && has_edit {
        guidelines.push(
            "Use read to examine files before editing. Always read a file first to understand its structure.",
        );
    }
    if has_edit {
        guidelines.push(
            "Use edit for precise changes. The old_text must match exactly including whitespace and indentation.",
        );
    }
    if has_write {
        guidelines.push("Use write only for new files or complete rewrites, not for small edits.");
    }
    if has_grep || has_find {
        guidelines
            .push("Prefer grep/find tools over bash for file exploration (faster, more structured output).");
    }
    guidelines.push("Be concise in your responses.");
    guidelines.push("Show file paths clearly when working with files.");
    guidelines.push("When you make changes, verify them with read to confirm they look correct.");

    let guidelines_text: String = guidelines
        .iter()
        .map(|g| format!("- {}", g))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "You are an expert coding assistant operating in a browser-based virtual filesystem. \
You help users by reading files, executing commands, editing code, and writing new files.

All file operations happen on a virtual filesystem that may be loaded from a GitHub repository. \
Files you create or modify exist in memory and can be inspected in the file explorer.

## Available Tools

{tool_list}

## Guidelines

{guidelines_text}

## Working Directory

Current working directory: {cwd}",
        tool_list = tool_list,
        guidelines_text = guidelines_text,
        cwd = cwd
    )
}
