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

    // ========================================================================
    // Node Navigation
    // ========================================================================

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

    // ========================================================================
    // Basic Operations
    // ========================================================================

    pub fn mkdir(&mut self, path: Vec<&str>) -> Result<(), String> {
        if path.is_empty() {
            return Ok(());
        }
        let (name, parent_path) = path.split_last().unwrap();
        let parent = self.get_node_mut(parent_path)?;
        match parent {
            FileNode::Directory { children } => {
                if children.contains_key(*name) {
                    return Ok(()); // Idempotent
                }
                children.insert(name.to_string(), FileNode::new_dir());
                Ok(())
            }
            FileNode::File(_) => Err("Cannot create directory inside a file".to_string()),
        }
    }

    /// Recursively create directories along a path (like mkdir -p)
    pub fn mkdir_p(&mut self, path: Vec<&str>) -> Result<(), String> {
        for i in 1..=path.len() {
            let sub = &path[..i];
            self.ensure_dir(sub)?;
        }
        Ok(())
    }

    fn ensure_dir(&mut self, path: &[&str]) -> Result<(), String> {
        if path.is_empty() {
            return Ok(());
        }
        let (name, parent_path) = path.split_last().unwrap();
        let parent = self.get_node_mut(parent_path)?;
        match parent {
            FileNode::Directory { children } => {
                if !children.contains_key(*name) {
                    children.insert(name.to_string(), FileNode::new_dir());
                }
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
        let full_path = path.join("/");

        // Auto-create parent directories
        if !parent_path.is_empty() {
            self.mkdir_p(parent_path.to_vec())?;
        }

        let parent = self.get_node_mut(parent_path)?;
        match parent {
            FileNode::Directory { children } => {
                if let Some(existing_node) = children.get_mut(*name) {
                    if let FileNode::File(file) = existing_node {
                        file.content = content;
                        if file.status == FileStatus::Synced {
                            file.status = FileStatus::Modified;
                        }
                    } else {
                        return Err(format!("{} is a directory", name));
                    }
                } else {
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

    pub fn list_dir(&self, path: Vec<&str>) -> Result<Vec<String>, String> {
        let node = self.get_node(&path)?;
        match node {
            FileNode::Directory { children } => {
                let mut entries: Vec<String> = children
                    .iter()
                    .map(|(name, node)| {
                        match node {
                            FileNode::Directory { .. } => format!("{}/", name),
                            FileNode::File(_) => name.clone(),
                        }
                    })
                    .collect();
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
                    Err(format!("Not found: {}", name))
                }
            }
            FileNode::File(_) => Err("Parent is not a directory".to_string()),
        }
    }

    pub fn exists(&self, path: Vec<&str>) -> bool {
        self.get_node(&path).is_ok()
    }

    pub fn is_dir(&self, path: Vec<&str>) -> bool {
        matches!(self.get_node(&path), Ok(FileNode::Directory { .. }))
    }

    // ========================================================================
    // Enhanced Operations for Tools
    // ========================================================================

    /// Read file with line numbers and optional offset/limit
    pub fn read_file_with_lines(
        &self,
        path: Vec<&str>,
        offset: Option<usize>,
        limit: Option<usize>,
    ) -> Result<(String, usize, usize), String> {
        let content = self.read_file(path)?;
        let all_lines: Vec<&str> = content.split('\n').collect();
        let total_lines = all_lines.len();

        let start = offset.unwrap_or(1).saturating_sub(1); // 1-indexed to 0-indexed
        if start >= total_lines {
            return Err(format!(
                "Offset {} is beyond end of file ({} lines total)",
                start + 1,
                total_lines
            ));
        }

        let max_lines = limit.unwrap_or(2000);
        let end = (start + max_lines).min(total_lines);

        let line_num_width = format!("{}", end).len();
        let numbered: Vec<String> = all_lines[start..end]
            .iter()
            .enumerate()
            .map(|(i, line)| {
                format!("{:>width$} | {}", start + i + 1, line, width = line_num_width)
            })
            .collect();

        Ok((numbered.join("\n"), total_lines, end - start))
    }

    /// Collect all file paths recursively
    pub fn collect_file_paths(&self, prefix: &str) -> Vec<String> {
        let mut paths = Vec::new();
        self.collect_paths_recursive(&self.root, prefix, &mut paths);
        paths
    }

    fn collect_paths_recursive(&self, node: &FileNode, prefix: &str, paths: &mut Vec<String>) {
        if let FileNode::Directory { children } = node {
            for (name, child) in children {
                let path = if prefix.is_empty() {
                    name.clone()
                } else {
                    format!("{}/{}", prefix, name)
                };
                match child {
                    FileNode::File(_) => paths.push(path),
                    FileNode::Directory { .. } => {
                        self.collect_paths_recursive(child, &path, paths);
                    }
                }
            }
        }
    }

    /// Search file contents for a pattern (grep-like)
    pub fn grep(
        &self,
        pattern: &regex::Regex,
        base_path: &str,
        limit: usize,
    ) -> Vec<String> {
        let mut matches = Vec::new();
        self.grep_recursive(&self.root, base_path, pattern, limit, &mut matches);
        matches
    }

    fn grep_recursive(
        &self,
        node: &FileNode,
        prefix: &str,
        pattern: &regex::Regex,
        limit: usize,
        matches: &mut Vec<String>,
    ) {
        if matches.len() >= limit {
            return;
        }
        if let FileNode::Directory { children } = node {
            let mut sorted_names: Vec<&String> = children.keys().collect();
            sorted_names.sort();
            for name in sorted_names {
                let child = &children[name];
                let path = if prefix.is_empty() {
                    name.clone()
                } else {
                    format!("{}/{}", prefix, name)
                };
                match child {
                    FileNode::File(f) => {
                        for (i, line) in f.content.split('\n').enumerate() {
                            if matches.len() >= limit {
                                return;
                            }
                            if pattern.is_match(line) {
                                let truncated = if line.len() > 500 {
                                    format!("{}...", &line[..500])
                                } else {
                                    line.to_string()
                                };
                                matches.push(format!("{}:{}: {}", path, i + 1, truncated));
                            }
                        }
                    }
                    FileNode::Directory { .. } => {
                        self.grep_recursive(child, &path, pattern, limit, matches);
                    }
                }
            }
        }
    }

    /// Collect all files that have been modified or newly created
    pub fn get_changed_files(&self) -> Vec<VirtualFile> {
        let mut changed = Vec::new();
        self.collect_changed_recursive(&self.root, &mut changed);
        changed
    }

    fn collect_changed_recursive(&self, node: &FileNode, changed: &mut Vec<VirtualFile>) {
        match node {
            FileNode::File(f) => {
                if f.status == FileStatus::Modified || f.status == FileStatus::New {
                    changed.push(f.clone());
                }
            }
            FileNode::Directory { children } => {
                for (_, child) in children {
                    self.collect_changed_recursive(child, changed);
                }
            }
        }
    }

    /// Mark a file as synced (after successful commit)
    pub fn mark_synced(&mut self, path: Vec<&str>, new_sha: Option<String>) -> Result<(), String> {
        let node = self.get_node_mut(&path)?;
        if let FileNode::File(f) = node {
            f.status = FileStatus::Synced;
            if new_sha.is_some() {
                f.sha = new_sha;
            }
            Ok(())
        } else {
            Err("Not a file".to_string())
        }
    }

    /// Load files from a JSON-parsed array (e.g., from GitHub API)
    pub fn load_files(&mut self, files: Vec<VirtualFile>) {
        for file in files {
            let _ = self.add_file(file);
        }
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
                    return Err(format!("Cannot create directory over file: {}", component));
                }
            }
        }

        match current {
            FileNode::Directory { children } => {
                children.insert(name.to_string(), FileNode::File(file));
                Ok(())
            }
            FileNode::File(_) => Err("Target parent is a file".to_string()),
        }
    }
}
