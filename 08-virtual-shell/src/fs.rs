use crate::models::{FileStatus, VirtualFile};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum FileNode {
    File(VirtualFile),
    Directory { children: HashMap<String, FileNode> },
}

impl FileNode {
    pub fn new_dir() -> Self {
        FileNode::Directory {
            children: HashMap::new(),
        }
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
    fn get_node_mut(&mut self, path: &[&str]) -> Result<&mut FileNode, String> {
        let mut current = &mut self.root;

        for component in path {
            if component.is_empty() {
                continue;
            }

            match current {
                FileNode::Directory { children } => {
                    current = children
                        .get_mut(*component)
                        .ok_or_else(|| format!("Path not found: {}", component))?;
                }
                FileNode::File(_) => {
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
                FileNode::File(_) => {
                    return Err(format!("Not a directory: {}", component));
                }
            }
        }
        Ok(current)
    }

    pub fn mkdir(&mut self, path: Vec<&str>) -> Result<(), String> {
        if path.is_empty() {
            return Ok(());
        }

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
            FileNode::File(_) => Err("Cannot create directory inside a file".to_string()),
        }
    }

    pub fn write_file(&mut self, path: Vec<&str>, content: String) -> Result<(), String> {
        if path.is_empty() {
            return Err("Cannot write to root".to_string());
        }

        let (name, parent_path) = path.split_last().unwrap();

        // Reconstruct full path string for the file record
        let full_path = path.join("/");

        let parent = self.get_node_mut(parent_path)?;

        match parent {
            FileNode::Directory { children } => {
                // Check if file exists to update status
                if let Some(existing_node) = children.get_mut(*name) {
                    if let FileNode::File(file) = existing_node {
                        file.content = content;
                        // If it was Synced, it is now Modified. If it was New, it stays New.
                        if file.status == FileStatus::Synced {
                            file.status = FileStatus::Modified;
                        }
                    } else {
                        return Err(format!("{} is a directory", name));
                    }
                } else {
                    // Create new file
                    let file = VirtualFile::new(full_path, name.to_string(), content);
                    children.insert(name.to_string(), FileNode::File(file));
                }
                Ok(())
            }
            FileNode::File(_) => Err("Cannot create file inside a file".to_string()),
        }
    }

    pub fn read_file(&self, path: Vec<&str>) -> Result<String, String> {
        let node = self.get_node(&path)?;
        match node {
            FileNode::File(f) => Ok(f.content.clone()),
            FileNode::Directory { .. } => Err("Is a directory".to_string()),
        }
    }

    // Helper to get full file info (for cat or inspection)
    pub fn get_file_info(&self, path: Vec<&str>) -> Result<VirtualFile, String> {
        let node = self.get_node(&path)?;
        match node {
            FileNode::File(f) => Ok(f.clone()),
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
            FileNode::File(_) => Err("Not a directory".to_string()),
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
            FileNode::File(_) => Err("Parent is not a directory".to_string()),
        }
    }

    pub fn load_files(&mut self, files: Vec<VirtualFile>) {
        let _ = web_sys::console::log_1(&"Rust: Starting load_files".into());
        for file in files {
            // Ignore errors for individual files to load as much as possible
            let _ = self.add_file(file);
        }
        let _ = web_sys::console::log_1(&"Rust: Finished load_files".into());
    }

    fn add_file(&mut self, file: VirtualFile) -> Result<(), String> {
        let path_str = file.path.clone();
        let parts: Vec<&str> = path_str.split('/').filter(|p| !p.is_empty()).collect();

        if parts.is_empty() {
            return Err("Empty path".to_string());
        }

        let (name, parent_parts) = parts.split_last().unwrap();

        // Recursively ensure parent directories exist
        let mut current = &mut self.root;
        for component in parent_parts {
            match current {
                FileNode::Directory { children } => {
                    children
                        .entry(component.to_string())
                        .or_insert_with(FileNode::new_dir);
                    current = children.get_mut(*component).unwrap();
                }
                FileNode::File(_) => {
                    return Err(format!("Cannot create directory over file: {}", component))
                }
            }
        }

        // Insert the file
        match current {
            FileNode::Directory { children } => {
                children.insert(name.to_string(), FileNode::File(file));
                Ok(())
            }
            FileNode::File(_) => Err("Target parent is a file".to_string()),
        }
    }
}
