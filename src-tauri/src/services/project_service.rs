use crate::models::*;
use crate::services::git_service::*;
use std::path::Path;
use tauri_plugin_store::StoreExt;

/// Pure helper: upsert a recent project into list with MRU ordering and cap
pub fn upsert_recent_projects(
    mut projects: Vec<RecentProject>,
    new_item: RecentProject,
    cap: usize,
) -> Vec<RecentProject> {
    // Remove any existing entry with same path (dedup)
    projects.retain(|p| p.path != new_item.path);
    // Insert newest at the front (MRU)
    projects.insert(0, new_item);
    // Order by last_accessed desc (MRU semantics) before capping
    projects.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));
    // Cap length
    if projects.len() > cap {
        projects.truncate(cap);
    }
    projects
}

/// Check if project name conflicts with existing directories
pub fn check_project_name_conflict(projects_folder: &str, project_name: &str) -> bool {
    let project_path = Path::new(projects_folder).join(project_name);
    project_path.exists()
}

/// Add a project to the recent projects list
pub async fn add_project_to_recent_projects(
    app: &tauri::AppHandle,
    project_path: String,
) -> Result<(), String> {
    // Align with commands recent projects store: keep "projects" as an ARRAY of RecentProject
    let store = app
        .store("recent-projects.json")
        .map_err(|e| format!("Failed to access recent projects store: {}", e))?;

    // Get existing projects as an array for consistent schema
    let mut existing: Vec<RecentProject> = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Create new recent project entry
    let project_name = Path::new(&project_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown Project")
        .to_string();

    let is_git_repo = is_valid_git_repository(&project_path);
    let git_branch = if is_git_repo {
        get_git_branch(&project_path)
    } else {
        None
    };
    let git_status = if is_git_repo {
        get_git_status(&project_path)
    } else {
        None
    };

    let new_project = RecentProject {
        name: project_name,
        path: project_path.clone(),
        last_accessed: chrono::Utc::now().timestamp(),
        is_git_repo,
        git_branch,
        git_status,
    };

    // Dedup, MRU insert, and cap at 20
    existing = upsert_recent_projects(existing, new_project, 20);

    // Save back to store as array (consistent with list_recent_projects and open_existing_project)
    let serialized = serde_json::to_value(&existing)
        .map_err(|e| format!("Failed to serialize projects: {}", e))?;
    store.set("projects", serialized);
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Pure core for opening an existing project: validates git, builds entry,
/// and returns updated MRU list (dedup, cap=20) without side effects.
pub fn open_existing_project_core(
    existing: Vec<RecentProject>,
    project_path: &str,
    now_ts: i64,
) -> Result<Vec<RecentProject>, String> {
    if !is_valid_git_repository(project_path) {
        return Err("Selected folder is not a valid git repository".to_string());
    }

    let project_name = Path::new(project_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown Project")
        .to_string();

    let new_item = RecentProject {
        name: project_name,
        path: project_path.to_string(),
        last_accessed: now_ts,
        is_git_repo: true,
        git_branch: get_git_branch(project_path),
        git_status: get_git_status(project_path),
    };

    Ok(upsert_recent_projects(existing, new_item, 20))
}

/// Open existing project end-to-end: validate git, set as active cwd,
/// persist recent MRU list, and return the new RecentProject entry.
pub async fn open_existing_project(
    app: &tauri::AppHandle,
    project_path: String,
) -> Result<RecentProject, String> {
    // Validate path and repo
    let p = Path::new(&project_path);
    if !p.exists() || !p.is_dir() {
        return Err("Selected path does not exist or is not a directory".to_string());
    }
    if !is_valid_git_repository(&project_path) {
        return Err("Selected folder is not a valid git repository".to_string());
    }

    // Load store
    let store = app
        .store("recent-projects.json")
        .map_err(|e| format!("Failed to access recent projects store: {}", e))?;

    let existing: Vec<RecentProject> = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    // Compute updated MRU list
    let now = chrono::Utc::now().timestamp();
    let updated = open_existing_project_core(existing, &project_path, now)?;
    let new_item = updated
        .first()
        .cloned()
        .ok_or_else(|| "Failed to update recent projects".to_string())?;

    // Persist
    let serialized = serde_json::to_value(&updated)
        .map_err(|e| format!("Failed to serialize projects: {}", e))?;
    store.set("projects", serialized);
    store
        .save()
        .map_err(|e| format!("Failed to save store: {}", e))?;

    // Set active working directory
    std::env::set_current_dir(&project_path)
        .map_err(|e| format!("Failed to set working directory: {}", e))?;

    Ok(new_item)
}
