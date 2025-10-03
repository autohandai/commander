use std::fs;
use std::path::Path;
use tauri_plugin_store::StoreExt;

use crate::models::*;
use crate::services::project_service;

async fn scan_projects_folder(projects_folder: &str) -> Result<Vec<RecentProject>, String> {
    let path = Path::new(projects_folder);

    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut projects = Vec::new();

    match fs::read_dir(path) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let entry_path = entry.path();

                    // Only consider directories
                    if entry_path.is_dir() {
                        if let Some(name) = entry_path.file_name() {
                            if let Some(name_str) = name.to_str() {
                                // Skip hidden directories
                                if name_str.starts_with('.') {
                                    continue;
                                }

                                let path_str = entry_path.to_string_lossy().to_string();

                                // Check if it's a git repository
                                let git_dir = entry_path.join(".git");
                                let is_git_repo = git_dir.exists();

                                let mut git_branch = None;
                                let mut git_status = None;

                                if is_git_repo {
                                    // Get current git branch
                                    if let Ok(output) = std::process::Command::new("git")
                                        .args(&["-C", &path_str, "branch", "--show-current"])
                                        .output()
                                    {
                                        if output.status.success() {
                                            if let Ok(branch) = String::from_utf8(output.stdout) {
                                                let branch = branch.trim();
                                                if !branch.is_empty() {
                                                    git_branch = Some(branch.to_string());
                                                }
                                            }
                                        }
                                    }

                                    // Get git status (clean/dirty)
                                    if let Ok(output) = std::process::Command::new("git")
                                        .args(&["-C", &path_str, "status", "--porcelain"])
                                        .output()
                                    {
                                        if output.status.success() {
                                            let status_output =
                                                String::from_utf8_lossy(&output.stdout);
                                            git_status = Some(if status_output.trim().is_empty() {
                                                "clean".to_string()
                                            } else {
                                                "dirty".to_string()
                                            });
                                        }
                                    }
                                }

                                // Use file modification time as last accessed
                                let last_accessed = entry_path
                                    .metadata()
                                    .and_then(|m| m.modified())
                                    .map(|t| {
                                        t.duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_secs()
                                            as i64
                                    })
                                    .unwrap_or(0);

                                projects.push(RecentProject {
                                    name: name_str.to_string(),
                                    path: path_str,
                                    last_accessed,
                                    is_git_repo,
                                    git_branch,
                                    git_status,
                                });
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            return Err(format!("Failed to read projects directory: {}", e));
        }
    }

    // Sort by last accessed time (most recent first)
    projects.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));

    // Limit to most recent 10 projects
    projects.truncate(10);

    Ok(projects)
}

#[tauri::command]
pub async fn get_user_home_directory() -> Result<String, String> {
    match dirs::home_dir() {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("Could not determine user home directory".to_string()),
    }
}

#[tauri::command]
pub async fn get_default_projects_folder() -> Result<String, String> {
    match dirs::home_dir() {
        Some(mut path) => {
            path.push("Projects");
            Ok(path.to_string_lossy().to_string())
        }
        None => Err("Could not determine user home directory".to_string()),
    }
}

#[tauri::command]
pub async fn ensure_directory_exists(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory {}: {}", path, e))?;
    Ok(())
}

#[tauri::command]
pub async fn save_projects_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let store = app
        .store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    store.set("projects_folder", serde_json::Value::String(path.clone()));

    store
        .save()
        .map_err(|e| format!("Failed to persist projects folder: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn select_projects_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use std::sync::mpsc;
    use std::sync::{Arc, Mutex};
    use tauri_plugin_dialog::DialogExt;

    let (tx, rx) = mpsc::channel();
    let tx = Arc::new(Mutex::new(Some(tx)));

    app.dialog()
        .file()
        .set_title("Select Default Projects Folder")
        .set_can_create_directories(true)
        .pick_folder(move |folder_path| {
            if let Ok(mut sender) = tx.lock() {
                if let Some(sender) = sender.take() {
                    let _ = sender.send(folder_path.map(|p| p.to_string()));
                }
            }
        });

    match rx.recv() {
        Ok(result) => Ok(result),
        Err(_) => Err("Failed to receive folder selection result".to_string()),
    }
}

#[tauri::command]
pub async fn load_projects_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let store = app
        .store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    match store.get("projects_folder") {
        Some(serde_json::Value::String(path)) => Ok(Some(path)),
        _ => Ok(None),
    }
}

