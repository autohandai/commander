use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::CommanderError;
use crate::models::ai_agent::StreamChunk;
use crate::models::autohand::{
    AutohandConfig, AutohandMessagePayload, AutohandPermissionPayload, AutohandState,
    AutohandStatePayload, AutohandStatus, AutohandToolEventPayload, AutohandHookEventPayload,
    HookEvent, JsonRpcId, JsonRpcRequest, JsonRpcResponse, PermissionRequest, ProtocolMode,
    ToolEvent, ToolPhase,
};
use crate::services::autohand::protocol::AutohandProtocol;
use crate::services::autohand::types::{rpc_methods, rpc_notifications};

// ---------------------------------------------------------------------------
// RpcMessage enum -- distinguishes server responses from server notifications
// ---------------------------------------------------------------------------

/// A parsed JSON-RPC 2.0 message received from the autohand CLI.
#[derive(Debug, Clone)]
pub enum RpcMessage {
    /// A response to a request we sent (has an `id`).
    Response(JsonRpcResponse),
    /// A server-initiated notification (has a `method`, no `id`).
    Notification(JsonRpcRequest),
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

/// Build a JSON-RPC 2.0 **request** (with an auto-generated UUID id).
pub fn build_rpc_request(method: &str, params: Option<Value>) -> JsonRpcRequest {
    JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method: method.to_string(),
        params,
        id: Some(JsonRpcId::Str(Uuid::new_v4().to_string())),
    }
}

/// Build a JSON-RPC 2.0 **notification** (no id -- no response expected).
#[cfg(test)]
pub fn build_rpc_notification(method: &str, params: Option<Value>) -> JsonRpcRequest {
    JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method: method.to_string(),
        params,
        id: None,
    }
}

/// Serialize a `JsonRpcRequest` to a newline-delimited JSON string.
pub fn serialize_rpc_to_line(req: &JsonRpcRequest) -> String {
    let mut line = serde_json::to_string(req).expect("JsonRpcRequest must be serializable");
    line.push('\n');
    line
}

/// Parse a single line of JSON into an `RpcMessage`.
///
/// If the JSON object contains a `"method"` key it is treated as a
/// notification; otherwise it is treated as a response.
pub fn parse_rpc_line(line: &str) -> Result<RpcMessage, CommanderError> {
    let value: Value = serde_json::from_str(line.trim()).map_err(|e| {
        CommanderError::autohand("parse_rpc_line", format!("invalid JSON: {}", e))
    })?;

    if value.get("method").is_some() && value.get("id").is_none() {
        // Server notification (method present, no id).
        let req: JsonRpcRequest = serde_json::from_value(value).map_err(|e| {
            CommanderError::autohand(
                "parse_rpc_line",
                format!("failed to parse notification: {}", e),
            )
        })?;
        Ok(RpcMessage::Notification(req))
    } else if value.get("method").is_none() {
        // Response (no method field).
        let resp: JsonRpcResponse = serde_json::from_value(value).map_err(|e| {
            CommanderError::autohand(
                "parse_rpc_line",
                format!("failed to parse response: {}", e),
            )
        })?;
        Ok(RpcMessage::Response(resp))
    } else {
        // Has both method and id -- treat as a request (which for a server is
        // unusual, but we model it as a notification for simplicity).
        let req: JsonRpcRequest = serde_json::from_value(value).map_err(|e| {
            CommanderError::autohand(
                "parse_rpc_line",
                format!("failed to parse request: {}", e),
            )
        })?;
        Ok(RpcMessage::Notification(req))
    }
}

// ---------------------------------------------------------------------------
// Convenience param builders
// ---------------------------------------------------------------------------

/// Build the JSON params object for a `prompt` RPC call.
pub fn build_prompt_params(message: &str, images: Option<Vec<String>>) -> Value {
    let mut params = json!({ "message": message });
    if let Some(imgs) = images {
        params["images"] = json!(imgs);
    }
    params
}

