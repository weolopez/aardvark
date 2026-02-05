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
    let has_commit = tools.definitions.iter().any(|t| t.name == "commit");

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
    if has_commit {
        guidelines.push(
            "After making file changes, use the commit tool to push them to GitHub. \
             The commit tool will return the GitHub URLs of committed files.",
        );
        guidelines.push(
            "When asked if changes are on GitHub or for a file URL, use commit to push first, \
             then construct the URL as: https://github.com/{owner}/{repo}/blob/{branch}/{path}",
        );
    }
    guidelines.push("Be concise in your responses.");
    guidelines.push("Show file paths clearly when working with files.");
    guidelines.push("When you make changes, verify them with read to confirm they look correct.");
    guidelines.push("Never say you cannot do something. Always try to find a solution using the available tools.");

    let guidelines_text: String = guidelines
        .iter()
        .map(|g| format!("- {}", g))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "You are an expert coding assistant with access to a filesystem backed by a GitHub repository. \
You help users by reading files, executing commands, editing code, writing new files, and committing changes to GitHub.

The filesystem is loaded from a GitHub repository. When you create or modify files, those changes \
can be committed back to GitHub using the commit tool. You have full read and write access to the repository.

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
