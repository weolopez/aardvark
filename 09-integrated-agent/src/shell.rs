use crate::fs::VirtualFileSystem;
use crate::models::ShellResult;

pub struct Shell {
    pub fs: VirtualFileSystem,
    pub cwd: Vec<String>,
}

impl Shell {
    pub fn new() -> Shell {
        let mut shell = Shell {
            fs: VirtualFileSystem::new(),
            cwd: Vec::new(),
        };
        let _ = shell.fs.mkdir(vec!["home"]);
        let _ = shell.fs.mkdir(vec!["home", "user"]);
        shell.cwd = vec!["home".to_string(), "user".to_string()];
        shell
    }

    pub fn get_pwd(&self) -> String {
        if self.cwd.is_empty() {
            "/".to_string()
        } else {
            format!("/{}", self.cwd.join("/"))
        }
    }

    pub fn resolve_path(&self, path_str: &str) -> Vec<String> {
        let mut path_stack = if path_str.starts_with('/') {
            Vec::new()
        } else {
            self.cwd.clone()
        };

        for component in path_str.split('/') {
            if component.is_empty() || component == "." {
                continue;
            } else if component == ".." {
                path_stack.pop();
            } else {
                path_stack.push(component.to_string());
            }
        }
        path_stack
    }

    /// Helper: convert resolved path to &str refs
    fn as_refs(path: &[String]) -> Vec<&str> {
        path.iter().map(|s| s.as_str()).collect()
    }

    pub fn execute(&mut self, cmd_line: &str) -> ShellResult {
        let parts: Vec<&str> = cmd_line.trim().split_whitespace().collect();
        if parts.is_empty() {
            return ShellResult::ok("".to_string(), false);
        }

        let command = parts[0];
        let args = &parts[1..];

        match command {
            "pwd" => ShellResult::ok(self.get_pwd(), false),
            "ls" => {
                let target = if args.is_empty() { "." } else { args[0] };
                let resolved = self.resolve_path(target);
                let path_refs = Self::as_refs(&resolved);

                match self.fs.list_dir(path_refs) {
                    Ok(entries) => ShellResult::ok(entries.join("\n"), false),
                    Err(e) => ShellResult::error(format!("ls: {}", e)),
                }
            }
            "cd" => {
                let target = if args.is_empty() { "/" } else { args[0] };
                let resolved = self.resolve_path(target);
                let path_refs = Self::as_refs(&resolved);

                if resolved.is_empty() || self.fs.is_dir(path_refs) {
                    self.cwd = resolved;
                    ShellResult::ok("".to_string(), false)
                } else {
                    ShellResult::error(format!("cd: not a directory: {}", target))
                }
            }
            "mkdir" => {
                if args.is_empty() {
                    ShellResult::error("mkdir: missing operand".to_string())
                } else {
                    let flag_p = args.contains(&"-p");
                    let path_arg = args.iter().find(|a| !a.starts_with('-'));
                    if let Some(path) = path_arg {
                        let resolved = self.resolve_path(path);
                        let path_refs = Self::as_refs(&resolved);
                        let result = if flag_p {
                            self.fs.mkdir_p(path_refs)
                        } else {
                            self.fs.mkdir(path_refs)
                        };
                        match result {
                            Ok(_) => ShellResult::ok("".to_string(), true),
                            Err(e) => ShellResult::error(format!("mkdir: {}", e)),
                        }
                    } else {
                        ShellResult::error("mkdir: missing operand".to_string())
                    }
                }
            }
            "touch" => {
                if args.is_empty() {
                    ShellResult::error("touch: missing operand".to_string())
                } else {
                    let resolved = self.resolve_path(args[0]);
                    let path_refs = Self::as_refs(&resolved);
                    if self.fs.exists(path_refs.clone()) {
                        ShellResult::ok("".to_string(), false)
                    } else {
                        match self.fs.write_file(path_refs, "".to_string()) {
                            Ok(_) => ShellResult::ok("".to_string(), true),
                            Err(e) => ShellResult::error(format!("touch: {}", e)),
                        }
                    }
                }
            }
            "echo" => {
                if let Some(pos) = args.iter().position(|&x| x == ">") {
                    let content = args[0..pos].join(" ");
                    let file_path = args.get(pos + 1);
                    if let Some(path) = file_path {
                        let resolved = self.resolve_path(path);
                        let path_refs = Self::as_refs(&resolved);
                        match self.fs.write_file(path_refs, content) {
                            Ok(_) => ShellResult::ok("".to_string(), true),
                            Err(e) => ShellResult::error(format!("echo: {}", e)),
                        }
                    } else {
                        ShellResult::error("echo: syntax error near >".to_string())
                    }
                } else if let Some(pos) = args.iter().position(|&x| x == ">>") {
                    let content = args[0..pos].join(" ");
                    let file_path = args.get(pos + 1);
                    if let Some(path) = file_path {
                        let resolved = self.resolve_path(path);
                        let path_refs = Self::as_refs(&resolved);
                        // Append
                        let existing = self
                            .fs
                            .read_file(path_refs.clone())
                            .unwrap_or_default();
                        let new_content = if existing.is_empty() {
                            content
                        } else {
                            format!("{}\n{}", existing, content)
                        };
                        match self.fs.write_file(path_refs, new_content) {
                            Ok(_) => ShellResult::ok("".to_string(), true),
                            Err(e) => ShellResult::error(format!("echo: {}", e)),
                        }
                    } else {
                        ShellResult::error("echo: syntax error near >>".to_string())
                    }
                } else {
                    ShellResult::ok(args.join(" "), false)
                }
            }
            "cat" => {
                if args.is_empty() {
                    ShellResult::error("cat: missing operand".to_string())
                } else {
                    let resolved = self.resolve_path(args[0]);
                    let path_refs = Self::as_refs(&resolved);
                    match self.fs.read_file(path_refs) {
                        Ok(content) => ShellResult::ok(content, false),
                        Err(e) => ShellResult::error(format!("cat: {}", e)),
                    }
                }
            }
            "rm" => {
                if args.is_empty() {
                    ShellResult::error("rm: missing operand".to_string())
                } else {
                    let resolved = self.resolve_path(args[0]);
                    let path_refs = Self::as_refs(&resolved);
                    match self.fs.delete(path_refs) {
                        Ok(_) => ShellResult::ok("".to_string(), true),
                        Err(e) => ShellResult::error(format!("rm: {}", e)),
                    }
                }
            }
            "tree" => {
                let target = if args.is_empty() { "." } else { args[0] };
                let resolved = self.resolve_path(target);
                let base_name = if resolved.is_empty() {
                    "/".to_string()
                } else {
                    resolved.last().unwrap().clone()
                };
                let path_refs = Self::as_refs(&resolved);
                match self.fs.get_node_for_tree(&path_refs) {
                    Ok(node) => {
                        let mut output = Vec::new();
                        output.push(base_name);
                        self.fs.tree_recursive(node, "", &mut output);
                        ShellResult::ok(output.join("\n"), false)
                    }
                    Err(e) => ShellResult::error(format!("tree: {}", e)),
                }
            }
            _ => ShellResult::error(format!("command not found: {}", command)),
        }
    }
}

