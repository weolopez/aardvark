/// Maximum lines returned by read tool
pub const MAX_LINES: usize = 2000;
/// Maximum bytes returned by any tool
pub const MAX_BYTES: usize = 50 * 1024; // 50KB

/// Truncate content from the head (keep first N lines/bytes).
pub fn truncate_head(content: &str, max_lines: usize, max_bytes: usize) -> (String, bool) {
    let total_bytes = content.len();
    let lines: Vec<&str> = content.split('\n').collect();
    let total_lines = lines.len();

    if total_lines <= max_lines && total_bytes <= max_bytes {
        return (content.to_string(), false);
    }

    // Take up to max_lines
    let mut kept_lines = max_lines.min(total_lines);
    let mut result = lines[..kept_lines].join("\n");

    // Check byte limit
    while result.len() > max_bytes && kept_lines > 1 {
        kept_lines -= 1;
        result = lines[..kept_lines].join("\n");
    }

    let notice = format!(
        "\n\n[Truncated: showing {}/{} lines, {}/{}KB]",
        kept_lines,
        total_lines,
        result.len() / 1024,
        total_bytes / 1024
    );

    (result + &notice, true)
}

/// Truncate content from the tail (keep last N lines/bytes).
pub fn truncate_tail(content: &str, max_lines: usize, max_bytes: usize) -> (String, bool) {
    let total_bytes = content.len();
    let lines: Vec<&str> = content.split('\n').collect();
    let total_lines = lines.len();

    if total_lines <= max_lines && total_bytes <= max_bytes {
        return (content.to_string(), false);
    }

    let start = total_lines.saturating_sub(max_lines);
    let mut result = lines[start..].join("\n");

    // Check byte limit
    let mut actual_start = start;
    while result.len() > max_bytes && actual_start < total_lines - 1 {
        actual_start += 1;
        result = lines[actual_start..].join("\n");
    }

    let notice = format!(
        "[Truncated: showing last {}/{} lines, {}/{}KB]\n\n",
        total_lines - actual_start,
        total_lines,
        result.len() / 1024,
        total_bytes / 1024
    );

    (notice + &result, true)
}

/// Format byte count as human-readable
pub fn format_size(bytes: usize) -> String {
    if bytes < 1024 {
        format!("{}B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1}KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1}MB", bytes as f64 / (1024.0 * 1024.0))
    }
}
