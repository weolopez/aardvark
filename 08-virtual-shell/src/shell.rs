use crate::fs::VirtualFileSystem;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Shell {
    fs: VirtualFileSystem,
    cwd: Vec<String>,
    env: Vec<(String, String)>,
}

#[wasm_bindgen]
impl Shell {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Shell {
        let mut shell = Shell {
            fs: VirtualFileSystem::new(),
            cwd: Vec::new(),
            env: Vec::new(),
        };
        // Create default home directory
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

    /// Resolves a path string (relative or absolute) to a vector of components
    fn resolve_path(&self, path_str: &str) -> Vec<String> {
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

    pub fn execute(&mut self, cmd_line: &str) -> String {
        let parts: Vec<&str> = cmd_line.trim().split_whitespace().collect();
        if parts.is_empty() {
            return "".to_string();
        }

        let command = parts[0];
        let args = &parts[1..];

        match command {
            "pwd" => self.get_pwd(),
            "ls" => {
                let target = if args.is_empty() { "." } else { args[0] };
                let resolved = self.resolve_path(target);
                let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

                match self.fs.list_dir(path_refs) {
                    Ok(entries) => entries.join("\n"),
                    Err(e) => format!("ls: {}", e),
                }
            }
            "cd" => {
                let target = if args.is_empty() { "/" } else { args[0] };
                let resolved = self.resolve_path(target);
                let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

                // Verify it exists and is a dir
                match self.fs.list_dir(path_refs) {
                    Ok(_) => {
                        self.cwd = resolved;
                        "".to_string()
                    }
                    Err(e) => format!("cd: {}", e),
                }
            }
            "mkdir" => {
                if args.is_empty() {
                    return "mkdir: missing operand".to_string();
                }
                let resolved = self.resolve_path(args[0]);
                let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

                match self.fs.mkdir(path_refs) {
                    Ok(_) => "".to_string(),
                    Err(e) => format!("mkdir: {}", e),
                }
            }
            "touch" => {
                if args.is_empty() {
                    return "touch: missing operand".to_string();
                }
                let resolved = self.resolve_path(args[0]);
                let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

                // Only create if not exists, but for now strict write_file is fine
                // Actually touch should just update timestamp or create empty.
                // Our write_file creates/overwrites.
                // Let's check if it exists first?
                // For simplicity: just overwrite with empty if strictly new, or keep content.
                // Simpler: Just write empty string.
                match self.fs.write_file(path_refs, "".to_string()) {
                    Ok(_) => "".to_string(),
                    Err(e) => format!("touch: {}", e),
                }
            }
            "echo" => {
                // Simple echo: join args.
                // TODO: Support > redirection later.
                // For now, if contains ">", handle it manually here?
                // A real parser would handle this before execution.
                // Let's do a quick hack for ">" support.
                if let Some(pos) = args.iter().position(|&x| x == ">") {
                    let content = args[0..pos].join(" ");
                    let file_path = args.get(pos + 1);

                    if let Some(path) = file_path {
                        let resolved = self.resolve_path(path);
                        let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();
                        match self.fs.write_file(path_refs, content) {
                            Ok(_) => "".to_string(),
                            Err(e) => format!("echo: {}", e),
                        }
                    } else {
                        "echo: syntax error near >".to_string()
                    }
                } else {
                    args.join(" ")
                }
            }
            "cat" => {
                if args.is_empty() {
                    return "cat: missing operand".to_string();
                }
                let resolved = self.resolve_path(args[0]);
                let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

                match self.fs.read_file(path_refs) {
                    Ok(content) => content,
                    Err(e) => format!("cat: {}", e),
                }
            }
            "rm" => {
                if args.is_empty() {
                    return "rm: missing operand".to_string();
                }
                let resolved = self.resolve_path(args[0]);
                let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

                match self.fs.delete(path_refs) {
                    Ok(_) => "".to_string(),
                    Err(e) => format!("rm: {}", e),
                }
            }
            _ => format!("command not found: {}", command),
        }
    }

    // Helper to export the FS state for the UI
    pub fn get_fs_json(&self) -> String {
        serde_json::to_string(&self.fs).unwrap_or("{}".to_string())
    }
}
