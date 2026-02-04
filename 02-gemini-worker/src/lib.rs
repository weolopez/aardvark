// 02-gemini-worker: Chat with Gemini API from Rust WASM
//
// This project teaches:
// - HTTP requests from WASM using web-sys fetch
// - Async Rust with wasm-bindgen-futures
// - Structured API responses with serde
// - Error handling with custom error types

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, RequestMode, Response};

// ============================================================================
// Types
// ============================================================================

#[derive(Serialize, Deserialize, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub parts: Vec<Part>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct Part {
    pub text: String,
}

#[derive(Serialize, Debug)]
struct GeminiRequest {
    contents: Vec<ChatMessage>,
}

#[derive(Deserialize, Debug)]
struct GeminiResponse {
    candidates: Option<Vec<Candidate>>,
    error: Option<GeminiError>,
}

#[derive(Deserialize, Debug)]
struct Candidate {
    content: CandidateContent,
}

#[derive(Deserialize, Debug)]
struct CandidateContent {
    parts: Vec<Part>,
}

#[derive(Deserialize, Debug)]
struct GeminiError {
    message: String,
    code: Option<i32>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ChatResult {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
    pub error_code: Option<String>,
}

impl ChatResult {
    pub fn ok(message: String) -> Self {
        ChatResult {
            success: true,
            message: Some(message),
            error: None,
            error_code: None,
        }
    }

    pub fn err(error: &str, code: Option<&str>) -> Self {
        ChatResult {
            success: false,
            message: None,
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
    log("Gemini Worker WASM module initialized!");
}

/// Check if API key is valid format (basic validation)
#[wasm_bindgen]
pub fn validate_api_key(api_key: &str) -> bool {
    // Gemini API keys typically start with "AI" and are ~39 chars
    !api_key.is_empty() && api_key.len() > 10
}

/// Build the request body for Gemini API
#[wasm_bindgen]
pub fn build_request_body(history_json: &str, new_message: &str) -> Result<String, JsValue> {
    // Parse existing history
    let mut history: Vec<ChatMessage> = if history_json.is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(history_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse history: {}", e)))?
    };

    // Add user message
    history.push(ChatMessage {
        role: "user".to_string(),
        parts: vec![Part {
            text: new_message.to_string(),
        }],
    });

    // Build request
    let request = GeminiRequest { contents: history };

    serde_json::to_string(&request)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize request: {}", e)))
}

/// Parse Gemini API response
#[wasm_bindgen]
pub fn parse_response(response_json: &str) -> String {
    let result = parse_response_internal(response_json);
    serde_json::to_string(&result).unwrap_or_else(|_| {
        r#"{"success":false,"error":"Failed to serialize result"}"#.to_string()
    })
}

fn parse_response_internal(response_json: &str) -> ChatResult {
    // Parse response
    let response: GeminiResponse = match serde_json::from_str(response_json) {
        Ok(r) => r,
        Err(e) => return ChatResult::err(&format!("Failed to parse response: {}", e), Some("PARSE_ERROR")),
    };

    // Check for API error
    if let Some(error) = response.error {
        let code = error.code.map(|c| c.to_string());
        return ChatResult::err(&error.message, code.as_deref());
    }

    // Extract message from candidates
    if let Some(candidates) = response.candidates {
        if let Some(candidate) = candidates.first() {
            if let Some(part) = candidate.content.parts.first() {
                return ChatResult::ok(part.text.clone());
            }
        }
    }

    ChatResult::err("No response content", Some("EMPTY_RESPONSE"))
}

/// Create a ChatMessage for history
#[wasm_bindgen]
pub fn create_message(role: &str, text: &str) -> String {
    let message = ChatMessage {
        role: role.to_string(),
        parts: vec![Part {
            text: text.to_string(),
        }],
    };
    serde_json::to_string(&message).unwrap_or_else(|_| "{}".to_string())
}

/// Add a message to history and return updated history
#[wasm_bindgen]
pub fn add_to_history(history_json: &str, role: &str, text: &str) -> String {
    let mut history: Vec<ChatMessage> = if history_json.is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(history_json).unwrap_or_default()
    };

    history.push(ChatMessage {
        role: role.to_string(),
        parts: vec![Part {
            text: text.to_string(),
        }],
    });

    serde_json::to_string(&history).unwrap_or_else(|_| "[]".to_string())
}

/// Call the Gemini API (async)
#[wasm_bindgen]
pub async fn call_gemini_api(api_key: &str, request_body: &str) -> Result<String, JsValue> {
    if api_key.is_empty() {
        let result = ChatResult::err(
            "API key is missing. Please set your Gemini API key.",
            Some("MISSING_API_KEY"),
        );
        return Ok(serde_json::to_string(&result).unwrap());
    }

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={}",
        api_key
    );

    log(&format!("Calling Gemini API..."));

    // Create request
    let mut opts = RequestInit::new();
    opts.method("POST");
    opts.mode(RequestMode::Cors);
    opts.body(Some(&JsValue::from_str(request_body)));

    let request = Request::new_with_str_and_init(&url, &opts)?;
    request.headers().set("Content-Type", "application/json")?;

    // Make request - use global fetch (works in both Window and Worker)
    let global = js_sys::global();
    let global: web_sys::WorkerGlobalScope = global.dyn_into()?;
    let resp_value = JsFuture::from(global.fetch_with_request(&request)).await?;
    let resp: Response = resp_value.dyn_into()?;

    // Check status
    if !resp.ok() {
        let status = resp.status();
        let result = match status {
            401 => ChatResult::err("Invalid API key", Some("INVALID_API_KEY")),
            403 => ChatResult::err("API key doesn't have permission", Some("FORBIDDEN")),
            429 => ChatResult::err("Rate limit exceeded. Please wait.", Some("RATE_LIMIT")),
            _ => ChatResult::err(&format!("HTTP error: {}", status), Some("HTTP_ERROR")),
        };
        return Ok(serde_json::to_string(&result).unwrap());
    }

    // Parse response
    let json = JsFuture::from(resp.text()?).await?;
    let response_text = json.as_string().unwrap_or_default();

    log(&format!("Got response: {} bytes", response_text.len()));

    // Parse and return
    Ok(parse_response(&response_text))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_api_key() {
        assert!(!validate_api_key(""));
        assert!(!validate_api_key("short"));
        assert!(validate_api_key("AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz12345"));
    }

    #[test]
    fn test_build_request_body() {
        let body = build_request_body("", "Hello").unwrap();
        assert!(body.contains("Hello"));
        assert!(body.contains("user"));
    }

    #[test]
    fn test_parse_response_error() {
        let response = r#"{"error":{"message":"Invalid API key","code":401}}"#;
        let result = parse_response(response);
        assert!(result.contains("Invalid API key"));
    }

    #[test]
    fn test_add_to_history() {
        let history = add_to_history("", "user", "Hello");
        assert!(history.contains("Hello"));
        
        let history2 = add_to_history(&history, "model", "Hi there!");
        assert!(history2.contains("Hello"));
        assert!(history2.contains("Hi there!"));
    }
}
