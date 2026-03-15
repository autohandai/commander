use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Runtime;
use tauri_plugin_store::StoreExt;

use crate::models::*;

fn ensure_root_object(root: &mut serde_json::Value) {
    if !root.is_object() {
        *root = serde_json::json!({});
    }
}

fn write_app_settings_to_root(
    root: &mut serde_json::Value,
    settings: &AppSettings,
) -> Result<(), String> {
    ensure_root_object(root);
    let serialized = serde_json::to_value(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    root["app_settings"] = serialized;

    if let Some(obj) = root.as_object_mut() {
        obj.remove("general");
        obj.remove("code");
    }

    Ok(())
}

fn read_app_settings_from_root(root: &serde_json::Value) -> Option<AppSettings> {
    root.get("app_settings")
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
}

fn read_legacy_show_recent(root: &serde_json::Value) -> Option<bool> {
    root.get("general")
        .and_then(|g| g.get("show_recent_projects_welcome_screen"))
        .and_then(|b| b.as_bool())
}

fn read_legacy_auto_collapse(root: &serde_json::Value) -> Option<bool> {
    root.get("code")
        .and_then(|code| code.get("auto_collapse_sidebar"))
        .and_then(|value| value.as_bool())
}

fn app_settings_has_show_recent(root: &serde_json::Value) -> bool {
    root.get("app_settings")
        .and_then(|a| a.get("show_welcome_recent_projects"))
        .is_some()
}

fn app_settings_has_auto_collapse(root: &serde_json::Value) -> bool {
    root.get("app_settings")
        .and_then(|a| a.get("code_settings"))
        .and_then(|c| c.get("auto_collapse_sidebar"))
        .is_some()
}

fn hydrate_app_settings_from_root(root: &serde_json::Value) -> AppSettings {
    let mut settings = read_app_settings_from_root(root).unwrap_or_else(AppSettings::default);

    if !app_settings_has_show_recent(root) {
        if let Some(show) = read_legacy_show_recent(root) {
            settings.show_welcome_recent_projects = show;
        }
    }

    if !app_settings_has_auto_collapse(root) {
        if let Some(auto) = read_legacy_auto_collapse(root) {
            settings.code_settings.auto_collapse_sidebar = auto;
        }
    }

    settings
}

pub(crate) async fn save_app_settings_internal<R: Runtime>(
    app: tauri::AppHandle<R>,
    mut settings: AppSettings,
) -> Result<(), String> {
    settings.normalize();
    let store = app
        .store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    store.set("app_settings", serialized_settings);
    if let Some(ref folder) = settings.projects_folder {
        store.set("projects_folder", serde_json::Value::String(folder.clone()));
    } else {
        let _ = store.delete("projects_folder");
    }
    store
        .save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;

    let mut root = load_user_settings_json()?;
    write_app_settings_to_root(&mut root, &settings)?;
    save_user_settings_json(root)
}

pub(crate) async fn load_app_settings_internal<R: Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<AppSettings, String> {
    let store = app
        .store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let mut settings = match store.get("app_settings") {
        Some(value) => serde_json::from_value(value)
            .map_err(|e| format!("Failed to deserialize settings: {}", e))?,
        None => AppSettings::default(),
    };

    let mut root = load_user_settings_json()?;
    if let Some(file_settings) = read_app_settings_from_root(&root) {
        settings = file_settings;
    }

    if let Some(show) = read_legacy_show_recent(&root) {
        settings.show_welcome_recent_projects = show;
    }
    if let Some(auto) = read_legacy_auto_collapse(&root) {
        settings.code_settings.auto_collapse_sidebar = auto;
    }

    if settings.projects_folder.is_none() {
        if let Some(serde_json::Value::String(path)) = store.get("projects_folder") {
            settings.projects_folder = Some(path);
        }
    }

    settings.normalize();

    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    store.set("app_settings", serialized_settings);
    store
        .save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;

    write_app_settings_to_root(&mut root, &settings)?;
    save_user_settings_json(root)?;

    Ok(settings)
}

#[tauri::command]
pub async fn save_app_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    save_app_settings_internal(app, settings).await
}

#[tauri::command]
pub async fn set_window_theme(window: tauri::Window, theme: String) -> Result<(), String> {
    use tauri::Theme;
    let opt = match theme.as_str() {
        "dark" => Some(Theme::Dark),
        "light" => Some(Theme::Light),
        // "auto" or anything else: follow system
        _ => None,
    };
    window
        .set_theme(opt)
        .map_err(|e| format!("Failed to set window theme: {}", e))
}

#[tauri::command]
pub async fn load_app_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    load_app_settings_internal(app).await
}

