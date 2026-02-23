use std::collections::HashMap;
use std::path::Path;

use once_cell::sync::Lazy;
use tokio::sync::Mutex;

use crate::models::autohand::*;
use crate::services::autohand::hooks_service;
use crate::services::autohand::protocol::AutohandProtocol;
use crate::services::autohand::{AutohandAcpClient, AutohandRpcClient};

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/// Wrapper enum so we can store either client type in one map.
enum AutohandClient {
    Rpc(AutohandRpcClient),
    Acp(AutohandAcpClient),
}

/// An active autohand session tracked by the backend.
struct AutohandSessionHandle {
    client: AutohandClient,
    #[allow(dead_code)] // Will be used by session listing in future tasks
    working_dir: String,
    #[allow(dead_code)] // Will be used by session cleanup/TTL in future tasks
    created_at: chrono::DateTime<chrono::Utc>,
}

/// Global map of active autohand sessions keyed by session_id.
///
/// Uses `tokio::sync::Mutex` because some operations (respond_permission,
/// get_state) need to hold the lock across `.await` boundaries.
static AUTOHAND_SESSIONS: Lazy<Mutex<HashMap<String, AutohandSessionHandle>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Read a single config JSON file and return it as a `serde_json::Value`.
/// Returns `None` when the file does not exist.
fn read_config_file(path: &Path) -> Result<Option<serde_json::Value>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read autohand config at {}: {}", path.display(), e))?;
    let val: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse autohand config at {}: {}", path.display(), e))?;
    Ok(Some(val))
}

/// Shallow-merge `overlay` into `base`.  Only top-level keys from `overlay`
/// overwrite those in `base`; keys absent from `overlay` are preserved.
fn merge_json(base: &mut serde_json::Value, overlay: &serde_json::Value) {
    if let (Some(base_obj), Some(overlay_obj)) = (base.as_object_mut(), overlay.as_object()) {
        for (k, v) in overlay_obj {
            base_obj.insert(k.clone(), v.clone());
        }
    }
}

/// Internal loader that takes an explicit global config directory (or `None`
/// to skip global config).  This is the testable core; production callers use
/// `load_autohand_config_internal` which resolves `~/.autohand` automatically.
pub fn load_autohand_config_with_global(
    working_dir: &str,
    global_dir: Option<&Path>,
) -> Result<AutohandConfig, String> {
    let workspace = Path::new(working_dir);

    // 1. Read global config
    let global_val = match global_dir {
        Some(dir) => read_config_file(&dir.join("config.json"))?,
        None => None,
    };

    // 2. Read workspace config
    let ws_path = workspace.join(".autohand").join("config.json");
    let ws_val = read_config_file(&ws_path)?;

    // 3. Merge: start with global, overlay workspace
    let root = match (global_val, ws_val) {
        (None, None) => return Ok(AutohandConfig::default()),
        (Some(g), None) => g,
        (None, Some(w)) => w,
        (Some(mut g), Some(w)) => {
            merge_json(&mut g, &w);
            g
        }
    };

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

    // Load hooks: try workspace first, fall back to global directory
    let hooks = match hooks_service::load_hooks_from_config(workspace) {
        Ok(h) if !h.is_empty() => h,
        _ => global_dir
            .and_then(|dir| hooks_service::load_hooks_from_config(dir).ok())
            .unwrap_or_default(),
    };

    Ok(AutohandConfig {
        protocol,
        provider,
        model,
        permissions_mode,
        hooks,
    })
}

