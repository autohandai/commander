use std::path::Path;

use crate::models::autohand::*;
use crate::services::autohand::hooks_service;

/// Load autohand configuration from the workspace `.autohand/config.json`.
///
/// This is the internal, testable function that all Tauri commands delegate to.
/// When no config file exists the returned `AutohandConfig` carries sensible
/// defaults (RPC protocol, anthropic provider, interactive permissions).
pub fn load_autohand_config_internal(working_dir: &str) -> Result<AutohandConfig, String> {
    let workspace = Path::new(working_dir);
    let config_path = workspace.join(".autohand").join("config.json");

    if !config_path.exists() {
        return Ok(AutohandConfig::default());
    }

    let raw = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read autohand config: {}", e))?;

    let root: serde_json::Value =
        serde_json::from_str(&raw).map_err(|e| format!("Failed to parse autohand config: {}", e))?;

    // Extract individual fields with defaults from AutohandConfig::default()
    let defaults = AutohandConfig::default();

    let protocol: ProtocolMode = root
        .get("protocol")
        .cloned()
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or(defaults.protocol);

    let provider = root
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or(&defaults.provider)
        .to_string();

    let model = root
        .get("model")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let permissions_mode = root
        .get("permissions_mode")
        .and_then(|v| v.as_str())
        .unwrap_or(&defaults.permissions_mode)
        .to_string();

    // Load hooks via the hooks service (reads from the same file)
    let hooks = hooks_service::load_hooks_from_config(workspace)
        .map_err(|e| format!("Failed to load hooks: {}", e))?;

    Ok(AutohandConfig {
        protocol,
        provider,
        model,
        permissions_mode,
        hooks,
    })
}

/// Save autohand configuration back to `.autohand/config.json`.
///
/// Preserves any other top-level keys already present in the file.
fn save_autohand_config_internal(working_dir: &str, config: &AutohandConfig) -> Result<(), String> {
    let workspace = Path::new(working_dir);
    let config_dir = workspace.join(".autohand");
    let config_path = config_dir.join("config.json");

    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create .autohand directory: {}", e))?;

    // Read existing config to preserve extra fields
    let mut root: serde_json::Value = if config_path.exists() {
        let raw = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read autohand config: {}", e))?;
        serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse autohand config: {}", e))?
    } else {
        serde_json::json!({})
    };

    let obj = root
        .as_object_mut()
        .ok_or_else(|| "Config root is not a JSON object".to_string())?;

    // Write the known fields
    obj.insert(
        "protocol".to_string(),
        serde_json::to_value(&config.protocol)
            .map_err(|e| format!("Failed to serialize protocol: {}", e))?,
    );
    obj.insert(
        "provider".to_string(),
        serde_json::Value::String(config.provider.clone()),
    );
    if let Some(ref model) = config.model {
        obj.insert(
            "model".to_string(),
            serde_json::Value::String(model.clone()),
        );
    } else {
        obj.remove("model");
    }
    obj.insert(
        "permissions_mode".to_string(),
        serde_json::Value::String(config.permissions_mode.clone()),
    );

    // Note: hooks are managed separately via the hooks_service and stay
    // under the "hooks.definitions" key.  We do NOT overwrite them here.

    let pretty = serde_json::to_string_pretty(&root)
        .map_err(|e| format!("Failed to serialize autohand config: {}", e))?;

    std::fs::write(&config_path, pretty)
        .map_err(|e| format!("Failed to write autohand config: {}", e))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri command handlers
// ---------------------------------------------------------------------------

/// Retrieve the autohand configuration for a workspace.
#[tauri::command]
pub async fn get_autohand_config(working_dir: String) -> Result<AutohandConfig, String> {
    load_autohand_config_internal(&working_dir)
}

/// Persist the autohand configuration for a workspace.
#[tauri::command]
pub async fn save_autohand_config(
    working_dir: String,
    config: AutohandConfig,
) -> Result<(), String> {
    save_autohand_config_internal(&working_dir, &config)
}

/// Retrieve all hook definitions for a workspace.
#[tauri::command]
pub async fn get_autohand_hooks(working_dir: String) -> Result<Vec<HookDefinition>, String> {
    let workspace = Path::new(&working_dir);
    hooks_service::load_hooks_from_config(workspace).map_err(|e| e.to_string())
}

/// Save (upsert) a single hook definition.
#[tauri::command]
pub async fn save_autohand_hook(
    working_dir: String,
    hook: HookDefinition,
) -> Result<(), String> {
    let workspace = Path::new(&working_dir);
    hooks_service::save_hook_to_config(workspace, &hook).map_err(|e| e.to_string())
}

/// Delete a hook definition by its ID.
#[tauri::command]
pub async fn delete_autohand_hook(
    working_dir: String,
    hook_id: String,
) -> Result<(), String> {
    let workspace = Path::new(&working_dir);
    hooks_service::delete_hook_from_config(workspace, &hook_id).map_err(|e| e.to_string())
}

/// Toggle the `enabled` flag of a hook.
#[tauri::command]
pub async fn toggle_autohand_hook(
    working_dir: String,
    hook_id: String,
    enabled: bool,
) -> Result<(), String> {
    let workspace = Path::new(&working_dir);
    hooks_service::toggle_hook_in_config(workspace, &hook_id, enabled).map_err(|e| e.to_string())
}

/// Respond to a permission request from the autohand CLI.
///
/// This is a placeholder that will be wired to the active RPC/ACP session
/// once the backend event dispatcher (Task 15) is implemented.
#[tauri::command]
pub async fn respond_autohand_permission(
    _session_id: String,
    _request_id: String,
    _approved: bool,
) -> Result<(), String> {
    // TODO: forward to the active RPC/ACP session once the event dispatcher exists.
    Ok(())
}
