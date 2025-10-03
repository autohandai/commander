use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use crate::models::*;
use crate::services::file_service;

// File system helper functions for file mention system
fn is_valid_file_extension(path: &Path, allowed_extensions: &[&str]) -> bool {
    if allowed_extensions.is_empty() {
        return true; // No filtering if no extensions specified
    }

    if let Some(ext) = path.extension() {
        if let Some(ext_str) = ext.to_str() {
            return allowed_extensions
                .iter()
                .any(|&allowed| allowed.eq_ignore_ascii_case(ext_str));
        }
    }
    false
}

fn should_skip_directory(dir_name: &str) -> bool {
    // Skip common directories that shouldn't be indexed for file mentions
    matches!(
        dir_name,
        ".git"
            | ".svn"
            | ".hg"
            | "node_modules"
            | ".next"
            | ".nuxt"
            | "dist"
            | "build"
            | "out"
            | "target"
            | "Cargo.lock"
            | ".vscode"
            | ".idea"
            | "__pycache__"
            | ".pytest_cache"
            | ".DS_Store"
            | "Thumbs.db"
            | "coverage"
            | ".nyc_output"
    )
}

fn collect_files_recursive(
    dir_path: &Path,
    base_path: &Path,
    allowed_extensions: &[&str],
    max_depth: usize,
    current_depth: usize,
) -> Result<Vec<FileInfo>, String> {
    if current_depth > max_depth {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();

    let entries = fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read directory {}: {}", dir_path.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to process directory entry: {}", e))?;

        let entry_path = entry.path();
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy().to_string();

        // Skip hidden files and directories
        if file_name_str.starts_with('.') {
            continue;
        }

        if entry_path.is_dir() {
            // Skip directories we shouldn't index
            if should_skip_directory(&file_name_str) {
                continue;
            }

            // Recursively collect files from subdirectories
            let mut subdir_files = collect_files_recursive(
                &entry_path,
                base_path,
                allowed_extensions,
                max_depth,
                current_depth + 1,
            )?;
            files.append(&mut subdir_files);
        } else if entry_path.is_file() {
            // Check if file has allowed extension
            if is_valid_file_extension(&entry_path, allowed_extensions) {
                let relative_path = entry_path
                    .strip_prefix(base_path)
                    .map_err(|_| "Failed to create relative path".to_string())?
                    .to_string_lossy()
                    .to_string();

                let extension = entry_path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|s| s.to_string());

                files.push(FileInfo {
                    name: file_name_str,
                    path: entry_path.to_string_lossy().to_string(),
                    relative_path,
                    is_directory: false,
                    extension,
                });
            }
        }
    }

    Ok(files)
}

#[tauri::command]
pub async fn get_current_working_directory() -> Result<String, String> {
    let current_dir = env::current_dir()
        .map_err(|e| format!("Failed to get current working directory: {}", e))?;

    Ok(current_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn set_current_working_directory(path: String) -> Result<(), String> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("Directory does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    env::set_current_dir(path)
        .map_err(|e| format!("Failed to set current working directory: {}", e))
}

#[tauri::command]
pub async fn list_files_in_directory(
    directory_path: Option<String>,
    extensions: Option<Vec<String>>,
    max_depth: Option<usize>,
) -> Result<DirectoryListing, String> {
    // Default to current working directory if none specified
    let base_path = match directory_path {
        Some(path) => PathBuf::from(path),
        None => env::current_dir()
            .map_err(|e| format!("Failed to get current working directory: {}", e))?,
    };

    if !base_path.exists() {
        return Err(format!("Directory does not exist: {}", base_path.display()));
    }

    if !base_path.is_dir() {
        return Err(format!("Path is not a directory: {}", base_path.display()));
    }

    // Set reasonable defaults
    let max_depth = max_depth.unwrap_or(5); // Max 5 levels deep
    let allowed_extensions: Vec<&str> = extensions
        .as_ref()
        .map(|exts| exts.iter().map(|s| s.as_str()).collect())
        .unwrap_or_else(|| {
            // Default to common code file extensions
            vec![
                "rs", "js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "h", "hpp", "go", "php",
                "rb", "swift", "kt", "cs", "dart", "vue", "svelte", "html", "css", "scss", "sass",
                "less", "md", "txt", "json", "yaml", "yml", "toml", "xml", "sql", "sh", "bash",
                "zsh", "fish", "ps1", "bat", "cmd",
            ]
        });

    // Collect files recursively
    let files = collect_files_recursive(&base_path, &base_path, &allowed_extensions, max_depth, 0)?;

    // Sort files by relative path for consistent ordering
    let mut sorted_files = files;
    sorted_files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    Ok(DirectoryListing {
        current_directory: base_path.to_string_lossy().to_string(),
        files: sorted_files,
    })
}

#[tauri::command]
pub async fn search_files_by_name(
    directory_path: Option<String>,
    search_term: String,
    extensions: Option<Vec<String>>,
    max_depth: Option<usize>,
) -> Result<DirectoryListing, String> {
    if search_term.trim().is_empty() {
        return Err("Search term cannot be empty".to_string());
    }

    // Get all files first
    let listing = list_files_in_directory(directory_path, extensions, max_depth).await?;

    // Filter by search term (case-insensitive)
    let search_lower = search_term.to_lowercase();
    let filtered_files: Vec<FileInfo> = listing
        .files
        .into_iter()
        .filter(|file| {
            file.name.to_lowercase().contains(&search_lower)
                || file.relative_path.to_lowercase().contains(&search_lower)
        })
        .collect();

    Ok(DirectoryListing {
        current_directory: listing.current_directory,
        files: filtered_files,
    })
}

#[tauri::command]
pub async fn get_file_info(file_path: String) -> Result<Option<FileInfo>, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Ok(None);
    }

    // Get the parent directory to create relative path
    let parent = path.parent().unwrap_or(Path::new(""));
    let relative_path = path
        .strip_prefix(parent)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();

    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_string());

    Ok(Some(FileInfo {
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string()),
        path: path.to_string_lossy().to_string(),
        relative_path,
        is_directory: path.is_dir(),
        extension,
    }))
}

#[tauri::command]
pub async fn read_file_content(file_path: String) -> Result<String, String> {
    file_service::read_file_content(&file_path)
}
