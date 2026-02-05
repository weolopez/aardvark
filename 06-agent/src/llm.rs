use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, RequestMode, Response};

// ============================================================================
// API Types (Gemini)
// ============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub parts: Vec<Part>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(untagged)]
pub enum Part {
    Text {
        text: String,
    },
    FunctionCall {
        #[serde(rename = "functionCall")]
        function_call: FunctionCall,
    },
    FunctionResponse {
        #[serde(rename = "functionResponse")]
        function_response: FunctionResponse,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FunctionCall {
    pub name: String,
    pub args: serde_json::Value,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FunctionResponse {
    pub name: String,
    pub response: FunctionResponseContent,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FunctionResponseContent {
    pub name: String,
    pub content: serde_json::Value,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GeminiRequest {
    pub contents: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Tool {
    #[serde(rename = "functionDeclarations")]
    pub function_declarations: Vec<FunctionDeclaration>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FunctionDeclaration {
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

#[derive(Deserialize, Debug)]
pub struct GeminiResponse {
    pub candidates: Option<Vec<Candidate>>,
    pub error: Option<GeminiError>,
}

#[derive(Deserialize, Debug)]
pub struct Candidate {
    pub content: CandidateContent,
}

#[derive(Deserialize, Debug)]
pub struct CandidateContent {
    pub parts: Vec<Part>,
}

#[derive(Deserialize, Debug)]
pub struct GeminiError {
    pub message: String,
    pub code: Option<i32>,
}

// ============================================================================
// Helper Functions
// ============================================================================

pub async fn call_gemini_api(
    api_key: &str,
    model: &str,
    request: &GeminiRequest,
) -> Result<GeminiResponse, String> {
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );

    let body_str = serde_json::to_string(request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    let mut opts = RequestInit::new();
    opts.set_method("POST");
    opts.set_mode(RequestMode::Cors);
    opts.set_body(&JsValue::from_str(&body_str));

    let req = Request::new_with_str_and_init(&url, &opts)
        .map_err(|e| format!("Failed to create request: {:?}", e))?;
    
    req.headers().set("Content-Type", "application/json")
        .map_err(|e| format!("Failed to set headers: {:?}", e))?;

    let global = js_sys::global();
    let global: web_sys::WorkerGlobalScope = global.dyn_into()
        .map_err(|_| "Failed to get WorkerGlobalScope. Are you running in a worker?".to_string())?;
    
    let resp_value = JsFuture::from(global.fetch_with_request(&req))
        .await
        .map_err(|e| format!("Network request failed: {:?}", e))?;
    
    let resp: Response = resp_value.dyn_into()
        .map_err(|_| "Failed to cast response".to_string())?;

    if !resp.ok() {
        return Err(format!("HTTP Error: {}", resp.status()));
    }

    let json = JsFuture::from(resp.text().map_err(|e| format!("{:?}", e))?)
        .await
        .map_err(|e| format!("Failed to read text: {:?}", e))?;
    
    let text = json.as_string().unwrap_or_default();
    
    serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse response: {}. Text: {}", e, text))
}
