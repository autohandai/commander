use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri_plugin_store::StoreExt;

use crate::models::*;

#[tauri::command]
pub async fn save_app_settings(
    app: tauri::AppHandle,
    mut settings: AppSettings,
) -> Result<(), String> {
    settings.normalize();
    let store = app
        .store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    store.set("app_settings", serialized_settings);

    store
        .save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;

    // Also persist user-facing option into ~/.commander/settings.json
    let _ = set_show_recent_projects_welcome_screen(settings.show_welcome_recent_projects);
    let _ = set_code_auto_collapse_sidebar(settings.code_settings.auto_collapse_sidebar);

    Ok(())
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
    let store = app
        .store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    match store.get("app_settings") {
        Some(value) => {
            let mut settings: AppSettings = serde_json::from_value(value)
                .map_err(|e| format!("Failed to deserialize settings: {}", e))?;
            settings.normalize();
            // Overlay with user settings file value for welcome recent projects
            let show = get_show_recent_projects_welcome_screen().unwrap_or(true);
            let mut merged = settings.clone();
            merged.show_welcome_recent_projects = show;
            if let Some(auto) = get_code_auto_collapse_sidebar()? {
                merged.code_settings.auto_collapse_sidebar = auto;
            }
            Ok(merged)
        }
        None => {
            // Return default settings
            let mut d = AppSettings::default();
            d.normalize();
            d.show_welcome_recent_projects = get_show_recent_projects_welcome_screen().unwrap_or(true);
            if let Some(auto) = get_code_auto_collapse_sidebar()? {
                d.code_settings.auto_collapse_sidebar = auto;
            }
            Ok(d)
        }
    }
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
            Ok(AllAgentSettings {
                claude: AgentSettings::default(),
                codex: AgentSettings::default(),
                gemini: AgentSettings::default(),
                max_concurrent_sessions: 10,
            })
        }
    }
}

#[tauri::command]
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
        return Ok(serde_json::json!({
            "general": {
                "show_recent_projects_welcome_screen": true
            }
        }));
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
    let content = serde_json::to_string_pretty(&root)
        .map_err(|e| format!("Failed to serialize settings.json: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write settings.json: {}", e))?;
    Ok(())
}

fn get_show_recent_projects_welcome_screen() -> Result<bool, String> {
    let v = load_user_settings_json()?;
    Ok(v.get("general")
        .and_then(|g| g.get("show_recent_projects_welcome_screen"))
        .and_then(|b| b.as_bool())
        .unwrap_or(true))
}

fn set_show_recent_projects_welcome_screen(enabled: bool) -> Result<(), String> {
    let mut root = load_user_settings_json()?;
    let general = root.get_mut("general");
    if general.is_none() || !general.unwrap().is_object() {
        root["general"] = serde_json::json!({});
    }
    root["general"]["show_recent_projects_welcome_screen"] = serde_json::json!(enabled);
    save_user_settings_json(root)
}

fn get_code_auto_collapse_sidebar() -> Result<Option<bool>, String> {
    let root = load_user_settings_json()?;
    Ok(root
        .get("code")
        .and_then(|code| code.get("auto_collapse_sidebar"))
        .and_then(|value| value.as_bool()))
}

fn set_code_auto_collapse_sidebar(enabled: bool) -> Result<(), String> {
    let mut root = load_user_settings_json()?;
    if !root.get("code").map(|c| c.is_object()).unwrap_or(false) {
        root["code"] = serde_json::json!({});
    }
    root["code"]["auto_collapse_sidebar"] = serde_json::json!(enabled);
    save_user_settings_json(root)
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
            default.insert("claude".to_string(), true);
            default.insert("codex".to_string(), true);
            default.insert("gemini".to_string(), true);
            Ok(default)
        }
    }
}
