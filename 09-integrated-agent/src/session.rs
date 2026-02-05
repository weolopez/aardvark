use crate::models::{MessageEntry, SessionEntry, SessionHeader};
use std::collections::HashMap;
use uuid::Uuid;
use chrono::Utc;

pub struct SessionManager {
    pub entries: HashMap<String, SessionEntry>,
    pub leaf_id: String,
    pub root_id: String,
    pub session_id: String,
}

impl SessionManager {
    pub fn new(cwd: String) -> Self {
        let root_id = Uuid::new_v4().to_string();
        let session_id = root_id.clone();
        let timestamp = Utc::now().to_rfc3339();

        let header = SessionHeader {
            id: root_id.clone(),
            timestamp,
            cwd,
            parent_session: None,
        };

        let mut entries = HashMap::new();
        entries.insert(root_id.clone(), SessionEntry::Header(header));

        SessionManager {
            entries,
            leaf_id: root_id.clone(),
            root_id,
            session_id,
        }
    }

    /// Append a message and return its ID and JSON for persistence
    pub fn append_message(&mut self, role: String, content: String) -> (String, String) {
        let id = Uuid::new_v4().to_string();
        let timestamp = Utc::now().to_rfc3339();

        let message = MessageEntry {
            id: id.clone(),
            parent_id: Some(self.leaf_id.clone()),
            timestamp,
            role,
            content,
        };

        let entry = SessionEntry::Message(message);
        let json = serde_json::to_string(&entry).unwrap_or_default();

        self.entries.insert(id.clone(), entry);
        self.leaf_id = id.clone();

        (id, json)
    }

    /// Branch to a specific entry
    pub fn branch(&mut self, entry_id: String) -> Result<(), String> {
        if self.entries.contains_key(&entry_id) {
            self.leaf_id = entry_id;
            Ok(())
        } else {
            Err(format!("Entry ID {} not found", entry_id))
        }
    }

    /// Get the linear history from root to current leaf
    pub fn get_history(&self) -> Vec<SessionEntry> {
        let mut history = Vec::new();
        let mut current_id = Some(self.leaf_id.clone());

        while let Some(id) = current_id {
            if let Some(entry) = self.entries.get(&id) {
                history.push(entry.clone());
                current_id = match entry {
                    SessionEntry::Message(msg) => msg.parent_id.clone(),
                    SessionEntry::Header(_) => {
                        if id == self.root_id {
                            None
                        } else {
                            None
                        }
                    }
                };
            } else {
                break;
            }
        }

        history.reverse();
        history
    }

    /// Get all entries as a serializable map (for tree visualization)
    pub fn get_all_entries(&self) -> &HashMap<String, SessionEntry> {
        &self.entries
    }
}
