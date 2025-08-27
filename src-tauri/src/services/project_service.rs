use crate::models::*;
use crate::services::git_service::*;
use std::path::Path;
use tauri_plugin_store::StoreExt;

/// Check if project name conflicts with existing directories
pub fn check_project_name_conflict(projects_folder: &str, project_name: &str) -> bool {
    let project_path = Path::new(projects_folder).join(project_name);
    project_path.exists()
}


/// Add a project to the recent projects list
pub async fn add_project_to_recent_projects(app: &tauri::AppHandle, project_path: String) -> Result<(), String> {
    let store = app.store("projects.json").map_err(|e| format!("Failed to access store: {}", e))?;
    
    // Get existing projects
    let mut projects_data: ProjectsData = store
        .get("projects")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or(ProjectsData { projects: vec![] });

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

    // Remove existing entry if it exists
    projects_data.projects.retain(|p| p.path != project_path);
    
    // Add new entry at the beginning
    projects_data.projects.insert(0, new_project);
    
    // Keep only the most recent 10 projects
    projects_data.projects.truncate(10);

    // Save back to store
    let serialized = serde_json::to_value(&projects_data)
        .map_err(|e| format!("Failed to serialize projects: {}", e))?;
    
    store.set("projects", serialized);
    store.save().map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

