use serde::{Deserialize, Serialize};

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
    pub parent_id: Option<String>, // The link backwards in the tree
    pub timestamp: String,
    pub role: String,
    pub content: String,
}
