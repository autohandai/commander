use std::path::Path;
use tauri::Emitter;

use crate::commands::project_commands::add_project_to_recent;
use crate::commands::git_commands::is_valid_git_repository;

// Menu command handlers
#[tauri::command]
pub async fn menu_new_project(app: tauri::AppHandle) -> Result<(), String> {
    // Emit event to frontend to show new project dialog
    app.emit("menu://new-project", ()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command] 
pub async fn menu_clone_project(app: tauri::AppHandle) -> Result<(), String> {
    // Emit event to frontend to show clone project dialog
    app.emit("menu://clone-project", ()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn menu_open_project(app: tauri::AppHandle) -> Result<(), String> {
    // Use native file picker to select project directory
    use tauri_plugin_dialog::DialogExt;
    use std::sync::{Arc, Mutex};
    use std::sync::mpsc;
    
    let (tx, rx) = mpsc::channel();
    let tx = Arc::new(Mutex::new(Some(tx)));
    
    app.dialog()
        .file()
        .set_title("Open Project Folder")
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
            
            // Add to recent projects
            let _ = add_project_to_recent(app.clone(), path_str.clone()).await;
            
            // Emit event to frontend with selected project path
            app.emit("menu://open-project", path_str).map_err(|e| e.to_string())?;
        },
        Ok(None) => {
            // User cancelled
        },
        Err(_) => {
            return Err("Failed to receive folder selection result".to_string());
        },
    }
    
    Ok(())
}

#[tauri::command]
pub async fn menu_close_project(app: tauri::AppHandle) -> Result<(), String> {
    // Emit event to frontend to close current project
    app.emit("menu://close-project", ()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn menu_delete_project(app: tauri::AppHandle) -> Result<(), String> {
    // Emit event to frontend to show delete project confirmation
    app.emit("menu://delete-project", ()).map_err(|e| e.to_string())?;
    Ok(())
}