use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

pub struct SessionTree {
    nodes: HashMap<String, Node>,
    root_id: String,
    current_id: String,
}

impl SessionTree {
    pub fn new() -> Self {
        let root_id = Uuid::new_v4().to_string();
        let mut nodes = HashMap::new();

        nodes.insert(
            root_id.clone(),
            Node {
                id: root_id.clone(),
                role: "system".to_string(),
                content: "You are a helpful coding assistant.".to_string(),
                parent_id: None,
                children: vec![],
                timestamp: Utc::now(),
                tool_calls: None,
                tool_results: None,
            },
        );

        Self {
            nodes,
            root_id: root_id.clone(),
            current_id: root_id,
        }
    }

    pub fn append_message(&mut self, role: String, content: String) -> String {
        let id = Uuid::new_v4().to_string();
        let node = Node {
            id: id.clone(),
            role,
            content,
            parent_id: Some(self.current_id.clone()),
            children: vec![],
            timestamp: Utc::now(),
            tool_calls: None,
            tool_results: None,
        };

        // Add to parent's children
        if let Some(parent) = self.nodes.get_mut(&self.current_id) {
            parent.children.push(id.clone());
        }

        self.nodes.insert(id.clone(), node);
        self.current_id = id.clone();

        id
    }

    pub fn add_tool_result(&mut self, tool_name: String, output: String) {
        if let Some(node) = self.nodes.get_mut(&self.current_id) {
            node.tool_results = Some(vec![ToolResult { tool_name, output }]);
        }
    }

    pub fn get_history(&self) -> Vec<&Node> {
        let mut history = vec![];
        let mut current = Some(&self.current_id);

        while let Some(id) = current {
            if let Some(node) = self.nodes.get(id) {
                history.push(node);
                current = node.parent_id.as_ref();
            } else {
                break;
            }
        }

        history.reverse();
        history
    }

    pub fn build_context(&self) -> Vec<Message> {
        self.get_history()
            .into_iter()
            .map(|node| Message {
                role: node.role.clone(),
                content: node.content.clone(),
            })
            .collect()
    }

    pub fn branch(&mut self, node_id: String) -> String {
        // Create a new session starting from node_id
        let new_session_id = Uuid::new_v4().to_string();

        // In a real implementation, this would create a copy of the tree
        // up to node_id and return the new session ID

        new_session_id
    }

    pub fn get_tree(&self) -> &HashMap<String, Node> {
        &self.nodes
    }

    pub fn get_current_node(&self) -> &Node {
        self.nodes.get(&self.current_id).unwrap()
    }
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Node {
    pub id: String,
    pub role: String,
    pub content: String,
    pub parent_id: Option<String>,
    pub children: Vec<String>,
    pub timestamp: DateTime<Utc>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub tool_results: Option<Vec<ToolResult>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ToolResult {
    pub tool_name: String,
    pub output: String,
}

#[derive(Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}
