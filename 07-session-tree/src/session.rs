use crate::models::{MessageEntry, SessionEntry, SessionHeader};
use chrono::Utc;
use std::collections::HashMap;
use uuid::Uuid;

pub struct SessionManager {
    pub entries: HashMap<String, SessionEntry>,
    pub leaf_id: String, // The current pointer is always a valid ID (either header or message)
    pub root_id: String,
}

impl SessionManager {
    pub fn new(cwd: String) -> Self {
        let root_id = Uuid::new_v4().to_string();
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
        }
    }

    pub fn append_message(&mut self, role: String, content: String) -> String {
        let id = Uuid::new_v4().to_string();
        let timestamp = Utc::now().to_rfc3339();

        let message = MessageEntry {
            id: id.clone(),
            parent_id: Some(self.leaf_id.clone()),
            timestamp,
            role,
            content,
        };

        self.entries
            .insert(id.clone(), SessionEntry::Message(message));
        self.leaf_id = id.clone();

        id
    }

    pub fn branch(&mut self, entry_id: String) -> Result<(), String> {
        if self.entries.contains_key(&entry_id) {
            self.leaf_id = entry_id;
            Ok(())
        } else {
            Err(format!("Entry ID {} not found", entry_id))
        }
    }

    pub fn get_history(&self) -> Vec<SessionEntry> {
        let mut history = Vec::new();
        let mut current_id = Some(self.leaf_id.clone());

        while let Some(id) = current_id {
            if let Some(entry) = self.entries.get(&id) {
                history.push(entry.clone());

                // Move backwards
                current_id = match entry {
                    SessionEntry::Message(msg) => msg.parent_id.clone(),
                    SessionEntry::Header(hdr) => {
                        // Headers might have parent sessions if we implement forking sessions later,
                        // but for a single session history, the header is the stop.
                        // If we support parent_session, we'd follow it here too.
                        // For now, let's stop at the header or follow if it exists?
                        // The prompt says "traverses... back to root_id".
                        // If root_id is THIS header, we stop.
                        if id == self.root_id {
                            None
                        } else {
                            hdr.parent_session.clone()
                        }
                    }
                };
            } else {
                break; // Should not happen in a consistent tree
            }
        }

        // The traversal goes leaf -> root, so we reverse to get chronological order
        history.reverse();
        history
    }
}
