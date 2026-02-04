// 03-kv-worker: IndexedDB Key-Value Store with Rust Validation
//
// This project teaches the HYBRID ARCHITECTURE:
// - JavaScript handles IndexedDB (complex callbacks, transactions)
// - Rust handles data validation, transformation, search
//
// Why hybrid?
// - IndexedDB has a callback-based API that's awkward in Rust
// - Rust excels at data processing, validation, search
// - Best of both worlds!

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ============================================================================
// Types
// ============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct KVEntry {
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct KVResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
}

impl KVResult {
    pub fn ok(value: Option<serde_json::Value>) -> Self {
        KVResult {
            success: true,
            value,
            error: None,
            error_code: None,
        }
    }

    pub fn err(error: &str, code: Option<&str>) -> Self {
        KVResult {
            success: false,
            value: None,
            error: Some(error.to_string()),
            error_code: code.map(|s| s.to_string()),
        }
    }
}

// ============================================================================
// Logging
// ============================================================================

fn log(message: &str) {
    web_sys::console::log_1(&JsValue::from_str(message));
}

// ============================================================================
// WASM Functions
// ============================================================================

/// Initialize the WASM module
#[wasm_bindgen]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
    log("KV Worker WASM module initialized!");
}

/// Validate a key (not empty, no special chars)
#[wasm_bindgen]
pub fn validate_key(key: &str) -> String {
    let result = if key.is_empty() {
        KVResult::err("Key cannot be empty", Some("EMPTY_KEY"))
    } else if key.len() > 256 {
        KVResult::err("Key too long (max 256 chars)", Some("KEY_TOO_LONG"))
    } else if key.contains('\0') {
        KVResult::err("Key cannot contain null characters", Some("INVALID_KEY"))
    } else {
        KVResult::ok(None)
    };

    serde_json::to_string(&result).unwrap()
}

/// Validate a value (must be valid JSON, not too large)
#[wasm_bindgen]
pub fn validate_value(value_json: &str) -> String {
    let result = match serde_json::from_str::<serde_json::Value>(value_json) {
        Ok(_) => {
            if value_json.len() > 10 * 1024 * 1024 {
                // 10MB limit
                KVResult::err("Value too large (max 10MB)", Some("VALUE_TOO_LARGE"))
            } else {
                KVResult::ok(None)
            }
        }
        Err(e) => KVResult::err(&format!("Invalid JSON: {}", e), Some("INVALID_JSON")),
    };

    serde_json::to_string(&result).unwrap()
}

/// Transform/normalize a value before storing
#[wasm_bindgen]
pub fn transform_value(value_json: &str) -> String {
    let result = match serde_json::from_str::<serde_json::Value>(value_json) {
        Ok(value) => {
            // Could do transformations here (trim strings, normalize dates, etc.)
            KVResult::ok(Some(value))
        }
        Err(e) => KVResult::err(&format!("Invalid JSON: {}", e), Some("PARSE_ERROR")),
    };

    serde_json::to_string(&result).unwrap()
}

/// Search values containing a string
#[wasm_bindgen]
pub fn search_values(entries_json: &str, search_str: &str) -> String {
    let result = (|| -> Result<KVResult, String> {
        let entries: Vec<KVEntry> = serde_json::from_str(entries_json)
            .map_err(|e| format!("Failed to parse entries: {}", e))?;

        let search_lower = search_str.to_lowercase();

        let matches: Vec<&KVEntry> = entries
            .iter()
            .filter(|entry| {
                // Search in key
                if entry.key.to_lowercase().contains(&search_lower) {
                    return true;
                }
                // Search in value (convert to string)
                let value_str = serde_json::to_string(&entry.value).unwrap_or_default();
                value_str.to_lowercase().contains(&search_lower)
            })
            .collect();

        Ok(KVResult::ok(Some(serde_json::to_value(&matches).unwrap())))
    })();

    match result {
        Ok(r) => serde_json::to_string(&r).unwrap(),
        Err(e) => serde_json::to_string(&KVResult::err(&e, Some("SEARCH_ERROR"))).unwrap(),
    }
}

