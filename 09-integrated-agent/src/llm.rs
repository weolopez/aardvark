use crate::models::{GeminiRequest, GeminiResponse};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, RequestMode, Response};

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

    let opts = RequestInit::new();
    opts.set_method("POST");
    opts.set_mode(RequestMode::Cors);
    opts.set_body(&JsValue::from_str(&body_str));

    let req = Request::new_with_str_and_init(&url, &opts)
        .map_err(|e| format!("Failed to create request: {:?}", e))?;

    req.headers()
        .set("Content-Type", "application/json")
        .map_err(|e| format!("Failed to set headers: {:?}", e))?;

    let global = js_sys::global();
    let global: web_sys::WorkerGlobalScope = global
        .dyn_into()
        .map_err(|_| "Failed to get WorkerGlobalScope. Are you running in a worker?".to_string())?;

    let resp_value = JsFuture::from(global.fetch_with_request(&req))
        .await
        .map_err(|e| format!("Network request failed: {:?}", e))?;

    let resp: Response = resp_value
        .dyn_into()
        .map_err(|_| "Failed to cast response".to_string())?;

    if !resp.ok() {
        let status = resp.status();
        // Try to read error body
        let error_text = match resp.text() {
            Ok(promise) => match JsFuture::from(promise).await {
                Ok(val) => val.as_string().unwrap_or_default(),
                Err(_) => String::new(),
            },
            Err(_) => String::new(),
        };
        return Err(format!("HTTP Error {}: {}", status, error_text));
    }

    let json = JsFuture::from(resp.text().map_err(|e| format!("{:?}", e))?)
        .await
        .map_err(|e| format!("Failed to read text: {:?}", e))?;

    let text = json.as_string().unwrap_or_default();

    serde_json::from_str(&text)
        .map_err(|e| format!("Failed to parse response: {}. Text: {}", e, &text[..text.len().min(500)]))
}