/// Load autohand configuration by merging global (`~/.autohand/config.json`)
/// and workspace (`.autohand/config.json`) files.
///
/// Resolution order (later overrides earlier):
///   1. Built-in defaults
///   2. Global user config  – `~/.autohand/config.json`
///   3. Workspace config    – `<working_dir>/.autohand/config.json`
pub fn load_autohand_config_internal(working_dir: &str) -> Result<AutohandConfig, String> {
    let global_dir = dirs::home_dir().map(|h| h.join(".autohand"));
    load_autohand_config_with_global(working_dir, global_dir.as_deref())
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
/// Forwards the approval/rejection to the active RPC or ACP session.
#[tauri::command]
pub async fn respond_autohand_permission(
    session_id: String,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    let sessions = AUTOHAND_SESSIONS.lock().await;

    let handle = sessions
        .get(&session_id)
        .ok_or_else(|| format!("No active session with id '{}'", session_id))?;

    match &handle.client {
        AutohandClient::Rpc(client) => {
            client
                .respond_permission(&request_id, approved)
                .await
                .map_err(|e| e.to_string())
        }
        AutohandClient::Acp(client) => {
            client
                .respond_permission(&request_id, approved)
                .await
                .map_err(|e| e.to_string())
        }
    }
}

// ---------------------------------------------------------------------------
// Session lifecycle commands
// ---------------------------------------------------------------------------

/// Spawn an autohand CLI process, start the event dispatcher, send the initial
/// prompt, and return the session id.
#[tauri::command]
pub async fn execute_autohand_command(
    app: tauri::AppHandle,
    session_id: String,
    message: String,
    working_dir: String,
) -> Result<String, String> {
    let config = load_autohand_config_internal(&working_dir)?;

    match config.protocol {
        ProtocolMode::Rpc => {
            let mut client = AutohandRpcClient::new();
            client
                .start(&working_dir, &config)
                .await
                .map_err(|e| e.to_string())?;

            client
                .start_with_event_dispatch(app.clone(), session_id.clone())
                .await
                .map_err(|e| e.to_string())?;

            client
                .send_prompt(&message, None)
                .await
                .map_err(|e| e.to_string())?;

            let handle = AutohandSessionHandle {
                client: AutohandClient::Rpc(client),
                working_dir: working_dir.clone(),
                created_at: chrono::Utc::now(),
            };

            AUTOHAND_SESSIONS
                .lock()
                .await
                .insert(session_id.clone(), handle);
        }
        ProtocolMode::Acp => {
            let mut client = AutohandAcpClient::new();
            client
                .start(&working_dir, &config)
                .await
                .map_err(|e| e.to_string())?;

            client
                .start_with_event_dispatch(app.clone(), session_id.clone())
                .await
                .map_err(|e| e.to_string())?;

            client
                .send_prompt(&message, None)
                .await
                .map_err(|e| e.to_string())?;

            let handle = AutohandSessionHandle {
                client: AutohandClient::Acp(client),
                working_dir: working_dir.clone(),
                created_at: chrono::Utc::now(),
            };

            AUTOHAND_SESSIONS
                .lock()
                .await
                .insert(session_id.clone(), handle);
        }
    }

    Ok(session_id)
}

/// Shut down an active autohand session and remove it from the session map.
#[tauri::command]
pub async fn terminate_autohand_session(session_id: String) -> Result<(), String> {
    let handle = AUTOHAND_SESSIONS
        .lock()
        .await
        .remove(&session_id);

    match handle {
        Some(h) => match h.client {
            AutohandClient::Rpc(client) => client.shutdown().await.map_err(|e| e.to_string()),
            AutohandClient::Acp(client) => client.shutdown().await.map_err(|e| e.to_string()),
        },
        None => Err(format!("No active session with id '{}'", session_id)),
    }
}

/// Query the current state of an active autohand session.
#[tauri::command]
pub async fn get_autohand_state(session_id: String) -> Result<AutohandState, String> {
    let sessions = AUTOHAND_SESSIONS.lock().await;

    let handle = sessions
        .get(&session_id)
        .ok_or_else(|| format!("No active session with id '{}'", session_id))?;

    match &handle.client {
        AutohandClient::Rpc(client) => client.get_state().await.map_err(|e| e.to_string()),
        AutohandClient::Acp(client) => client.get_state().await.map_err(|e| e.to_string()),
    }
}