/// Filter entries by key prefix
#[wasm_bindgen]
pub fn filter_by_prefix(entries_json: &str, prefix: &str) -> String {
    let result = (|| -> Result<KVResult, String> {
        let entries: Vec<KVEntry> = serde_json::from_str(entries_json)
            .map_err(|e| format!("Failed to parse entries: {}", e))?;

        let matches: Vec<&KVEntry> = entries
            .iter()
            .filter(|entry| entry.key.starts_with(prefix))
            .collect();

        Ok(KVResult::ok(Some(serde_json::to_value(&matches).unwrap())))
    })();

    match result {
        Ok(r) => serde_json::to_string(&r).unwrap(),
        Err(e) => serde_json::to_string(&KVResult::err(&e, Some("FILTER_ERROR"))).unwrap(),
    }
}

/// Sort entries by key
#[wasm_bindgen]
pub fn sort_entries(entries_json: &str, ascending: bool) -> String {
    let result = (|| -> Result<KVResult, String> {
        let mut entries: Vec<KVEntry> = serde_json::from_str(entries_json)
            .map_err(|e| format!("Failed to parse entries: {}", e))?;

        if ascending {
            entries.sort_by(|a, b| a.key.cmp(&b.key));
        } else {
            entries.sort_by(|a, b| b.key.cmp(&a.key));
        }

        Ok(KVResult::ok(Some(serde_json::to_value(&entries).unwrap())))
    })();

    match result {
        Ok(r) => serde_json::to_string(&r).unwrap(),
        Err(e) => serde_json::to_string(&KVResult::err(&e, Some("SORT_ERROR"))).unwrap(),
    }
}

/// Get statistics about the store
#[wasm_bindgen]
pub fn get_stats(entries_json: &str) -> String {
    let result = (|| -> Result<KVResult, String> {
        let entries: Vec<KVEntry> = serde_json::from_str(entries_json)
            .map_err(|e| format!("Failed to parse entries: {}", e))?;

        let total_count = entries.len();
        let total_size: usize = entries
            .iter()
            .map(|e| e.key.len() + serde_json::to_string(&e.value).unwrap_or_default().len())
            .sum();

        let stats = serde_json::json!({
            "count": total_count,
            "totalSize": total_size,
            "averageSize": if total_count > 0 { total_size / total_count } else { 0 }
        });

        Ok(KVResult::ok(Some(stats)))
    })();

    match result {
        Ok(r) => serde_json::to_string(&r).unwrap(),
        Err(e) => serde_json::to_string(&KVResult::err(&e, Some("STATS_ERROR"))).unwrap(),
    }
}

/// Merge two JSON objects (for partial updates)
#[wasm_bindgen]
pub fn merge_objects(base_json: &str, patch_json: &str) -> String {
    let result = (|| -> Result<KVResult, String> {
        let mut base: serde_json::Value =
            serde_json::from_str(base_json).map_err(|e| format!("Failed to parse base: {}", e))?;
        let patch: serde_json::Value = serde_json::from_str(patch_json)
            .map_err(|e| format!("Failed to parse patch: {}", e))?;

        if let (Some(base_obj), Some(patch_obj)) = (base.as_object_mut(), patch.as_object()) {
            for (key, value) in patch_obj {
                base_obj.insert(key.clone(), value.clone());
            }
            Ok(KVResult::ok(Some(base)))
        } else {
            Err("Both base and patch must be objects".to_string())
        }
    })();

    match result {
        Ok(r) => serde_json::to_string(&r).unwrap(),
        Err(e) => serde_json::to_string(&KVResult::err(&e, Some("MERGE_ERROR"))).unwrap(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_key() {
        let result = validate_key("");
        assert!(result.contains("EMPTY_KEY"));

        let result = validate_key("valid_key");
        assert!(result.contains("success\":true"));
    }

    #[test]
    fn test_validate_value() {
        let result = validate_value("invalid json");
        assert!(result.contains("INVALID_JSON"));

        let result = validate_value(r#"{"foo": "bar"}"#);
        assert!(result.contains("success\":true"));
    }

    #[test]
    fn test_search_values() {
        let entries = r#"[
            {"key": "user:1", "value": {"name": "Alice"}},
            {"key": "user:2", "value": {"name": "Bob"}}
        ]"#;

        let result = search_values(entries, "alice");
        assert!(result.contains("Alice"));
        assert!(!result.contains("Bob"));
    }

    #[test]
    fn test_filter_by_prefix() {
        let entries = r#"[
            {"key": "user:1", "value": 1},
            {"key": "user:2", "value": 2},
            {"key": "post:1", "value": 3}
        ]"#;

        let result = filter_by_prefix(entries, "user:");
        assert!(result.contains("user:1"));
        assert!(result.contains("user:2"));
        assert!(!result.contains("post:1"));
    }
}