#[tauri::command]
pub async fn get_show_recent_projects_setting() -> Result<bool, String> {
    get_show_recent_projects_welcome_screen()
}

#[tauri::command]
pub async fn set_show_recent_projects_setting(enabled: bool) -> Result<(), String> {
    set_show_recent_projects_welcome_screen(enabled)
}

#[tauri::command]
pub async fn save_agent_settings(
    app: tauri::AppHandle,
    settings: HashMap<String, bool>,
) -> Result<(), String> {
    let store = app
        .store("agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    store.set("agent_settings", serialized_settings);

    store
        .save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn save_all_agent_settings(
    app: tauri::AppHandle,
    settings: AllAgentSettings,
) -> Result<(), String> {
    let store = app
        .store("all-agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    store.set("all_agent_settings", serialized_settings);

    store
        .save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn load_all_agent_settings(app: tauri::AppHandle) -> Result<AllAgentSettings, String> {
    let store = app
        .store("all-agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    match store.get("all_agent_settings") {
        Some(value) => {
            let settings: AllAgentSettings = serde_json::from_value(value)
                .map_err(|e| format!("Failed to deserialize settings: {}", e))?;
            Ok(settings)
        }
        None => {
            // Return default settings
            Ok(AllAgentSettings::default())
        }
    }
}

fn user_settings_path() -> Result<PathBuf, String> {
    let home =
        dirs::home_dir().ok_or_else(|| "Could not determine user home directory".to_string())?;
    let dir = home.join(".commander");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    }
    Ok(dir.join("settings.json"))
}

fn load_user_settings_json() -> Result<serde_json::Value, String> {
    let path = user_settings_path()?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read settings.json: {}", e))?;
    let v: serde_json::Value = serde_json::from_str(&content).unwrap_or(serde_json::json!({}));
    Ok(v)
}

fn save_user_settings_json(mut root: serde_json::Value) -> Result<(), String> {
    let path = user_settings_path()?;
    // Ensure object root
    if !root.is_object() {
        root = serde_json::json!({});
    }
    let mut content = serde_json::to_string_pretty(&root)
        .map_err(|e| format!("Failed to serialize settings.json: {}", e))?;
    if !content.ends_with('\n') {
        content.push('\n');
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write settings.json: {}", e))?;
    Ok(())
}

fn get_show_recent_projects_welcome_screen() -> Result<bool, String> {
    let root = load_user_settings_json()?;
    let settings = hydrate_app_settings_from_root(&root);
    Ok(settings.show_welcome_recent_projects)
}

fn set_show_recent_projects_welcome_screen(enabled: bool) -> Result<(), String> {
    let mut root = load_user_settings_json()?;
    let mut settings = hydrate_app_settings_from_root(&root);
    settings.show_welcome_recent_projects = enabled;
    write_app_settings_to_root(&mut root, &settings)?;
    save_user_settings_json(root)
}

fn get_code_auto_collapse_sidebar() -> Result<Option<bool>, String> {
    let root = load_user_settings_json()?;
    let settings = hydrate_app_settings_from_root(&root);
    Ok(Some(settings.code_settings.auto_collapse_sidebar))
}

fn set_code_auto_collapse_sidebar(enabled: bool) -> Result<(), String> {
    let mut root = load_user_settings_json()?;
    let mut settings = hydrate_app_settings_from_root(&root);
    settings.code_settings.auto_collapse_sidebar = enabled;
    write_app_settings_to_root(&mut root, &settings)?;
    save_user_settings_json(root)
}

// Expose code auto-collapse setting via commands to avoid dead_code and enable UI wiring
#[tauri::command]
pub async fn get_code_auto_collapse_sidebar_setting() -> Result<Option<bool>, String> {
    get_code_auto_collapse_sidebar()
}

#[tauri::command]
pub async fn set_code_auto_collapse_sidebar_setting(enabled: bool) -> Result<(), String> {
    set_code_auto_collapse_sidebar(enabled)
}

#[tauri::command]
pub async fn load_agent_settings(app: tauri::AppHandle) -> Result<HashMap<String, bool>, String> {
    let store = app
        .store("agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    match store.get("agent_settings") {
        Some(value) => {
            let settings: HashMap<String, bool> = serde_json::from_value(value)
                .map_err(|e| format!("Failed to deserialize settings: {}", e))?;
            Ok(settings)
        }
        None => {
            // Return default settings (all agents enabled)
            let mut default = HashMap::new();
            default.insert("autohand".to_string(), true);
            default.insert("claude".to_string(), true);
            default.insert("codex".to_string(), true);
            default.insert("gemini".to_string(), true);
            default.insert("ollama".to_string(), true);
            Ok(default)
        }
    }
}
