// 04-github-worker: GitHub file operations with Rust WASM
//
// Following the hybrid pattern from Project 03:
// - JavaScript handles Octokit API calls (complex async, auth handling)
// - Rust handles path normalization, content encoding/decoding, validation
//
// This mirrors the fs.js functionality but with Rust for data processing

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ============================================================================
// Configuration Types
// ============================================================================

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct GitHubConfig {
    pub owner: String,
    pub repo: String,
    pub branch: String,
    pub path: String,
    pub auth: String,
    pub email: String,
}

impl GitHubConfig {
    pub fn with_defaults(saved: Option<GitHubConfig>) -> Self {
        let saved = saved.unwrap_or_default();
        GitHubConfig {
            owner: if saved.owner.is_empty() {
                "weolopez".to_string()
            } else {
                saved.owner
            },
            repo: if saved.repo.is_empty() {
                "weolopez.github.io".to_string()
            } else {
                saved.repo
            },
            branch: if saved.branch.is_empty() {
                "main".to_string()
            } else {
                saved.branch
            },
            path: if saved.path.is_empty() {
                "".to_string()
            } else {
                saved.path
            },
            auth: saved.auth, // No default for auth token
            email: if saved.email.is_empty() {
                "octocat@github.com".to_string()
            } else {
                saved.email
            },
        }
    }

    pub fn has_auth(&self) -> bool {
        !self.auth.is_empty()
    }
}

// ============================================================================
// File Types
// ============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GitHubFile {
    pub path: String,
    pub name: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha: Option<String>,
    pub status: FileStatus,
    #[serde(rename = "type")]
    pub file_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_synced: Option<u64>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Synced,
    Modified,
    New,
    Deleted,
}

// ============================================================================
// Result Types
// ============================================================================

#[derive(Serialize, Deserialize, Debug)]
pub struct GhResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

impl GhResult {
    pub fn ok(data: Option<serde_json::Value>) -> Self {
        GhResult {
            success: true,
            data,
            error: None,
            error_code: None,
        }
    }

    pub fn err(message: &str, code: Option<&str>) -> Self {
        GhResult {
            success: false,
            data: None,
            error: Some(message.to_string()),
            error_code: code.map(|s| s.to_string()),
        }
    }

    pub fn missing_auth() -> Self {
        GhResult::err(
            "GitHub authentication token is missing. Please configure your token.",
            Some("MISSING_AUTH"),
        )
    }
}

// ============================================================================
// Logging
// ============================================================================

fn log(message: &str) {
    web_sys::console::log_1(&JsValue::from_str(message));
}

// ============================================================================
// WASM-Exposed Functions
// ============================================================================

/// Initialize the WASM module
#[wasm_bindgen]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
    log("GitHub Worker WASM module initialized");
}