// Add tree helper to VirtualFileSystem
impl crate::fs::VirtualFileSystem {
    pub fn get_node_for_tree(&self, path: &[&str]) -> Result<&crate::fs::FileNode, String> {
        let mut current = &self.root;
        for component in path {
            if component.is_empty() {
                continue;
            }
            match current {
                crate::fs::FileNode::Directory { children } => {
                    current = children
                        .get(*component)
                        .ok_or_else(|| format!("Path not found: {}", component))?;
                }
                crate::fs::FileNode::File(_) => {
                    return Err(format!("Not a directory: {}", component));
                }
            }
        }
        Ok(current)
    }

    pub fn tree_recursive(
        &self,
        node: &crate::fs::FileNode,
        prefix: &str,
        output: &mut Vec<String>,
    ) {
        if let crate::fs::FileNode::Directory { children } = node {
            let mut entries: Vec<(&String, &crate::fs::FileNode)> = children.iter().collect();
            entries.sort_by_key(|(k, _)| k.to_lowercase());

            for (i, (name, child)) in entries.iter().enumerate() {
                let is_last = i == entries.len() - 1;
                let connector = if is_last { "└── " } else { "├── " };
                let child_prefix = if is_last { "    " } else { "│   " };

                match child {
                    crate::fs::FileNode::Directory { .. } => {
                        output.push(format!("{}{}{}/", prefix, connector, name));
                        self.tree_recursive(child, &format!("{}{}", prefix, child_prefix), output);
                    }
                    crate::fs::FileNode::File(_) => {
                        output.push(format!("{}{}{}", prefix, connector, name));
                    }
                }
            }
        }
    }
}
