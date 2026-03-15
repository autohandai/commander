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
    /// Config fingerprint at spawn time — used to detect model/key changes.
    config_fingerprint: String,
}

/// Build a fingerprint string from the config fields that affect the running
/// CLI process.  If any of these change, the session must be restarted.
fn config_fingerprint(config: &AutohandConfig) -> String {
    let model = config.model.as_deref().unwrap_or("");
    let provider = &config.provider;
    let api_key = config
        .provider_details
        .as_ref()
        .and_then(|d| d.api_key.as_deref())
        .unwrap_or("");
    let base_url = config
        .provider_details
        .as_ref()
        .and_then(|d| d.base_url.as_deref())
        .unwrap_or("");
    let protocol = match config.protocol {
        ProtocolMode::Rpc => "rpc",
        ProtocolMode::Acp => "acp",
    };
    format!("{provider}|{model}|{api_key}|{base_url}|{protocol}")
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

fn provider_details_to_cli_json(details: &ProviderDetails) -> serde_json::Value {
    let mut provider_obj = serde_json::Map::new();
    if let Some(api_key) = &details.api_key {
        provider_obj.insert("apiKey".to_string(), serde_json::json!(api_key));
    }
    if let Some(model) = &details.model {
        provider_obj.insert("model".to_string(), serde_json::json!(model));
    }
    if let Some(base_url) = &details.base_url {
        provider_obj.insert("baseUrl".to_string(), serde_json::json!(base_url));
    }
    serde_json::Value::Object(provider_obj)
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

    // Deserialize the merged JSON into AutohandConfig.
    // serde defaults handle missing fields automatically.
    let mut config: AutohandConfig = serde_json::from_value(root.clone())
        .map_err(|e| format!("Failed to deserialize autohand config: {}", e))?;

    // Handle dynamic provider key: if the provider name (e.g. "openrouter")
    // appears as a top-level key in the config, extract it as provider_details.
    if config.provider_details.is_none() {
        if let Some(provider_obj) = root.get(&config.provider) {
            if provider_obj.is_object() {
                if let Ok(details) = serde_json::from_value::<ProviderDetails>(provider_obj.clone())
                {
                    config.provider_details = Some(details);
                }
            }
        }
    }

    // Load hooks separately (they are managed by hooks_service, skipped by serde)
    let hooks = match hooks_service::load_hooks_from_config(workspace) {
        Ok(h) if !h.is_empty() => h,
        _ => global_dir
            .and_then(|dir| hooks_service::load_hooks_from_config_file(&dir.join("config.json")).ok())
            .unwrap_or_default(),
    };
    config.hooks = hooks;

    Ok(config)
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
pub fn save_autohand_config_internal(working_dir: &str, config: &AutohandConfig) -> Result<(), String> {
    let workspace = Path::new(working_dir);
    let config_dir = workspace.join(".autohand");
    let config_path = config_dir.join("config.json");

    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create .autohand directory: {}", e))?;

    // Read existing config to preserve extra fields (hooks, unknown keys)
    let mut root: serde_json::Value = if config_path.exists() {
        let raw = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read autohand config: {}", e))?;
        serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse autohand config: {}", e))?
    } else {
        serde_json::json!({})
    };

    // Serialize the config struct (hooks are skipped by serde)
    let config_value = serde_json::to_value(config)
        .map_err(|e| format!("Failed to serialize autohand config: {}", e))?;

    // Merge serialized config into existing root, preserving unknown keys
    if let (Some(root_obj), Some(config_obj)) = (root.as_object_mut(), config_value.as_object()) {
        for (k, v) in config_obj {
            // Skip null values for optional fields that are None
            if v.is_null() {
                continue;
            }
            root_obj.insert(k.clone(), v.clone());
        }
        // Remove keys for optional fields explicitly set to None
        if config.model.is_none() {
            root_obj.remove("model");
        }

        // Keep compatibility with CLI-native provider config:
        // write provider_details into a provider-specific top-level block.
        if let Some(details) = &config.provider_details {
            let provider_key = config.provider.trim();
            if !provider_key.is_empty() {
                let provider_json = provider_details_to_cli_json(details);
                if provider_json
                    .as_object()
                    .map(|o| !o.is_empty())
                    .unwrap_or(false)
                {
                    root_obj.insert(provider_key.to_string(), provider_json);
                }
            }
        }

        // Keep compatibility with CLI-native permissions key casing.
        if let Some(permissions) = &config.permissions {
            if let Some(perms_obj) = root_obj
                .entry("permissions".to_string())
                .or_insert_with(|| serde_json::json!({}))
                .as_object_mut()
            {
                perms_obj.insert(
                    "rememberSession".to_string(),
                    serde_json::json!(permissions.remember_session),
                );
                perms_obj.remove("remember_session");
            }
        }
    }

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

// ---------------------------------------------------------------------------
// MCP server CRUD commands
// ---------------------------------------------------------------------------

/// Retrieve all MCP server configurations for a workspace.
#[tauri::command]
pub async fn get_autohand_mcp_servers(
    working_dir: String,
) -> Result<Vec<McpServerConfig>, String> {
    let config = load_autohand_config_internal(&working_dir)?;
    Ok(config.mcp.map(|m| m.servers).unwrap_or_default())
}

/// Save (upsert) a single MCP server configuration by name.
#[tauri::command]
pub async fn save_autohand_mcp_server(
    working_dir: String,
    server: McpServerConfig,
) -> Result<(), String> {
    let mut config = load_autohand_config_internal(&working_dir)?;
    let mcp = config.mcp.get_or_insert_with(McpConfig::default);

    if let Some(pos) = mcp.servers.iter().position(|s| s.name == server.name) {
        mcp.servers[pos] = server;
    } else {
        mcp.servers.push(server);
    }

    save_autohand_config_internal(&working_dir, &config)
}

/// Delete an MCP server configuration by name.
#[tauri::command]
pub async fn delete_autohand_mcp_server(
    working_dir: String,
    server_name: String,
) -> Result<(), String> {
    let mut config = load_autohand_config_internal(&working_dir)?;
    if let Some(ref mut mcp) = config.mcp {
        mcp.servers.retain(|s| s.name != server_name);
    }
    save_autohand_config_internal(&working_dir, &config)
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
///
/// When `resumeSessionId` is provided and an active session with that id exists,
/// the prompt is sent to the existing session instead of spawning a new process.
#[tauri::command]
pub async fn execute_autohand_command(
    app: tauri::AppHandle,
    session_id: String,
    message: String,
    working_dir: String,
    #[allow(non_snake_case)] resumeSessionId: Option<String>,
    #[allow(non_snake_case)] permissionMode: Option<String>,
) -> Result<String, String> {
    let mut config = load_autohand_config_internal(&working_dir)?;

    // Apply permission mode override from the frontend dropdown (early, so
    // fingerprint reflects the effective config).
    if let Some(ref mode) = permissionMode {
        config.permissions_mode = mode.clone();
    }

    let current_fp = config_fingerprint(&config);

    // Try to reuse an existing session if a previous session id was provided.
    // If the config has changed (model, API key, provider, protocol), terminate
    // the stale session and fall through to spawn a new one.
    if let Some(ref prev_id) = resumeSessionId {
        let mut sessions = AUTOHAND_SESSIONS.lock().await;
        let reuse = if let Some(handle) = sessions.get(prev_id) {
            if handle.config_fingerprint == current_fp {
                // Config unchanged — try to reuse
                let result = match &handle.client {
                    AutohandClient::Rpc(c) => c.send_prompt(&message, None).await,
                    AutohandClient::Acp(c) => c.send_prompt(&message, None).await,
                };
                result.is_ok()
            } else {
                // Config changed — terminate the stale session
                false
            }
        } else {
            false
        };

        if reuse {
            return Ok(prev_id.clone());
        }

        // Terminate stale session if it exists
        if let Some(stale) = sessions.remove(prev_id) {
            let _ = match stale.client {
                AutohandClient::Rpc(c) => c.shutdown().await,
                AutohandClient::Acp(c) => c.shutdown().await,
            };
        }
    }

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
                config_fingerprint: current_fp.clone(),
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
                config_fingerprint: current_fp.clone(),
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