/// Build the JSON params object for a `permissionResponse` RPC call.
pub fn build_permission_response_params(request_id: &str, approved: bool) -> Value {
    json!({
        "requestId": request_id,
        "approved": approved,
    })
}

// ---------------------------------------------------------------------------
// Process spawn argument builder
// ---------------------------------------------------------------------------

/// Write a sanitized copy of the user's autohand config suitable for headless
/// (RPC/ACP) mode.  The CLI validates `ui.theme` on startup even in headless
/// mode, so we force it to `"dark"` to avoid crashes caused by custom themes
/// that aren't available outside interactive mode.
///
/// When `permission_mode_override` is provided, it is injected into the
/// `permissions.mode` field of the headless config, allowing the frontend
/// dropdown to control the autohand CLI's permission mode.
///
/// Returns the path to the temporary config file.
pub fn write_headless_config_with_mode(working_dir: &str, permission_mode_override: Option<&str>) -> Result<std::path::PathBuf, CommanderError> {
    // Read the raw global config
    let global_path = dirs::home_dir()
        .map(|h| h.join(".autohand").join("config.json"));
    let ws_path = std::path::Path::new(working_dir)
        .join(".autohand")
        .join("config.json");

    let mut root: serde_json::Value = serde_json::json!({});

    // Merge global config if present
    if let Some(ref gp) = global_path {
        if gp.exists() {
            if let Ok(raw) = std::fs::read_to_string(gp) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw) {
                    root = val;
                }
            }
        }
    }

    // Overlay workspace config if present
    if ws_path.exists() {
        if let Ok(raw) = std::fs::read_to_string(&ws_path) {
            if let Ok(overlay) = serde_json::from_str::<serde_json::Value>(&raw) {
                if let (Some(base_obj), Some(overlay_obj)) =
                    (root.as_object_mut(), overlay.as_object())
                {
                    for (k, v) in overlay_obj {
                        base_obj.insert(k.clone(), v.clone());
                    }
                }
            }
        }
    }

    // Force a safe UI theme for headless mode
    if let Some(obj) = root.as_object_mut() {
        let ui_entry = obj.entry("ui").or_insert(serde_json::json!({}));
        if let Some(ui_obj) = ui_entry.as_object_mut() {
            ui_obj.insert("theme".to_string(), serde_json::json!("dark"));
        }
    }

    // Override permission mode if requested by the frontend
    if let Some(mode) = permission_mode_override {
        if let Some(obj) = root.as_object_mut() {
            let perms_entry = obj.entry("permissions").or_insert(serde_json::json!({}));
            if let Some(perms_obj) = perms_entry.as_object_mut() {
                perms_obj.insert("mode".to_string(), serde_json::json!(mode));
            }
        }
    }

    // Write to temp file
    let tmp_dir = std::env::temp_dir().join("commander-autohand");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| {
        CommanderError::autohand("write_headless_config", format!("failed to create temp dir: {}", e))
    })?;
    // Use a fixed filename so successive calls overwrite instead of accumulating.
    let tmp_path = tmp_dir.join("headless-config.json");
    let content = serde_json::to_string_pretty(&root).map_err(|e| {
        CommanderError::autohand("write_headless_config", format!("failed to serialize config: {}", e))
    })?;
    std::fs::write(&tmp_path, content).map_err(|e| {
        CommanderError::autohand("write_headless_config", format!("failed to write temp config: {}", e))
    })?;

    Ok(tmp_path)
}

/// Build the CLI arguments needed to spawn an autohand process in RPC/ACP mode.
pub fn build_spawn_args(working_dir: &str, config: &AutohandConfig, config_path: Option<&std::path::Path>) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();

    // Protocol mode
    args.push("--mode".to_string());
    match config.protocol {
        ProtocolMode::Rpc => args.push("rpc".to_string()),
        ProtocolMode::Acp => args.push("acp".to_string()),
    }

    // Working directory
    args.push("--path".to_string());
    args.push(working_dir.to_string());

    // Optional model override
    if let Some(ref model) = config.model {
        args.push("--model".to_string());
        args.push(model.clone());
    }

    // Headless-safe config file
    if let Some(path) = config_path {
        args.push("--config".to_string());
        args.push(path.to_string_lossy().to_string());
    }

    args
}

