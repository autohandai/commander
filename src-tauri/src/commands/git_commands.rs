use std::collections::HashMap;
use tauri::Emitter;
use std::path::Path;
use crate::services::git_service;
use std::path::PathBuf;

#[tauri::command]
pub async fn validate_git_repository_url(url: String) -> Result<bool, String> {
    use std::process::Stdio;
    
    // Validate that git is available
    let git_check = tokio::process::Command::new("git")
        .arg("--version")
        .output()
        .await;
    
    match git_check {
        Ok(output) if !output.status.success() => {
            return Err("Git is not installed or not available in PATH".to_string());
        },
        Err(_) => {
            return Err("Git is not installed or not available in PATH".to_string());
        },
        _ => {}
    }

    // Use git ls-remote to check if repository URL is valid and accessible
    let output = tokio::process::Command::new("git")
        .args(&["ls-remote", "--heads", &url])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to validate repository: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Repository validation failed: {}", stderr));
    }

    Ok(true)
}

#[tauri::command]
pub async fn clone_repository(
    app: tauri::AppHandle,
    url: String, 
    destination: String
) -> Result<String, String> {
    use tokio::process::Command;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use std::process::Stdio;
    
    // Create parent directory if it doesn't exist
    if let Some(parent) = std::path::Path::new(&destination).parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return Err(format!("Failed to create parent directory: {}", e));
        }
    }

    // Execute git clone command with progress
    let mut child = Command::new("git")
        .args(&["clone", "--progress", &url, &destination])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to execute git clone: {}", e))?;

    // Stream stderr (git outputs progress to stderr)
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        
        while let Some(line) = lines.next_line().await.unwrap_or(None) {
            // Emit progress to frontend
            let _ = app.emit("clone-progress", line.clone());
        }
    }

    // Wait for the process to complete
    let status = child.wait().await
        .map_err(|e| format!("Failed to wait for git clone: {}", e))?;

    if !status.success() {
        return Err("Git clone failed. Check the console output for details.".to_string());
    }

    Ok(format!("Repository cloned successfully to {}", destination))
}

