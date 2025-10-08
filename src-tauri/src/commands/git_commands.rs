use crate::services::git_service;
use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use tauri::Emitter;

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
        }
        Err(_) => {
            return Err("Git is not installed or not available in PATH".to_string());
        }
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
    destination: String,
) -> Result<String, String> {
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

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
    let status = child
        .wait()
        .await
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
    let store = app
        .store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    let value = store.get("git_worktree_enabled").and_then(|v| v.as_bool());
    Ok(value.unwrap_or(true))
}

#[tauri::command]
pub async fn set_git_worktree_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;

    // Save the workspace (git worktree) preference to app settings
    let store = app
        .store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    store.set("git_worktree_enabled", serde_json::Value::Bool(enabled));

    store
        .save()
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
    use std::sync::mpsc;
    use std::sync::{Arc, Mutex};
    use tauri_plugin_dialog::DialogExt;

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
        }
        Ok(None) => {
            // User cancelled
            Ok(None)
        }
        Err(_) => Err("Failed to receive folder selection result".to_string()),
    }
}

#[tauri::command]
pub async fn create_workspace_worktree(
    app: tauri::AppHandle,
    project_path: String,
    name: String,
) -> Result<String, String> {
    // Ensure valid repo
    let repo = PathBuf::from(&project_path);
    if !is_valid_git_repository(&repo) {
        return Err("Not a valid git repository".to_string());
    }

    // Ensure .commander directory
    let commander_dir = repo.join(".commander");
    std::fs::create_dir_all(&commander_dir)
        .map_err(|e| format!("Failed to create .commander: {}", e))?;

    // Generate branch name
    let branch = format!("workspace/{}", name);
    let target_path = commander_dir.join(&name);

    // Create worktree on new branch
    let status = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&project_path)
        .args([
            "worktree",
            "add",
            "-B",
            &branch,
            target_path.to_string_lossy().as_ref(),
        ])
        .output()
        .await
        .map_err(|e| format!("git worktree add failed: {}", e))?;
    if !status.status.success() {
        return Err(format!(
            "Failed to add worktree: {}",
            String::from_utf8_lossy(&status.stderr)
        ));
    }

    Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn remove_workspace_worktree(
    project_path: String,
    worktree_path: String,
) -> Result<(), String> {
    // Remove worktree (prunes checked-out tree)
    let status = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&project_path)
        .args(["worktree", "remove", "--force", &worktree_path])
        .output()
        .await
        .map_err(|e| format!("git worktree remove failed: {}", e))?;
    if !status.status.success() {
        return Err(format!(
            "Failed to remove worktree: {}",
            String::from_utf8_lossy(&status.stderr)
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_git_log(
    project_path: String,
    limit: Option<usize>,
) -> Result<Vec<std::collections::HashMap<String, String>>, String> {
    let lim = limit.unwrap_or(50).to_string();
    let output = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&project_path)
        .args([
            "log",
            "--pretty=%H|%an|%ad|%s",
            "--date=iso",
            &format!("-n{}", lim),
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run git log: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut rows = Vec::new();
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.len() == 4 {
            let mut m = std::collections::HashMap::new();
            m.insert("hash".into(), parts[0].into());
            m.insert("author".into(), parts[1].into());
            m.insert("date".into(), parts[2].into());
            m.insert("subject".into(), parts[3].into());
            rows.push(m);
        }
    }
    Ok(rows)
}

async fn get_branch_from_worktree(worktree_path: &str) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .arg("-C")
        .arg(worktree_path)
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .await
        .map_err(|e| format!("Failed to get branch: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command]
pub async fn diff_workspace_vs_main(
    project_path: String,
    worktree_path: String,
) -> Result<Vec<std::collections::HashMap<String, String>>, String> {
    let branch = get_branch_from_worktree(&worktree_path).await?;
    let output = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&project_path)
        .args(["diff", "--name-status", "main...", &branch])
        .output()
        .await
        .map_err(|e| format!("Failed to run git diff: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut rows = Vec::new();
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let mut parts = line.split_whitespace();
        if let (Some(status), Some(path)) = (parts.next(), parts.next()) {
            let mut m = std::collections::HashMap::new();
            m.insert("status".into(), status.into());
            m.insert("path".into(), path.into());
            rows.push(m);
        }
    }
    Ok(rows)
}

#[tauri::command]
pub async fn merge_workspace_to_main(
    project_path: String,
    worktree_path: String,
    message: Option<String>,
) -> Result<(), String> {
    let branch = get_branch_from_worktree(&worktree_path).await?;
    // checkout main
    let co = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&project_path)
        .args(["checkout", "main"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !co.status.success() {
        return Err(String::from_utf8_lossy(&co.stderr).to_string());
    }
    // merge
    let msg = message.unwrap_or_else(|| format!("Merge workspace {} into main", branch));
    let merge = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&project_path)
        .args(["merge", "--no-ff", "-m", &msg, &branch])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !merge.status.success() {
        return Err(String::from_utf8_lossy(&merge.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn diff_workspace_file(
    project_path: String,
    worktree_path: String,
    file_path: String,
) -> Result<String, String> {
    let branch = get_branch_from_worktree(&worktree_path).await?;
    let output = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&project_path)
        .args([
            "diff",
            "-U200",
            &format!("main...{}", branch),
            "--",
            &file_path,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run git diff file: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[derive(serde::Serialize)]
pub struct CommitDagRow {
    pub hash: String,
    pub parents: Vec<String>,
    pub author: String,
    pub date: String,
    pub subject: String,
    pub refs: Vec<String>,
}

#[tauri::command]
pub async fn get_git_branches(project_path: String) -> Result<Vec<String>, String> {
    // List local branches (short names)
    let output = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&project_path)
        .args(["for-each-ref", "--format=%(refname:short)", "refs/heads"])
        .output()
        .await
        .map_err(|e| format!("Failed to list branches: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches: Vec<String> = stdout
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    // Ensure unique and stable order (main first if present)
    branches.sort();
    if let Some(pos) = branches.iter().position(|b| b == "main") {
        let main = branches.remove(pos);
        branches.insert(0, main);
    }
    Ok(branches)
}

#[tauri::command]
pub async fn get_git_commit_dag(
    project_path: String,
    limit: Option<usize>,
    branch: Option<String>,
) -> Result<Vec<CommitDagRow>, String> {
    let lim = limit.unwrap_or(50).to_string();
    let format = "%H|%P|%an|%ad|%s||%D";
    let mut cmd = tokio::process::Command::new("git");
    cmd.arg("-C")
        .arg(&project_path)
        .arg("log")
        .arg("--date=iso")
        .arg(&format!("-n{}", lim))
        .arg(&format!("--pretty={}", format));
    if let Some(b) = branch {
        if !b.trim().is_empty() {
            cmd.arg(b);
        }
    }
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run git log: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut rows = Vec::new();
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.splitn(6, '|').collect();
        if parts.len() < 6 {
            continue;
        }
        let hash = parts[0].to_string();
        let parents = if parts[1].trim().is_empty() {
            vec![]
        } else {
            parts[1].split_whitespace().map(|s| s.to_string()).collect()
        };
        let author = parts[2].to_string();
        let date = parts[3].to_string();
        let subject = parts[4].to_string();
        let refs_str = parts[5];
        let refs: Vec<String> = refs_str
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        rows.push(CommitDagRow {
            hash,
            parents,
            author,
            date,
            subject,
            refs,
        });
    }
    Ok(rows)
}

#[tauri::command]
pub async fn get_commit_diff_files(
    project_path: String,
    commit_hash: String,
) -> Result<Vec<std::collections::HashMap<String, String>>, String> {
    let output = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&project_path)
        .args(["show", "--name-status", "--format=tformat:", &commit_hash])
        .output()
        .await
        .map_err(|e| format!("Failed to run git show: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut rows = Vec::new();
    for line in stdout.lines() {
        let mut parts = line.split_whitespace();
        if let (Some(status), Some(path)) = (parts.next(), parts.next()) {
            let mut m = std::collections::HashMap::new();
            m.insert("status".into(), status.into());
            m.insert("path".into(), path.into());
            rows.push(m);
        }
    }
    Ok(rows)
}

#[tauri::command]
pub async fn get_commit_diff_text(
    project_path: String,
    commit_hash: String,
    file_path: String,
) -> Result<String, String> {
    let output = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&project_path)
        .args(["show", &commit_hash, "-U200", "--", &file_path])
        .output()
        .await
        .map_err(|e| format!("Failed to run git show file: {}", e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn get_file_at_commit(
    project_path: String,
    commit_hash: String,
    file_path: String,
) -> Result<String, String> {
    let spec = format!("{}:{}", commit_hash, file_path);
    let output = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&project_path)
        .args(["show", &spec])
        .output()
        .await
        .map_err(|e| format!("Failed to git show {}: {}", spec, e))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// ---------------- Project Chat History ----------------
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatStep {
    pub id: String,
    pub label: String,
    pub detail: Option<String>,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub started_at: Option<i64>,
    #[serde(default)]
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    pub timestamp: i64,
    pub agent: Option<String>,
    #[serde(default)]
    pub conversation_id: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub steps: Option<Vec<ChatStep>>,
}

fn chat_store_key(project_path: &str) -> String {
    format!("chat::{}", project_path)
}

#[tauri::command]
pub async fn load_project_chat(
    app: tauri::AppHandle,
    project_path: String,
) -> Result<Vec<ChatMessage>, String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("chat-history.json").map_err(|e| e.to_string())?;
    let key = chat_store_key(&project_path);
    let val = store
        .get(&key)
        .map(|v| v.clone())
        .unwrap_or(serde_json::Value::Null);
    let msgs: Vec<ChatMessage> = serde_json::from_value(val).unwrap_or_default();
    Ok(msgs)
}

#[tauri::command]
pub async fn save_project_chat(
    app: tauri::AppHandle,
    project_path: String,
    messages: Vec<ChatMessage>,
) -> Result<(), String> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("chat-history.json").map_err(|e| e.to_string())?;
    let key = chat_store_key(&project_path);
    store.set(
        &key,
        serde_json::to_value(messages).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn append_project_chat_message(
    app: tauri::AppHandle,
    project_path: String,
    message: ChatMessage,
) -> Result<(), String> {
    let mut existing = load_project_chat(app.clone(), project_path.clone()).await?;
    existing.push(message);
    save_project_chat(app, project_path, existing).await
}

static CLI_PROJECT_PATH: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

#[tauri::command]
pub async fn get_cli_project_path() -> Result<Option<String>, String> {
    let path = CLI_PROJECT_PATH.lock().map_err(|e| e.to_string())?.clone();
    Ok(path)
}

#[tauri::command]
pub async fn clear_cli_project_path() -> Result<(), String> {
    let mut path = CLI_PROJECT_PATH.lock().map_err(|e| e.to_string())?;
    *path = None;
    Ok(())
}

pub fn set_cli_project_path(path: String) {
    if let Ok(mut cli_path) = CLI_PROJECT_PATH.lock() {
        *cli_path = Some(path);
    }
}

#[tauri::command]
pub async fn open_project_from_path(
    app: tauri::AppHandle,
    current_path: String,
) -> Result<String, String> {
    use std::env;

    // Get the absolute path
    let path = Path::new(&current_path);
    let absolute_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        env::current_dir()
            .map_err(|e| format!("Failed to get current directory: {}", e))?
            .join(path)
    };

    let path_str = absolute_path.to_string_lossy().to_string();

    // Try to resolve git project path (handles worktrees, submodules, regular repos)
    if let Some(git_root) = git_service::resolve_git_project_path(&path_str) {
        println!("🔍 Git root found: {}", git_root);

        // Found git repository, emit event to frontend to load this project
        println!("📡 Emitting open-project event with path: {}", git_root);
        app.emit("open-project", git_root.clone())
            .map_err(|e| format!("Failed to emit open-project event: {}", e))?;

        println!("✅ open-project event emitted successfully");
        Ok(git_root)
    } else {
        Err(format!(
            "Directory '{}' is not a git repository or contains no git project",
            current_path
        ))
    }
}