#[tauri::command]
pub async fn list_recent_projects(app: tauri::AppHandle) -> Result<Vec<RecentProject>, String> {
    // Load from persistent storage instead of just scanning current folder
    let store = app
        .store("recent-projects.json")
        .map_err(|e| format!("Failed to access recent projects store: {}", e))?;

    match store.get("projects") {
        Some(value) => {
            let projects: Vec<RecentProject> =
                serde_json::from_value(value).unwrap_or_else(|_| Vec::new());

            let original_count = projects.len();

            // Filter out projects that no longer exist and update git info
            let mut valid_projects = Vec::new();
            for project in projects {
                let path = Path::new(&project.path);
                if path.exists() && path.is_dir() {
                    // Update git information for existing projects
                    let git_dir = path.join(".git");
                    let is_git_repo = git_dir.exists();

                    let mut git_branch = None;
                    let mut git_status = None;

                    if is_git_repo {
                        // Get current branch
                        if let Ok(output) = std::process::Command::new("git")
                            .args(&["branch", "--show-current"])
                            .current_dir(path)
                            .output()
                        {
                            if output.status.success() {
                                git_branch = Some(
                                    String::from_utf8_lossy(&output.stdout).trim().to_string(),
                                );
                            }
                        }

                        // Check if working directory is clean
                        if let Ok(output) = std::process::Command::new("git")
                            .args(&["status", "--porcelain"])
                            .current_dir(path)
                            .output()
                        {
                            if output.status.success() {
                                git_status = if output.stdout.is_empty() {
                                    Some("clean".to_string())
                                } else {
                                    Some("dirty".to_string())
                                };
                            }
                        }
                    }

                    valid_projects.push(RecentProject {
                        name: project.name,
                        path: project.path,
                        last_accessed: project.last_accessed,
                        is_git_repo,
                        git_branch,
                        git_status,
                    });
                }
            }

            // Sort by last accessed time (most recent first)
            valid_projects.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));

            // Limit to 20 most recent projects
            valid_projects.truncate(20);

            // Update the store with the cleaned list
            if valid_projects.len() != original_count {
                let _ = store.set(
                    "projects",
                    serde_json::to_value(&valid_projects).unwrap_or_default(),
                );
                let _ = store.save();
            }

            Ok(valid_projects)
        }
        None => {
            // If no recent projects exist, scan current projects folder as fallback
            let projects_folder = match load_projects_folder(app.clone()).await? {
                Some(folder) => folder,
                None => get_default_projects_folder().await?,
            };

            scan_projects_folder(&projects_folder).await
        }
    }
}

#[tauri::command]
pub async fn add_project_to_recent(
    app: tauri::AppHandle,
    project_path: String,
) -> Result<(), String> {
    project_service::add_project_to_recent_projects(&app, project_path).await
}

#[tauri::command]
pub async fn refresh_recent_projects(app: tauri::AppHandle) -> Result<Vec<RecentProject>, String> {
    // This is the same as list_recent_projects - we always scan fresh
    list_recent_projects(app).await
}

#[tauri::command]
pub async fn clear_recent_projects(app: tauri::AppHandle) -> Result<(), String> {
    println!("🧹 Clearing recent projects storage for development...");

    let store = app
        .store("recent-projects.json")
        .map_err(|e| format!("Failed to access recent projects store: {}", e))?;

    // Clear the projects array
    store.set("projects", serde_json::Value::Array(vec![]));
    store
        .save()
        .map_err(|e| format!("Failed to save cleared recent projects: {}", e))?;

    println!("✅ Recent projects storage cleared successfully!");
    Ok(())
}

#[tauri::command]
pub async fn open_existing_project(
    app: tauri::AppHandle,
    project_path: String,
) -> Result<crate::models::RecentProject, String> {
    project_service::open_existing_project(&app, project_path).await
}

#[tauri::command]
pub async fn check_project_name_conflict(
    projects_folder: String,
    project_name: String,
) -> Result<bool, String> {
    Ok(project_service::check_project_name_conflict(
        &projects_folder,
        &project_name,
    ))
}

#[tauri::command]
pub async fn create_new_project_with_git(
    app: tauri::AppHandle,
    projects_folder: String,
    project_name: String,
) -> Result<String, String> {
    use std::process::Stdio;

    let project_path = std::path::Path::new(&projects_folder).join(&project_name);
    let project_path_str = project_path.to_string_lossy().to_string();

    // Check if project already exists
    if project_path.exists() {
        return Err(format!("A project named '{}' already exists", project_name));
    }

    // Create the directory
    std::fs::create_dir_all(&project_path)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    // Initialize git repository
    let git_init = tokio::process::Command::new("git")
        .args(&["init"])
        .current_dir(&project_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to initialize git repository: {}", e))?;

    if !git_init.status.success() {
        let stderr = String::from_utf8_lossy(&git_init.stderr);
        return Err(format!("Git init failed: {}", stderr));
    }

    // Create README.md file
    let readme_content = format!(
        "# {}\n\nA new project created with Commander.\n",
        project_name
    );
    let readme_path = project_path.join("README.md");
    std::fs::write(&readme_path, readme_content)
        .map_err(|e| format!("Failed to create README.md: {}", e))?;

    // Stage and commit the README
    let git_add = tokio::process::Command::new("git")
        .args(&["add", "README.md"])
        .current_dir(&project_path)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("Failed to stage README: {}", e))?;

    if !git_add.status.success() {
        let stderr = String::from_utf8_lossy(&git_add.stderr);
        return Err(format!("Git add failed: {}", stderr));
    }

    let git_commit = tokio::process::Command::new("git")
        .args(&["commit", "-m", "Initial commit with README"])
        .current_dir(&project_path)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("Failed to commit README: {}", e))?;

    if !git_commit.status.success() {
        let stderr = String::from_utf8_lossy(&git_commit.stderr);
        return Err(format!("Git commit failed: {}", stderr));
    }

    // Add the newly created project to recent projects
    // TODO: Be able to handle this better, I think the history of projects is always flagging the new project correctly but unflagging the previous one I was working.
    if let Err(e) = add_project_to_recent(app, project_path_str.clone()).await {
        eprintln!(
            "⚠️ Warning: Failed to add project to recent projects: {}",
            e
        );
        // Don't fail the whole operation, just log the warning
    }

    println!(
        "✅ Project '{}' created successfully and added to recent projects",
        project_name
    );
    Ok(project_path_str)
}