// ---------------------------------------------------------------------------
// AutohandRpcClient -- concrete implementation of AutohandProtocol
// ---------------------------------------------------------------------------

/// Manages a running autohand CLI process communicating over JSON-RPC 2.0 stdio.
pub struct AutohandRpcClient {
    /// Handle to the child process (if started).
    child: Arc<Mutex<Option<Child>>>,
    /// Writer for the child process's stdin.
    stdin_writer: Arc<Mutex<Option<tokio::process::ChildStdin>>>,
    /// Stdout from the child process, taken after start() for the event reader.
    stdout_handle: Arc<Mutex<Option<tokio::process::ChildStdout>>>,
    /// Stderr from the child process, read on exit to surface CLI errors.
    stderr_handle: Arc<Mutex<Option<tokio::process::ChildStderr>>>,
    /// Whether the child process is still alive (set to false when reader exits).
    alive: Arc<std::sync::atomic::AtomicBool>,
    /// Last known state from state_change notifications.
    last_state: Arc<Mutex<AutohandState>>,
}

impl AutohandRpcClient {
    /// Create a new, unstarted RPC client.
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            stdin_writer: Arc::new(Mutex::new(None)),
            stdout_handle: Arc::new(Mutex::new(None)),
            stderr_handle: Arc::new(Mutex::new(None)),
            alive: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            last_state: Arc::new(Mutex::new(AutohandState::default())),
        }
    }

    /// Write a serialized JSON-RPC line to the child process's stdin.
    async fn write_line(&self, line: &str) -> Result<(), CommanderError> {
        let mut guard = self.stdin_writer.lock().await;
        let stdin = guard.as_mut().ok_or_else(|| {
            CommanderError::autohand("write_line", "autohand process not started")
        })?;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| CommanderError::autohand("write_line", format!("write failed: {}", e)))?;
        stdin
            .flush()
            .await
            .map_err(|e| CommanderError::autohand("write_line", format!("flush failed: {}", e)))?;
        Ok(())
    }

    /// Send a JSON-RPC request (with id) and return the serialized line.
    async fn send_request(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<String, CommanderError> {
        let req = build_rpc_request(method, params);
        let line = serialize_rpc_to_line(&req);
        self.write_line(&line).await?;
        Ok(line)
    }

    /// Spawn a background tokio task that reads stdout line-by-line, parses
    /// each JSON-RPC notification, and emits the appropriate Tauri events.
    ///
    /// Must be called **after** `start()` -- it takes the stored stdout handle.
    pub async fn start_with_event_dispatch(
        &self,
        app: tauri::AppHandle,
        session_id: String,
    ) -> Result<(), CommanderError> {
        use tauri::Emitter;

        let stdout = self
            .stdout_handle
            .lock()
            .await
            .take()
            .ok_or_else(|| {
                CommanderError::autohand(
                    "start_with_event_dispatch",
                    "stdout not available -- was start() called?",
                )
            })?;

        let stderr = self.stderr_handle.lock().await.take();

        let alive = Arc::clone(&self.alive);
        let last_state = Arc::clone(&self.last_state);

        // Collect stderr in a background task so we can surface errors.
        let stderr_buf = Arc::new(Mutex::new(String::new()));
        if let Some(stderr_stream) = stderr {
            let buf = Arc::clone(&stderr_buf);
            tokio::spawn(async move {
                let reader = BufReader::new(stderr_stream);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let mut guard = buf.lock().await;
                    if !guard.is_empty() {
                        guard.push('\n');
                    }
                    guard.push_str(&line);
                }
            });
        }

        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            let mut received_content = false;

            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }

                match parse_rpc_line(&line) {
                    Ok(RpcMessage::Notification(notif)) => {
                        // Track if we received any content notifications
                        if notif.method == rpc_notifications::MESSAGE_UPDATE {
                            received_content = true;
                        }
                        dispatch_rpc_notification(
                            &app,
                            &session_id,
                            &notif,
                            &last_state,
                        )
                        .await;
                    }
                    Ok(RpcMessage::Response(resp)) => {
                        // If the response carries an error, surface it to the user.
                        if let Some(ref err) = resp.error {
                            use tauri::Emitter;
                            let error_msg = format!("Autohand error: {}", err.message);
                            let _ = app.emit(
                                "cli-stream",
                                StreamChunk {
                                    session_id: session_id.clone(),
                                    content: error_msg,
                                    finished: true,
                                },
                            );
                            received_content = true;
                        }
                    }
                    Err(_) => {
                        // Unparsable line -- skip silently. Could be stderr
                        // leaking into stdout or a partial write.
                    }
                }
            }

            // EOF or error -- process exited.
            alive.store(false, std::sync::atomic::Ordering::SeqCst);

            // If no content was received, check stderr for error info.
            let error_content = if !received_content {
                // Small delay to let stderr task finish reading.
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                let stderr_text = stderr_buf.lock().await;
                if stderr_text.is_empty() {
                    "Autohand process exited without producing any output. Is the autohand CLI installed and configured?".to_string()
                } else {
                    format!("Autohand error: {}", stderr_text.trim())
                }
            } else {
                String::new()
            };

            let now = chrono::Utc::now().to_rfc3339();
            let _ = app.emit(
                "autohand:message",
                AutohandMessagePayload {
                    session_id: session_id.clone(),
                    role: "system".to_string(),
                    content: error_content.clone(),
                    finished: true,
                    timestamp: now,
                },
            );
            let _ = app.emit(
                "cli-stream",
                StreamChunk {
                    session_id: session_id.clone(),
                    content: error_content,
                    finished: true,
                },
            );
        });

        Ok(())
    }
}

