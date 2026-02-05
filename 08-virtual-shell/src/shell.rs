use crate::fs::VirtualFileSystem;
use crate::models::ShellResult;
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

    /// Returns a JSON-serialized ShellResult
    pub fn execute(&mut self, cmd_line: &str) -> String {
        let parts: Vec<&str> = cmd_line.trim().split_whitespace().collect();
        if parts.is_empty() {
            return serde_json::to_string(&ShellResult::ok("".to_string(), false)).unwrap();
        }

        let command = parts[0];
        let args = &parts[1..];

        let result = match command {
            "pwd" => ShellResult::ok(self.get_pwd(), false),
            "ls" => {
                let target = if args.is_empty() { "." } else { args[0] };
                let resolved = self.resolve_path(target);
                let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

                match self.fs.list_dir(path_refs) {
                    Ok(entries) => ShellResult::ok(entries.join("\n"), false),
                    Err(e) => ShellResult::error(format!("ls: {}", e)),
                }
            }
            "cd" => {
                let target = if args.is_empty() { "/" } else { args[0] };
                let resolved = self.resolve_path(target);
                let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

                match self.fs.list_dir(path_refs) {
                    Ok(_) => {
                        self.cwd = resolved;
                        ShellResult::ok("".to_string(), false)
                    }
                    Err(e) => ShellResult::error(format!("cd: {}", e)),
                }
            }
            "mkdir" => {
                if args.is_empty() {
                    ShellResult::error("mkdir: missing operand".to_string())
                } else {
                    let resolved = self.resolve_path(args[0]);
                    let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

                    match self.fs.mkdir(path_refs) {
                        Ok(_) => ShellResult::ok("".to_string(), true),
                        Err(e) => ShellResult::error(format!("mkdir: {}", e)),
                    }
                }
            }
            "touch" => {
                if args.is_empty() {
                    ShellResult::error("touch: missing operand".to_string())
                } else {
                    let resolved = self.resolve_path(args[0]);
                    let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

                    // Logic: If file exists, keep content. If not, create empty.
                    // Since write_file overwrites, we need check existence first or use a smarter method.
                    // For now, let's try reading. If it fails (not found), we write empty.
                    // If it succeeds, we essentially do nothing (touching timestamp not implemented yet).
                    if self.fs.read_file(path_refs.clone()).is_ok() {
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
                        let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();
                        match self.fs.write_file(path_refs, content) {
                            Ok(_) => ShellResult::ok("".to_string(), true),
                            Err(e) => ShellResult::error(format!("echo: {}", e)),
                        }
                    } else {
                        ShellResult::error("echo: syntax error near >".to_string())
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
                    let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

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
                    let path_refs: Vec<&str> = resolved.iter().map(|s| s.as_str()).collect();

                    match self.fs.delete(path_refs) {
                        Ok(_) => ShellResult::ok("".to_string(), true),
                        Err(e) => ShellResult::error(format!("rm: {}", e)),
                    }
                }
            }
            _ => ShellResult::error(format!("command not found: {}", command)),
        };

        serde_json::to_string(&result).unwrap_or_else(|_| {
            r#"{"stdout":"","stderr":"Serialization error","fs_changed":false}"#.to_string()
        })
    }

    pub fn get_fs_json(&self) -> String {
        serde_json::to_string(&self.fs).unwrap_or("{}".to_string())
    }

    /// Load files from a JSON string (e.g. from GitHub API)
    pub fn load_files(&mut self, files_json: &str) -> String {
        match serde_json::from_str::<Vec<crate::models::VirtualFile>>(files_json) {
            Ok(files) => {
                self.fs.load_files(files);
                serde_json::to_string(&ShellResult::ok("Files loaded".to_string(), true)).unwrap()
            }
            Err(e) => {
                serde_json::to_string(&ShellResult::error(format!("JSON parse error: {}", e)))
                    .unwrap_or_else(|_| {
                        r#"{"stdout":"","stderr":"Serialization error","fs_changed":false}"#
                            .to_string()
                    })
            }
        }
    }
}
