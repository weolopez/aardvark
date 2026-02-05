use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Synced,   // Matches upstream
    Modified, // Changed locally
    New,      // Created locally (untracked)
    Deleted,  // Marked for deletion (not fully used in simple shell yet)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VirtualFile {
    pub path: String, // Full path
    pub name: String, // Filename
    pub content: String,
    #[serde(default)]
    pub sha: Option<String>, // Tracks upstream state (for syncing)
    pub status: FileStatus,
}

impl VirtualFile {
    pub fn new(path: String, name: String, content: String) -> Self {
        VirtualFile {
            path,
            name,
            content,
            sha: None,
            status: FileStatus::New,
        }
    }
}

// Standardized Output Wrapper for the Shell
#[derive(Serialize, Deserialize)]
pub struct ShellResult {
    pub stdout: String,
    pub stderr: Option<String>,
    pub fs_changed: bool, // Signal to UI to refresh inspector
}

impl ShellResult {
    pub fn ok(stdout: String, fs_changed: bool) -> Self {
        ShellResult {
            stdout,
            stderr: None,
            fs_changed,
        }
    }

    pub fn error(msg: String) -> Self {
        ShellResult {
            stdout: String::new(),
            stderr: Some(msg),
            fs_changed: false,
        }
    }
}
