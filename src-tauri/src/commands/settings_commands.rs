use std::collections::HashMap;
use tauri_plugin_store::StoreExt;

use crate::models::*;

#[tauri::command]
pub async fn save_app_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let store = app.store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    store.set("app_settings", serialized_settings);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn load_app_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let store = app.store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    match store.get("app_settings") {
        Some(value) => {
            let settings: AppSettings = serde_json::from_value(value)
                .map_err(|e| format!("Failed to deserialize settings: {}", e))?;
            Ok(settings)
        },
        None => {
            // Return default settings
            Ok(AppSettings::default())
        },
    }
}

#[tauri::command]
pub async fn save_agent_settings(app: tauri::AppHandle, settings: HashMap<String, bool>) -> Result<(), String> {
    let store = app.store("agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    store.set("agent_settings", serialized_settings);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn save_all_agent_settings(app: tauri::AppHandle, settings: AllAgentSettings) -> Result<(), String> {
    let store = app.store("all-agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    store.set("all_agent_settings", serialized_settings);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub async fn load_all_agent_settings(app: tauri::AppHandle) -> Result<AllAgentSettings, String> {
    let store = app.store("all-agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    match store.get("all_agent_settings") {
        Some(value) => {
            let settings: AllAgentSettings = serde_json::from_value(value)
                .map_err(|e| format!("Failed to deserialize settings: {}", e))?;
            Ok(settings)
        },
        None => {
            // Return default settings
            Ok(AllAgentSettings {
                claude: AgentSettings::default(),
                codex: AgentSettings::default(),
                gemini: AgentSettings::default(),
                max_concurrent_sessions: 10,
            })
        },
    }
}

#[tauri::command]
pub async fn load_agent_settings(app: tauri::AppHandle) -> Result<HashMap<String, bool>, String> {
    let store = app.store("agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    match store.get("agent_settings") {
        Some(value) => {
            let settings: HashMap<String, bool> = serde_json::from_value(value)
                .map_err(|e| format!("Failed to deserialize settings: {}", e))?;
            Ok(settings)
        },
        None => {
            // Return default settings (all agents enabled)
            let mut default = HashMap::new();
            default.insert("claude".to_string(), true);
            default.insert("codex".to_string(), true);
            default.insert("gemini".to_string(), true);
            Ok(default)
        },
    }
}
