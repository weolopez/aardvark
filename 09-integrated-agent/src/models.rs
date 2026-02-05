use serde::{Deserialize, Serialize};

// ============================================================================
// Virtual File System Models
// ============================================================================

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Synced,
    Modified,
    New,
    Deleted,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VirtualFile {
    pub path: String,
    pub name: String,
    pub content: String,
    #[serde(default)]
    pub sha: Option<String>,
    pub status: FileStatus,
}

impl VirtualFile {
    pub fn new(path: String, name: String, content: String) -> Self {
        VirtualFile {
            path,
            name,
            content,
            sha: None,
            status: FileStatus::New,
        }
    }
}

// ============================================================================
// Shell Result
// ============================================================================

#[derive(Serialize, Deserialize)]
pub struct ShellResult {
    pub stdout: String,
    pub stderr: Option<String>,
    pub fs_changed: bool,
}

impl ShellResult {
    pub fn ok(stdout: String, fs_changed: bool) -> Self {
        ShellResult {
            stdout,
            stderr: None,
            fs_changed,
        }
    }

    pub fn error(msg: String) -> Self {
        ShellResult {
            stdout: String::new(),
            stderr: Some(msg),
            fs_changed: false,
        }
    }
}

// ============================================================================
// Session Models
// ============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum SessionEntry {
    #[serde(rename = "session")]
    Header(SessionHeader),
    #[serde(rename = "message")]
    Message(MessageEntry),
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SessionHeader {
    pub id: String,
    pub timestamp: String,
    pub cwd: String,
    pub parent_session: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MessageEntry {
    pub id: String,
    pub parent_id: Option<String>,
    pub timestamp: String,
    pub role: String,
    pub content: String,
}

// ============================================================================
// LLM Models (Gemini)
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
    pub tools: Option<Vec<GeminiTool>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_instruction: Option<GeminiSystemInstruction>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GeminiSystemInstruction {
    pub parts: Vec<GeminiTextPart>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GeminiTextPart {
    pub text: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct GeminiTool {
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
// Agent Models
// ============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AgentStep {
    #[serde(rename = "type")]
    pub step_type: String, // "text", "tool_call", "tool_result", "error"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<FunctionCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_error: Option<bool>,
}

impl AgentStep {
    pub fn text(content: String) -> Self {
        AgentStep {
            step_type: "text".to_string(),
            content: Some(content),
            tool_calls: None,
            tool_name: None,
            tool_result: None,
            tool_error: None,
        }
    }

    pub fn tool_call(calls: Vec<FunctionCall>, content: Option<String>) -> Self {
        AgentStep {
            step_type: "tool_call".to_string(),
            content,
            tool_calls: Some(calls),
            tool_name: None,
            tool_result: None,
            tool_error: None,
        }
    }

    pub fn tool_result(name: String, result: String, is_error: bool) -> Self {
        AgentStep {
            step_type: "tool_result".to_string(),
            content: None,
            tool_calls: None,
            tool_name: Some(name),
            tool_result: Some(result),
            tool_error: if is_error { Some(true) } else { None },
        }
    }

    pub fn error(message: String) -> Self {
        AgentStep {
            step_type: "error".to_string(),
            content: Some(message),
            tool_calls: None,
            tool_name: None,
            tool_result: None,
            tool_error: None,
        }
    }
}

// ============================================================================
// Tool Result
// ============================================================================

pub struct ToolOutput {
    pub content: String,
    pub is_error: bool,
    pub fs_changed: bool,
}

impl ToolOutput {
    pub fn ok(content: String) -> Self {
        ToolOutput {
            content,
            is_error: false,
            fs_changed: false,
        }
    }

    pub fn ok_with_fs(content: String) -> Self {
        ToolOutput {
            content,
            is_error: false,
            fs_changed: true,
        }
    }

    pub fn err(content: String) -> Self {
        ToolOutput {
            content,
            is_error: true,
            fs_changed: false,
        }
    }
}