#[tauri::command]
pub async fn get_git_global_config() -> Result<HashMap<String, String>, String> {
    let output = tokio::process::Command::new("git")
        .args(&["config", "--global", "--list"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute git config --global --list: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git global config command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut config = HashMap::new();

    for line in stdout.lines() {
        if let Some((key, value)) = line.split_once('=') {
            config.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    Ok(config)
}

#[tauri::command]
pub async fn get_git_local_config() -> Result<HashMap<String, String>, String> {
    let output = tokio::process::Command::new("git")
        .args(&["config", "--local", "--list"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute git config --local --list: {}", e))?;

    if !output.status.success() {
        // Not in a git repository - return empty config
        return Ok(HashMap::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut config = HashMap::new();

    for line in stdout.lines() {
        if let Some((key, value)) = line.split_once('=') {
            config.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    Ok(config)
}

#[tauri::command]
pub async fn get_git_aliases() -> Result<HashMap<String, String>, String> {
    let output = tokio::process::Command::new("git")
        .args(&["config", "--global", "--get-regexp", "alias\\..*"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute git config for aliases: {}", e))?;

    if !output.status.success() {
        // No aliases found - return empty HashMap
        return Ok(HashMap::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut aliases = HashMap::new();

    for line in stdout.lines() {
        if let Some((key, value)) = line.split_once(' ') {
            if let Some(alias_name) = key.strip_prefix("alias.") {
                aliases.insert(alias_name.to_string(), value.trim().to_string());
            }
        }
    }

    Ok(aliases)
}

#[tauri::command]
pub async fn get_git_worktree_enabled() -> Result<bool, String> {
    // Backward-compat: returns if git worktree is supported and available
    let output = tokio::process::Command::new("git")
        .args(&["worktree", "--help"])
        .output()
        .await
        .map_err(|e| format!("Failed to check git worktree support: {}", e))?;

    // Git worktree is available if the help command succeeds
    Ok(output.status.success())
}

/// Returns user's preference for using worktrees (defaults to true if unset)
#[tauri::command]
pub async fn get_git_worktree_preference(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    let value = store.get("git_worktree_enabled").and_then(|v| v.as_bool());
    Ok(value.unwrap_or(true))
}

#[tauri::command]
pub async fn set_git_worktree_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    
    // Save the workspace (git worktree) preference to app settings
    let store = app.store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    store.set("git_worktree_enabled", serde_json::Value::Bool(enabled));
    
    store.save()
        .map_err(|e| format!("Failed to persist git worktree setting: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn get_git_worktrees() -> Result<Vec<HashMap<String, String>>, String> {
    let output = tokio::process::Command::new("git")
        .args(&["worktree", "list", "--porcelain"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute git worktree list: {}", e))?;

    if !output.status.success() {
        // Not in a git repository or worktree not supported
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_worktree = HashMap::new();

    for line in stdout.lines() {
        if line.starts_with("worktree ") {
            if !current_worktree.is_empty() {
                worktrees.push(current_worktree);
                current_worktree = HashMap::new();
            }
            current_worktree.insert("path".to_string(), line[9..].to_string());
        } else if line.starts_with("HEAD ") {
            current_worktree.insert("head".to_string(), line[5..].to_string());
        } else if line.starts_with("branch ") {
            current_worktree.insert("branch".to_string(), line[7..].to_string());
        } else if line == "bare" {
            current_worktree.insert("bare".to_string(), "true".to_string());
        } else if line == "detached" {
            current_worktree.insert("detached".to_string(), "true".to_string());
        }
    }

    if !current_worktree.is_empty() {
        worktrees.push(current_worktree);
    }

    Ok(worktrees)
}

// Helper function to validate if a directory is a git repository
pub fn is_valid_git_repository(path: &Path) -> bool {
    git_service::is_valid_git_repository(path.to_str().unwrap_or(""))
}

#[tauri::command]
pub async fn validate_git_repository(project_path: String) -> Result<bool, String> {
    let path = Path::new(&project_path);
    
    if !path.exists() || !path.is_dir() {
        return Ok(false);
    }
    
    Ok(is_valid_git_repository(path))
}

#[tauri::command]
pub async fn select_git_project_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    use std::sync::{Arc, Mutex};
    use std::sync::mpsc;
    
    let (tx, rx) = mpsc::channel();
    let tx = Arc::new(Mutex::new(Some(tx)));
    
    app.dialog()
        .file()
        .set_title("Open Git Project")
        .set_can_create_directories(false)
        .pick_folder(move |folder_path| {
            if let Ok(mut sender) = tx.lock() {
                if let Some(sender) = sender.take() {
                    let _ = sender.send(folder_path);
                }
            }
        });
    
    match rx.recv() {
        Ok(Some(path)) => {
            let path_str = match path {
                tauri_plugin_dialog::FilePath::Path(p) => p.to_string_lossy().to_string(),
                tauri_plugin_dialog::FilePath::Url(u) => u.to_string(),
            };
            
            // Validate that the selected folder is a git repository
            let selected_path = Path::new(&path_str);
            if !is_valid_git_repository(selected_path) {
                return Err("Selected folder is not a valid git repository. Please select a folder containing a .git directory.".to_string());
            }
            
            Ok(Some(path_str))
        },
        Ok(None) => {
            // User cancelled
            Ok(None)
        },
        Err(_) => {
            Err("Failed to receive folder selection result".to_string())
        },
    }
}

#[tauri::command]
pub async fn create_workspace_worktree(app: tauri::AppHandle, project_path: String, name: String) -> Result<String, String> {
    // Ensure valid repo
    let repo = PathBuf::from(&project_path);
    if !is_valid_git_repository(&repo) { return Err("Not a valid git repository".to_string()); }

    // Ensure .commander directory
    let commander_dir = repo.join(".commander");
    std::fs::create_dir_all(&commander_dir).map_err(|e| format!("Failed to create .commander: {}", e))?;

    // Generate branch name
    let branch = format!("workspace/{}", name);
    let target_path = commander_dir.join(&name);

    // Create worktree on new branch
    let status = tokio::process::Command::new("git")
        .arg("-C").arg(&project_path)
        .args(["worktree","add","-B", &branch, target_path.to_string_lossy().as_ref()])
        .output().await.map_err(|e| format!("git worktree add failed: {}", e))?;
    if !status.status.success() {
        return Err(format!("Failed to add worktree: {}", String::from_utf8_lossy(&status.stderr)));
    }

    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn remove_workspace_worktree(project_path: String, worktree_path: String) -> Result<(), String> {
    // Remove worktree (prunes checked-out tree)
    let status = tokio::process::Command::new("git")
        .arg("-C").arg(&project_path)
        .args(["worktree","remove","--force", &worktree_path])
        .output().await.map_err(|e| format!("git worktree remove failed: {}", e))?;
    if !status.status.success() {
        return Err(format!("Failed to remove worktree: {}", String::from_utf8_lossy(&status.stderr)));
    }
    Ok(())
}
