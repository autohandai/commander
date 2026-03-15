use crate::models::*;
use crate::services::git_service::*;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri_plugin_store::StoreExt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProjectApplicationSpec {
    pub id: &'static str,
    pub label: &'static str,
    pub bundle_name: &'static str,
}

const PROJECT_APPLICATION_SPECS: &[ProjectApplicationSpec] = &[
    ProjectApplicationSpec { id: "cursor", label: "Cursor", bundle_name: "Cursor.app" },
    ProjectApplicationSpec { id: "antigravity", label: "Antigravity", bundle_name: "Antigravity.app" },
    ProjectApplicationSpec { id: "zed", label: "Zed", bundle_name: "Zed.app" },
    ProjectApplicationSpec { id: "sublime-text", label: "Sublime Text", bundle_name: "Sublime Text.app" },
    ProjectApplicationSpec { id: "xcode", label: "Xcode", bundle_name: "Xcode.app" },
    ProjectApplicationSpec { id: "iterm", label: "iTerm", bundle_name: "iTerm.app" },
    ProjectApplicationSpec { id: "warp", label: "Warp", bundle_name: "Warp.app" },
    ProjectApplicationSpec { id: "terminal", label: "Terminal", bundle_name: "Terminal.app" },
    ProjectApplicationSpec { id: "ghostty", label: "Ghostty", bundle_name: "Ghostty.app" },
    ProjectApplicationSpec { id: "vs-code", label: "VS Code", bundle_name: "Visual Studio Code.app" },
    ProjectApplicationSpec { id: "jetbrains", label: "JetBrains", bundle_name: "JetBrains Toolbox.app" },
    ProjectApplicationSpec { id: "windsurf", label: "Windsurf", bundle_name: "Windsurf.app" },
    ProjectApplicationSpec { id: "trae",     label: "Trae",     bundle_name: "Trae.app" },
];

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

/// Deduplicate a list of recent projects by `path` while preserving order.
/// Assumes input is already ordered by MRU (e.g., sorted by last_accessed desc),
/// and keeps the first occurrence of each unique path.
pub fn dedup_recent_projects_by_path(projects: Vec<RecentProject>) -> Vec<RecentProject> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<RecentProject> = Vec::with_capacity(projects.len());
    for p in projects.into_iter() {
        if seen.insert(p.path.clone()) {
            out.push(p);
        }
    }
    out
}

pub fn remove_recent_project_by_path(
    projects: Vec<RecentProject>,
    target_path: &str,
) -> Vec<RecentProject> {
    projects
        .into_iter()
        .filter(|project| project.path != target_path)
        .collect()
}

pub fn delete_project_directory(project_path: &str) -> Result<(), String> {
    let path = Path::new(project_path);
    if !path.exists() {
        return Err("Project path does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Project path is not a directory".to_string());
    }

    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve project path: {}", e))?;

    if canonical.parent().is_none() {
        return Err("Refusing to delete an unsafe path".to_string());
    }

    if let Some(home_dir) = dirs::home_dir() {
        if canonical == home_dir {
            return Err("Refusing to delete the home directory".to_string());
        }
    }

    if let Ok(current_dir) = std::env::current_dir() {
        if current_dir.starts_with(&canonical) {
            let fallback_dir = canonical
                .parent()
                .map(|parent| parent.to_path_buf())
                .or_else(dirs::home_dir)
                .ok_or_else(|| "Failed to determine a safe working directory".to_string())?;
            std::env::set_current_dir(&fallback_dir)
                .map_err(|e| format!("Failed to change working directory before delete: {}", e))?;
        }
    }

    std::fs::remove_dir_all(&canonical)
        .map_err(|e| format!("Failed to delete project directory: {}", e))?;

    Ok(())
}

pub fn open_directory_in_file_manager(project_path: &str) -> Result<(), String> {
    let path = Path::new(project_path);
    if !path.exists() {
        return Err("Project path does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Project path is not a directory".to_string());
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(project_path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(project_path);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(project_path);
        command
    };

    command
        .spawn()
        .map_err(|e| format!("Failed to open project directory: {}", e))?;

    Ok(())
}

pub fn project_application_spec(application_id: &str) -> Result<ProjectApplicationSpec, String> {
    PROJECT_APPLICATION_SPECS
        .iter()
        .copied()
        .find(|spec| spec.id == application_id)
        .ok_or_else(|| format!("Unknown application: {}", application_id))
}

fn mac_application_search_paths(bundle_name: &str) -> Vec<PathBuf> {
    let mut candidates = vec![PathBuf::from("/Applications").join(bundle_name)];
    if let Some(home_dir) = dirs::home_dir() {
        candidates.push(home_dir.join("Applications").join(bundle_name));
    }
    candidates
}

fn find_installed_mac_application_path(spec: &ProjectApplicationSpec) -> Option<PathBuf> {
    mac_application_search_paths(spec.bundle_name)
        .into_iter()
        .find(|path| path.exists())
}

pub fn list_available_project_applications() -> Vec<ProjectApplicationTarget> {
    #[cfg(target_os = "macos")]
    {
        PROJECT_APPLICATION_SPECS
            .iter()
            .map(|spec| ProjectApplicationTarget {
                id: spec.id.to_string(),
                label: spec.label.to_string(),
                installed: find_installed_mac_application_path(spec).is_some(),
            })
            .collect()
    }

    #[cfg(not(target_os = "macos"))]
    {
        Vec::new()
    }
}

pub fn open_project_with_application(
    project_path: &str,
    application_id: &str,
) -> Result<(), String> {
    let path = Path::new(project_path);
    if !path.exists() {
        return Err("Project path does not exist".to_string());
    }
    if !path.is_dir() {
        return Err("Project path is not a directory".to_string());
    }

    let spec = project_application_spec(application_id)?;

    #[cfg(target_os = "macos")]
    {
        let installed_path = find_installed_mac_application_path(&spec);
        let Some(installed_path) = installed_path else {
            return Err(format!("Application is not installed: {}", spec.label));
        };

        let mut command = Command::new("open");
        command.arg("-a").arg(&installed_path).arg(project_path);
        command
            .spawn()
            .map_err(|e| format!("Failed to open project with {}: {}", spec.label, e))?;

        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = spec;
        Err("Opening a project with a specific application is not supported on this platform".to_string())
    }
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