/// Dispatch a single RPC notification to the frontend via Tauri events.
async fn dispatch_rpc_notification(
    app: &tauri::AppHandle,
    session_id: &str,
    notif: &JsonRpcRequest,
    last_state: &Arc<Mutex<AutohandState>>,
) {
    use tauri::Emitter;

    let params = notif.params.clone().unwrap_or(Value::Null);
    let now = chrono::Utc::now().to_rfc3339();

    match notif.method.as_str() {
        // ---- message streaming ----
        rpc_notifications::MESSAGE_START => {
            // Message started -- no content yet, just acknowledge.
        }

        rpc_notifications::MESSAGE_UPDATE => {
            // The CLI sends streaming text in "delta", not "content"
            let content = params
                .get("delta")
                .or_else(|| params.get("content"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            // Emit on both channels: autohand-specific and the shared cli-stream
            // that ChatInterface already listens to.
            let _ = app.emit(
                "autohand:message",
                AutohandMessagePayload {
                    session_id: session_id.to_string(),
                    role: "assistant".to_string(),
                    content: content.clone(),
                    finished: false,
                    timestamp: now.clone(),
                },
            );
            let _ = app.emit(
                "cli-stream",
                StreamChunk {
                    session_id: session_id.to_string(),
                    content,
                    finished: false,
                },
            );
        }

        rpc_notifications::MESSAGE_END | rpc_notifications::TURN_END => {
            let _ = app.emit(
                "autohand:message",
                AutohandMessagePayload {
                    session_id: session_id.to_string(),
                    role: "assistant".to_string(),
                    content: String::new(),
                    finished: true,
                    timestamp: now.clone(),
                },
            );
            let _ = app.emit(
                "cli-stream",
                StreamChunk {
                    session_id: session_id.to_string(),
                    content: String::new(),
                    finished: true,
                },
            );
        }

        // ---- errors ----
        rpc_notifications::ERROR => {
            let message = params
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error")
                .to_string();
            let _ = app.emit(
                "cli-stream",
                StreamChunk {
                    session_id: session_id.to_string(),
                    content: format!("Error: {}", message),
                    finished: true,
                },
            );
        }

        // ---- tool lifecycle ----
        rpc_notifications::TOOL_START => {
            let tool_name = params
                .get("toolName")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let tool_id = params
                .get("toolId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let args = params.get("args").cloned();
            let _ = app.emit(
                "autohand:tool-event",
                AutohandToolEventPayload {
                    session_id: session_id.to_string(),
                    event: ToolEvent {
                        tool_id,
                        tool_name,
                        phase: ToolPhase::Start,
                        args,
                        output: None,
                        success: None,
                        duration_ms: None,
                    },
                },
            );
        }

        rpc_notifications::TOOL_UPDATE => {
            let tool_name = params
                .get("toolName")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let tool_id = params
                .get("toolId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let output = params
                .get("output")
                .and_then(|v| v.as_str())
                .map(String::from);
            let _ = app.emit(
                "autohand:tool-event",
                AutohandToolEventPayload {
                    session_id: session_id.to_string(),
                    event: ToolEvent {
                        tool_id,
                        tool_name,
                        phase: ToolPhase::Update,
                        args: None,
                        output,
                        success: None,
                        duration_ms: None,
                    },
                },
            );
        }

        rpc_notifications::TOOL_END => {
            let tool_name = params
                .get("toolName")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let tool_id = params
                .get("toolId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let output = params
                .get("output")
                .and_then(|v| v.as_str())
                .map(String::from);
            let success = params.get("success").and_then(|v| v.as_bool());
            let duration_ms = params.get("duration_ms").and_then(|v| v.as_u64());
            let _ = app.emit(
                "autohand:tool-event",
                AutohandToolEventPayload {
                    session_id: session_id.to_string(),
                    event: ToolEvent {
                        tool_id,
                        tool_name,
                        phase: ToolPhase::End,
                        args: None,
                        output,
                        success,
                        duration_ms,
                    },
                },
            );
        }

        // ---- permission requests ----
        rpc_notifications::PERMISSION_REQUEST => {
            let request_id = params
                .get("requestId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tool_name = params
                .get("toolName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let description = params
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let file_path = params
                .get("filePath")
                .and_then(|v| v.as_str())
                .map(String::from);
            let is_destructive = params
                .get("isDestructive")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let _ = app.emit(
                "autohand:permission-request",
                AutohandPermissionPayload {
                    session_id: session_id.to_string(),
                    request: PermissionRequest {
                        request_id,
                        tool_name,
                        description,
                        file_path,
                        is_destructive,
                    },
                },
            );
        }

        // ---- hook events ----
        rpc_notifications::HOOK_PRE_TOOL
        | rpc_notifications::HOOK_POST_TOOL
        | rpc_notifications::HOOK_FILE_MODIFIED
        | rpc_notifications::HOOK_PRE_PROMPT
        | rpc_notifications::HOOK_POST_RESPONSE => {
            let hook_id = params
                .get("hookId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let output = params
                .get("output")
                .and_then(|v| v.as_str())
                .map(String::from);
            let success = params
                .get("success")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            // Map the notification method to a HookEvent variant.
            let event = match notif.method.as_str() {
                rpc_notifications::HOOK_PRE_TOOL => HookEvent::PreTool,
                rpc_notifications::HOOK_POST_TOOL => HookEvent::PostTool,
                rpc_notifications::HOOK_FILE_MODIFIED => HookEvent::FileModified,
                rpc_notifications::HOOK_PRE_PROMPT => HookEvent::PrePrompt,
                rpc_notifications::HOOK_POST_RESPONSE => HookEvent::PostResponse,
                _ => HookEvent::Notification,
            };

            let _ = app.emit(
                "autohand:hook-event",
                AutohandHookEventPayload {
                    session_id: session_id.to_string(),
                    hook_id,
                    event,
                    output,
                    success,
                },
            );
        }

        // ---- state change ----
        rpc_notifications::STATE_CHANGE => {
            let status_str = params
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("idle");
            let status = match status_str {
                "processing" => AutohandStatus::Processing,
                "waitingPermission" | "waiting_permission" => AutohandStatus::WaitingPermission,
                _ => AutohandStatus::Idle,
            };
            let context_percent = params
                .get("contextPercent")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0) as f32;

            let new_state = AutohandState {
                status,
                session_id: Some(session_id.to_string()),
                model: params
                    .get("model")
                    .and_then(|v| v.as_str())
                    .map(String::from),
                context_percent,
                message_count: params
                    .get("messageCount")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
            };

            // Cache it for get_state queries.
            *last_state.lock().await = new_state.clone();

            let _ = app.emit(
                "autohand:state-change",
                AutohandStatePayload {
                    session_id: session_id.to_string(),
                    state: new_state,
                },
            );
        }

        // ---- agent lifecycle (no specific UI event, but could log) ----
        rpc_notifications::AGENT_START | rpc_notifications::AGENT_END | rpc_notifications::TURN_START => {
            // These are informational; no dedicated Tauri event needed.
        }

        _ => {
            // Other notifications: changesBatchStart/End, hook.stop, etc.
            // Silently ignored -- can be wired up as needed.
        }
    }
}

#[async_trait]
impl AutohandProtocol for AutohandRpcClient {
    async fn start(
        &mut self,
        working_dir: &str,
        config: &AutohandConfig,
    ) -> Result<(), CommanderError> {
        let mode_override = if config.permissions_mode != "interactive" {
            Some(config.permissions_mode.as_str())
        } else {
            None
        };
        let headless_config = write_headless_config_with_mode(working_dir, mode_override)?;
        let args = build_spawn_args(working_dir, config, Some(&headless_config));

        let mut child = Command::new("autohand")
            .args(&args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| {
                CommanderError::autohand("start", format!("failed to spawn autohand: {}", e))
            })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            CommanderError::autohand("start", "failed to capture stdin")
        })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            CommanderError::autohand("start", "failed to capture stdout")
        })?;

        let stderr = child.stderr.take().ok_or_else(|| {
            CommanderError::autohand("start", "failed to capture stderr")
        })?;

        *self.stdin_writer.lock().await = Some(stdin);
        *self.stdout_handle.lock().await = Some(stdout);
        *self.stderr_handle.lock().await = Some(stderr);
        *self.child.lock().await = Some(child);
        self.alive
            .store(true, std::sync::atomic::Ordering::SeqCst);

        Ok(())
    }

    async fn send_prompt(
        &self,
        message: &str,
        images: Option<Vec<String>>,
    ) -> Result<(), CommanderError> {
        let params = build_prompt_params(message, images);
        self.send_request(rpc_methods::PROMPT, Some(params)).await?;
        Ok(())
    }

    async fn abort(&self) -> Result<(), CommanderError> {
        self.send_request(rpc_methods::ABORT, None).await?;
        Ok(())
    }

    async fn reset(&self) -> Result<(), CommanderError> {
        self.send_request(rpc_methods::RESET, None).await?;
        Ok(())
    }

    async fn get_state(&self) -> Result<AutohandState, CommanderError> {
        // Return the last known state captured from stateChange notifications.
        // This is updated in real-time by the event dispatch reader task.
        Ok(self.last_state.lock().await.clone())
    }

    async fn respond_permission(
        &self,
        request_id: &str,
        approved: bool,
    ) -> Result<(), CommanderError> {
        let params = build_permission_response_params(request_id, approved);
        self.send_request(rpc_methods::PERMISSION_RESPONSE, Some(params))
            .await?;
        Ok(())
    }

    async fn shutdown(&self) -> Result<(), CommanderError> {
        // Send a graceful shutdown RPC request before killing.
        let _ = self.send_request(rpc_methods::SHUTDOWN, None).await;

        // Give the process a moment to exit gracefully.
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

        let mut guard = self.child.lock().await;
        if let Some(ref mut child) = *guard {
            let _ = child.kill().await;
        }
        *guard = None;
        *self.stdin_writer.lock().await = None;
        *self.stdout_handle.lock().await = None;
        *self.stderr_handle.lock().await = None;
        self.alive
            .store(false, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }

    fn is_alive(&self) -> bool {
        self.alive.load(std::sync::atomic::Ordering::SeqCst)
    }
}
