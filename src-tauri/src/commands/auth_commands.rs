use crate::models::auth::{AuthUser, StoredAuth};
use crate::services::auth_service;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "auth-store.json";
const KEY_TOKEN: &str = "auth_token";
const KEY_USER: &str = "auth_user";

#[tauri::command]
pub async fn store_auth_token(
    app: tauri::AppHandle,
    token: String,
    user: AuthUser,
    device_id: String,
) -> Result<(), String> {
    // Store in Tauri secure store
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(KEY_TOKEN, serde_json::json!(token));
    store.set(KEY_USER, serde_json::to_value(&user).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())?;

    // Also save to ~/.autohand/sessions/ for CLI sharing
    let sessions_dir = auth_service::get_default_sessions_dir()?;
    let stored = StoredAuth {
        token,
        user,
        device_id,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    auth_service::save_auth_to_file(&sessions_dir, &stored)?;

    Ok(())
}

#[tauri::command]
pub async fn get_auth_token(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let token = store.get(KEY_TOKEN);
    match token {
        Some(val) => Ok(val.as_str().map(|s| s.to_string())),
        None => {
            // Fallback: check ~/.autohand/sessions/
            let sessions_dir = auth_service::get_default_sessions_dir()?;
            let stored = auth_service::load_auth_from_file(&sessions_dir)?;
            Ok(stored.map(|s| s.token))
        }
    }
}

#[tauri::command]
pub async fn get_auth_user(app: tauri::AppHandle) -> Result<Option<AuthUser>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let user_val = store.get(KEY_USER);
    match user_val {
        Some(val) => {
            let user: AuthUser =
                serde_json::from_value(val.clone()).map_err(|e| e.to_string())?;
            Ok(Some(user))
        }
        None => {
            // Fallback: check ~/.autohand/sessions/
            let sessions_dir = auth_service::get_default_sessions_dir()?;
            let stored = auth_service::load_auth_from_file(&sessions_dir)?;
            Ok(stored.map(|s| s.user))
        }
    }
}

#[tauri::command]
pub async fn clear_auth_token(app: tauri::AppHandle) -> Result<(), String> {
    // Clear from Tauri store
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.delete(KEY_TOKEN);
    store.delete(KEY_USER);
    store.save().map_err(|e| e.to_string())?;

    // Clear from ~/.autohand/sessions/
    let sessions_dir = auth_service::get_default_sessions_dir()?;
    auth_service::clear_auth_file(&sessions_dir)?;

    Ok(())
}