/// Parse and validate saved config, applying defaults
#[wasm_bindgen]
pub fn parse_config(config_json: &str) -> String {
    let saved: Option<GitHubConfig> = serde_json::from_str(config_json).ok();
    let config = GitHubConfig::with_defaults(saved);

    serde_json::to_string(&GhResult::ok(Some(serde_json::to_value(&config).unwrap())))
        .unwrap_or_else(|_| r#"{"success":false,"error":"Serialization error"}"#.to_string())
}

/// Validate that config has required auth token
#[wasm_bindgen]
pub fn validate_config(config_json: &str) -> String {
    let config: Result<GitHubConfig, _> = serde_json::from_str(config_json);

    match config {
        Ok(cfg) => {
            if !cfg.has_auth() {
                serde_json::to_string(&GhResult::missing_auth()).unwrap()
            } else if cfg.owner.is_empty() {
                serde_json::to_string(&GhResult::err("Owner is required", Some("INVALID_CONFIG")))
                    .unwrap()
            } else if cfg.repo.is_empty() {
                serde_json::to_string(&GhResult::err(
                    "Repository is required",
                    Some("INVALID_CONFIG"),
                ))
                .unwrap()
            } else {
                serde_json::to_string(&GhResult::ok(None)).unwrap()
            }
        }
        Err(e) => serde_json::to_string(&GhResult::err(
            &format!("Invalid config: {}", e),
            Some("PARSE_ERROR"),
        ))
        .unwrap(),
    }
}

/// Normalize a file path - handles full URLs, leading slashes, etc.
/// This is a Rust port of your normalizePath function
#[wasm_bindgen]
pub fn normalize_path(path: &str, config_json: &str) -> String {
    let result = normalize_path_internal(path, config_json);
    serde_json::to_string(&result)
        .unwrap_or_else(|_| r#"{"success":false,"error":"Serialization error"}"#.to_string())
}

fn normalize_path_internal(path: &str, config_json: &str) -> GhResult {
    if path.is_empty() {
        return GhResult::ok(Some(serde_json::json!("")));
    }

    let config: GitHubConfig = match serde_json::from_str(config_json) {
        Ok(c) => c,
        Err(_) => GitHubConfig::with_defaults(None),
    };

    let normalized = normalize_path_with_config(path, &config);
    GhResult::ok(Some(serde_json::json!(normalized)))
}

fn normalize_path_with_config(path: &str, config: &GitHubConfig) -> String {
    let mut path = path.to_string();

    // Handle URLs
    if path.starts_with("http") || path.starts_with("//") {
        if let Ok(url) = url::Url::parse(&path) {
            let pathname = url.path();

            // Handle raw.githubusercontent.com/OWNER/REPO/BRANCH/PATH
            if url.host_str() == Some("raw.githubusercontent.com") {
                let prefix = format!("/{}/{}/{}/", config.owner, config.repo, config.branch);
                if pathname.starts_with(&prefix) {
                    return pathname[prefix.len()..].to_string();
                }
            }

            // Handle github.com/OWNER/REPO/blob/BRANCH/PATH
            if url.host_str() == Some("github.com") {
                let prefix = format!("/{}/{}/", config.owner, config.repo);
                if pathname.starts_with(&prefix) {
                    let mut rest = pathname[prefix.len()..].to_string();
                    // Remove blob/BRANCH/, tree/BRANCH/, or raw/BRANCH/
                    let patterns = [
                        format!("blob/{}/", config.branch),
                        format!("tree/{}/", config.branch),
                        format!("raw/{}/", config.branch),
                    ];
                    for pattern in &patterns {
                        if rest.starts_with(pattern) {
                            rest = rest[pattern.len()..].to_string();
                            break;
                        }
                    }
                    return rest;
                }
            }

            // Handle API URLs
            if pathname.contains("/contents/") {
                if let Some(pos) = pathname.find("/contents/") {
                    return pathname[pos + 10..].to_string();
                }
            }

            path = pathname.to_string();
        }
    }

    // Remove leading slashes and whitespace
    path.trim_start_matches('/').trim().to_string()
}

/// Encode content to base64 for GitHub API
#[wasm_bindgen]
pub fn encode_content(content: &str) -> String {
    let encoded = BASE64.encode(content.as_bytes());
    serde_json::to_string(&GhResult::ok(Some(serde_json::json!(encoded))))
        .unwrap_or_else(|_| r#"{"success":false,"error":"Encoding error"}"#.to_string())
}

/// Decode base64 content from GitHub API
#[wasm_bindgen]
pub fn decode_content(base64_content: &str) -> String {
    // Remove whitespace (GitHub API returns content with newlines)
    let cleaned: String = base64_content
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();

    match BASE64.decode(&cleaned) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(content) => serde_json::to_string(&GhResult::ok(Some(serde_json::json!(content))))
                .unwrap_or_else(|_| {
                    r#"{"success":false,"error":"Serialization error"}"#.to_string()
                }),
            Err(e) => serde_json::to_string(&GhResult::err(
                &format!("UTF-8 decode error: {}", e),
                Some("DECODE_ERROR"),
            ))
            .unwrap_or_else(|_| r#"{"success":false,"error":"UTF-8 decode error"}"#.to_string()),
        },
        Err(e) => serde_json::to_string(&GhResult::err(
            &format!("Base64 decode error: {}", e),
            Some("DECODE_ERROR"),
        ))
        .unwrap_or_else(|_| r#"{"success":false,"error":"Base64 decode error"}"#.to_string()),
    }
}

/// Create a GitHubFile object from API response data
#[wasm_bindgen]
pub fn parse_file_response(api_response_json: &str, status: &str) -> String {
    let result = (|| -> Result<GhResult, String> {
        let api_data: serde_json::Value = serde_json::from_str(api_response_json)
            .map_err(|e| format!("Failed to parse API response: {}", e))?;

        let path = api_data
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let name = api_data
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| path.split('/').last().unwrap_or(""))
            .to_string();

        let sha = api_data
            .get("sha")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        // Decode content if present
        let content = if let Some(encoded) = api_data.get("content").and_then(|v| v.as_str()) {
            let cleaned: String = encoded.chars().filter(|c| !c.is_whitespace()).collect();
            BASE64
                .decode(&cleaned)
                .ok()
                .and_then(|bytes| String::from_utf8(bytes).ok())
                .unwrap_or_default()
        } else {
            String::new()
        };

        let file_type = api_data
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("file")
            .to_string();

        let file_status = match status {
            "synced" => FileStatus::Synced,
            "modified" => FileStatus::Modified,
            "new" => FileStatus::New,
            "deleted" => FileStatus::Deleted,
            _ => FileStatus::Synced,
        };

        let file = GitHubFile {
            path,
            name,
            content,
            sha,
            status: file_status,
            file_type,
            last_synced: None,
        };

        Ok(GhResult::ok(Some(serde_json::to_value(&file).unwrap())))
    })();

    match result {
        Ok(r) => serde_json::to_string(&r).unwrap(),
        Err(e) => serde_json::to_string(&GhResult::err(&e, Some("PARSE_ERROR"))).unwrap(),
    }
}

/// Validate file data before saving
#[wasm_bindgen]
pub fn validate_file(file_json: &str) -> String {
    let file: Result<GitHubFile, _> = serde_json::from_str(file_json);

    let result = match file {
        Ok(f) => {
            if f.path.is_empty() {
                GhResult::err("File path is required", Some("VALIDATION_ERROR"))
            } else if f.path.contains("..") {
                GhResult::err("Path cannot contain '..'", Some("VALIDATION_ERROR"))
            } else if f.path.starts_with('/') {
                GhResult::err("Path cannot start with '/'", Some("VALIDATION_ERROR"))
            } else {
                GhResult::ok(None)
            }
        }
        Err(e) => GhResult::err(&format!("Invalid file data: {}", e), Some("PARSE_ERROR")),
    };

    serde_json::to_string(&result).unwrap()
}

/// Search files by content (for use with cached files)
#[wasm_bindgen]
pub fn search_files(files_json: &str, query: &str) -> String {
    let result = (|| -> Result<GhResult, String> {
        let files: Vec<GitHubFile> = serde_json::from_str(files_json)
            .map_err(|e| format!("Failed to parse files: {}", e))?;

        let query_lower = query.to_lowercase();

        let matches: Vec<&GitHubFile> = files
            .iter()
            .filter(|f| {
                f.name.to_lowercase().contains(&query_lower)
                    || f.path.to_lowercase().contains(&query_lower)
                    || f.content.to_lowercase().contains(&query_lower)
            })
            .collect();

        Ok(GhResult::ok(Some(serde_json::to_value(&matches).unwrap())))
    })();

    match result {
        Ok(r) => serde_json::to_string(&r).unwrap(),
        Err(e) => serde_json::to_string(&GhResult::err(&e, Some("SEARCH_ERROR"))).unwrap(),
    }
}

/// Get file extension
#[wasm_bindgen]
pub fn get_file_extension(path: &str) -> String {
    let ext = path.rsplit('.').next().unwrap_or("");
    serde_json::to_string(&GhResult::ok(Some(serde_json::json!(ext)))).unwrap()
}

/// Determine if path is likely a directory (heuristic)
#[wasm_bindgen]
pub fn is_likely_directory(path: &str) -> String {
    let is_dir = !path.contains('.') || path.ends_with('/');
    serde_json::to_string(&GhResult::ok(Some(serde_json::json!(is_dir)))).unwrap()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config = GitHubConfig::with_defaults(None);
        assert_eq!(config.owner, "weolopez");
        assert_eq!(config.repo, "weolopez.github.io");
        assert!(!config.has_auth());
    }

    #[test]
    fn test_normalize_path_simple() {
        let config = GitHubConfig::with_defaults(None);
        assert_eq!(
            normalize_path_with_config("/some/path", &config),
            "some/path"
        );
        assert_eq!(
            normalize_path_with_config("  /path/to/file  ", &config),
            "path/to/file"
        );
    }

    #[test]
    fn test_encode_decode() {
        let original = "Hello, World!";
        let encoded = BASE64.encode(original.as_bytes());
        let decoded = BASE64.decode(&encoded).unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), original);
    }

    #[test]
    fn test_file_status_serialization() {
        let file = GitHubFile {
            path: "test.txt".to_string(),
            name: "test.txt".to_string(),
            content: "test".to_string(),
            sha: Some("abc123".to_string()),
            status: FileStatus::Modified,
            file_type: "file".to_string(),
            last_synced: None,
        };
        let json = serde_json::to_string(&file).unwrap();
        assert!(json.contains("\"status\":\"modified\""));
    }
}
