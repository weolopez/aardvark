use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum FileNode {
    File { content: String },
    Directory { children: HashMap<String, FileNode> },
}

impl FileNode {
    pub fn new_dir() -> Self {
        FileNode::Directory {
            children: HashMap::new(),
        }
    }

    pub fn new_file(content: String) -> Self {
        FileNode::File { content }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VirtualFileSystem {
    pub root: FileNode,
}

impl VirtualFileSystem {
    pub fn new() -> Self {
        VirtualFileSystem {
            root: FileNode::new_dir(),
        }
    }

    /// Navigates to a specific path components. Returns a mutable reference to the node if found.
    /// Used internally for modifying the tree.
    fn get_node_mut(&mut self, path: &[&str]) -> Result<&mut FileNode, String> {
        let mut current = &mut self.root;

        for component in path {
            if component.is_empty() {
                continue;
            } // Skip empty (e.g. caused by double slash)

            match current {
                FileNode::Directory { children } => {
                    current = children
                        .get_mut(*component)
                        .ok_or_else(|| format!("Path not found: {}", component))?;
                }
                FileNode::File { .. } => {
                    return Err(format!("Not a directory: {}", component));
                }
            }
        }
        Ok(current)
    }

    /// Read-only version of get_node
    fn get_node(&self, path: &[&str]) -> Result<&FileNode, String> {
        let mut current = &self.root;

        for component in path {
            if component.is_empty() {
                continue;
            }

            match current {
                FileNode::Directory { children } => {
                    current = children
                        .get(*component)
                        .ok_or_else(|| format!("Path not found: {}", component))?;
                }
                FileNode::File { .. } => {
                    return Err(format!("Not a directory: {}", component));
                }
            }
        }
        Ok(current)
    }

    pub fn mkdir(&mut self, path: Vec<&str>) -> Result<(), String> {
        if path.is_empty() {
            return Ok(());
        } // Root always exists

        // Split into parent path and new dir name
        let (name, parent_path) = path.split_last().unwrap();

        let parent = self.get_node_mut(parent_path)?;

        match parent {
            FileNode::Directory { children } => {
                if children.contains_key(*name) {
                    return Err(format!("Directory already exists: {}", name));
                }
                children.insert(name.to_string(), FileNode::new_dir());
                Ok(())
            }
            FileNode::File { .. } => Err("Cannot create directory inside a file".to_string()),
        }
    }

    pub fn write_file(&mut self, path: Vec<&str>, content: String) -> Result<(), String> {
        if path.is_empty() {
            return Err("Cannot write to root".to_string());
        }

        let (name, parent_path) = path.split_last().unwrap();
        let parent = self.get_node_mut(parent_path)?;

        match parent {
            FileNode::Directory { children } => {
                children.insert(name.to_string(), FileNode::new_file(content));
                Ok(())
            }
            FileNode::File { .. } => Err("Cannot create file inside a file".to_string()),
        }
    }

    pub fn read_file(&self, path: Vec<&str>) -> Result<String, String> {
        let node = self.get_node(&path)?;
        match node {
            FileNode::File { content } => Ok(content.clone()),
            FileNode::Directory { .. } => Err("Is a directory".to_string()),
        }
    }

    pub fn list_dir(&self, path: Vec<&str>) -> Result<Vec<String>, String> {
        let node = self.get_node(&path)?;
        match node {
            FileNode::Directory { children } => {
                let mut entries: Vec<String> = children.keys().cloned().collect();
                entries.sort();
                Ok(entries)
            }
            FileNode::File { .. } => Err("Not a directory".to_string()),
        }
    }

    pub fn delete(&mut self, path: Vec<&str>) -> Result<(), String> {
        if path.is_empty() {
            return Err("Cannot delete root".to_string());
        }

        let (name, parent_path) = path.split_last().unwrap();
        let parent = self.get_node_mut(parent_path)?;

        match parent {
            FileNode::Directory { children } => {
                if children.remove(*name).is_some() {
                    Ok(())
                } else {
                    Err(format!("File not found: {}", name))
                }
            }
            FileNode::File { .. } => Err("Parent is not a directory".to_string()),
        }
    }
}
