use tauri::Emitter;

use crate::commands::project_commands::open_existing_project as cmd_open_existing_project;

// Menu command handlers
#[tauri::command]
pub async fn menu_new_project(app: tauri::AppHandle) -> Result<(), String> {
    // Emit event to frontend to show new project dialog
    app.emit("menu://new-project", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn menu_clone_project(app: tauri::AppHandle) -> Result<(), String> {
    // Emit event to frontend to show clone project dialog
    app.emit("menu://clone-project", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn menu_open_project(app: tauri::AppHandle) -> Result<(), String> {
    // Use native file picker to select project directory
    use std::sync::mpsc;
    use std::sync::{Arc, Mutex};
    use tauri_plugin_dialog::DialogExt;

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

            // Delegate to backend service via command: validates, sets cwd, dedups + persists recent
            match cmd_open_existing_project(app.clone(), path_str.clone()).await {
                Ok(_recent) => {
                    // Emit event to frontend with selected project path
                    app.emit("menu://open-project", path_str)
                        .map_err(|e| e.to_string())?;
                }
                Err(e) => return Err(e),
            }
        }
        Ok(None) => {
            // User cancelled
        }
        Err(_) => {
            return Err("Failed to receive folder selection result".to_string());
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn menu_close_project(app: tauri::AppHandle) -> Result<(), String> {
    // Emit event to frontend to close current project
    app.emit("menu://close-project", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn menu_delete_project(app: tauri::AppHandle) -> Result<(), String> {
    // Emit event to frontend to show delete project confirmation
    app.emit("menu://delete-project", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}
