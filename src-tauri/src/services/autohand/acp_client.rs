use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::error::CommanderError;
use crate::models::ai_agent::StreamChunk;
use crate::models::autohand::{
    AutohandConfig, AutohandMessagePayload, AutohandPermissionPayload,
    AutohandState, AutohandStatePayload, AutohandStatus, AutohandToolEventPayload,
    PermissionRequest, ToolEvent, ToolPhase,
};
use crate::services::autohand::protocol::AutohandProtocol;
use crate::services::autohand::rpc_client::write_headless_config_with_mode;

// ---------------------------------------------------------------------------
// AcpMessage enum -- classified ACP ndJSON messages
// ---------------------------------------------------------------------------

/// A classified ACP message received from the autohand CLI via ndJSON.
///
/// Unlike JSON-RPC, ACP uses a simpler `{"type": ..., "data": ...}` envelope.
/// This enum maps the known `type` values to structured variants.
#[derive(Debug, Clone)]
pub enum AcpMessage {
    /// A text message from the assistant or user.
    Message { role: String, content: String },
    /// A tool execution has started.
    ToolStart {
        name: String,
        args: Option<Value>,
    },
    /// Incremental update during tool execution.
    ToolUpdate {
        name: String,
        output: Option<String>,
    },
    /// A tool execution has completed.
    ToolEnd {
        name: String,
        output: Option<String>,
        success: bool,
        duration_ms: Option<u64>,
    },
    /// A permission request for a potentially destructive action.
    PermissionRequest {
        request_id: String,
        tool_name: String,
        description: String,
    },
    /// Agent session state has changed.
    StateChange { status: String, context_percent: Option<f64> },
    /// An unrecognized message type.
    Unknown,
}

// ---------------------------------------------------------------------------
// Tool kind resolution
// ---------------------------------------------------------------------------

/// Map a tool name reported by the autohand CLI to an ACP tool "kind".
///
/// Kinds are broad categories used by the UI to display appropriate icons
/// and badge colors for each tool invocation.
#[cfg(test)]
pub fn resolve_tool_kind(tool_name: &str) -> &'static str {
    match tool_name {
        // Read operations
        "read_file" | "read_image" | "get_file_info" => "read",

        // Search operations
        "grep_search" | "glob_search" | "search_files" | "find_definition"
        | "find_references" => "search",

        // Edit / write operations
        "write_file" | "edit_file" | "multi_edit_file" | "create_file" => "edit",

        // Move / rename operations
        "rename_file" | "move_file" => "move",

        // Delete operations
        "delete_file" => "delete",

        // Execution / shell / git operations
        "run_command" | "git_commit" | "git_checkout" | "git_push" => "execute",

        // Thinking / planning
        "think" | "plan" => "think",

        // Network / fetch
        "web_fetch" | "web_search" => "fetch",

        // Everything else
        _ => "other",
    }
}

// ---------------------------------------------------------------------------
// ndJSON line parser
// ---------------------------------------------------------------------------

/// Parse a single ndJSON line into a `serde_json::Value`.
///
/// Returns an error for empty, whitespace-only, or invalid JSON lines.
pub fn parse_acp_line(line: &str) -> Result<Value, CommanderError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err(CommanderError::autohand(
            "parse_acp_line",
            "empty or whitespace-only line",
        ));
    }

    serde_json::from_str(trimmed).map_err(|e| {
        CommanderError::autohand("parse_acp_line", format!("invalid JSON: {}", e))
    })
}

/// Parse and classify a single ndJSON line into a typed `AcpMessage`.
///
/// The expected envelope is `{"type": "<kind>", "data": { ... }}`.
/// Unknown types are wrapped in `AcpMessage::Unknown`.
pub fn classify_acp_message(line: &str) -> Result<AcpMessage, CommanderError> {
    let value = parse_acp_line(line)?;

    let msg_type = value
        .get("type")
        .and_then(|t| t.as_str())
        .unwrap_or("");

    let data = value.get("data").cloned().unwrap_or(Value::Null);

    match msg_type {
        "message" => {
            let role = data
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let content = data
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Ok(AcpMessage::Message { role, content })
        }
        "tool_start" => {
            let name = data
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let args = data.get("args").cloned();
            Ok(AcpMessage::ToolStart { name, args })
        }
        "tool_update" => {
            let name = data
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let output = data.get("output").and_then(|v| v.as_str()).map(String::from);
            Ok(AcpMessage::ToolUpdate { name, output })
        }
        "tool_end" => {
            let name = data
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let output = data.get("output").and_then(|v| v.as_str()).map(String::from);
            let success = data.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
            let duration_ms = data.get("duration_ms").and_then(|v| v.as_u64());
            Ok(AcpMessage::ToolEnd {
                name,
                output,
                success,
                duration_ms,
            })
        }
        "permission_request" => {
            let request_id = data
                .get("request_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tool_name = data
                .get("tool_name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let description = data
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Ok(AcpMessage::PermissionRequest {
                request_id,
                tool_name,
                description,
            })
        }
        "state_change" => {
            let status = data
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("idle")
                .to_string();
            let context_percent = data.get("context_percent").and_then(|v| v.as_f64());
            Ok(AcpMessage::StateChange {
                status,
                context_percent,
            })
        }
        _ => Ok(AcpMessage::Unknown),
    }
}

// ---------------------------------------------------------------------------
// ACP-specific spawn argument builder
// ---------------------------------------------------------------------------

/// Build the CLI arguments needed to spawn an autohand process in ACP mode.
///
/// This is ACP-specific and always passes `--mode acp`. For RPC mode, use
/// `rpc_client::build_spawn_args` instead.
pub fn build_acp_spawn_args(working_dir: &str, config: &AutohandConfig, config_path: Option<&std::path::Path>) -> Vec<String> {
    let mut args: Vec<String> = Vec::new();

    // Always use ACP mode
    args.push("--mode".to_string());
    args.push("acp".to_string());

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
// ACP-specific param builders
// ---------------------------------------------------------------------------

/// Build the ndJSON line for sending a prompt over the ACP protocol.
fn build_acp_prompt_line(message: &str, images: Option<Vec<String>>) -> String {
    let mut data = serde_json::json!({ "message": message });
    if let Some(imgs) = images {
        data["images"] = serde_json::json!(imgs);
    }
    let envelope = serde_json::json!({
        "type": "prompt",
        "data": data,
    });
    let mut line = serde_json::to_string(&envelope).expect("envelope must serialize");
    line.push('\n');
    line
}

/// Build the ndJSON line for sending a permission response over ACP.
fn build_acp_permission_response_line(request_id: &str, approved: bool) -> String {
    let envelope = serde_json::json!({
        "type": "permission_response",
        "data": {
            "request_id": request_id,
            "approved": approved,
        },
    });
    let mut line = serde_json::to_string(&envelope).expect("envelope must serialize");
    line.push('\n');
    line
}

/// Build the ndJSON line for an abort command over ACP.
fn build_acp_command_line(command: &str) -> String {
    let envelope = serde_json::json!({
        "type": command,
        "data": {},
    });
    let mut line = serde_json::to_string(&envelope).expect("envelope must serialize");
    line.push('\n');
    line
}

// ---------------------------------------------------------------------------
// AutohandAcpClient -- concrete implementation of AutohandProtocol
// ---------------------------------------------------------------------------

/// Manages a running autohand CLI process communicating over ACP ndJSON stdio.
///
/// Unlike the RPC client which uses JSON-RPC 2.0 with request/response ids,
/// the ACP client uses a simpler newline-delimited JSON protocol where each
/// line is a `{"type": ..., "data": ...}` envelope.
pub struct AutohandAcpClient {
    /// Handle to the child process (if started).
    child: Arc<Mutex<Option<Child>>>,
    /// Writer for the child process's stdin.
    stdin_writer: Arc<Mutex<Option<tokio::process::ChildStdin>>>,
    /// Stdout from the child process, taken after start() for the event reader.
    stdout_handle: Arc<Mutex<Option<tokio::process::ChildStdout>>>,
    /// Stderr from the child process, read on exit to surface CLI errors.
    stderr_handle: Arc<Mutex<Option<tokio::process::ChildStderr>>>,
    /// Whether the child process is still alive.
    alive: Arc<std::sync::atomic::AtomicBool>,
    /// Last known state from state_change messages.
    last_state: Arc<Mutex<AutohandState>>,
}

impl AutohandAcpClient {
    /// Create a new, unstarted ACP client.
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

    /// Write a serialized ndJSON line to the child process's stdin.
    async fn write_line(&self, line: &str) -> Result<(), CommanderError> {
        let mut guard = self.stdin_writer.lock().await;
        let stdin = guard.as_mut().ok_or_else(|| {
            CommanderError::autohand("write_line", "autohand ACP process not started")
        })?;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|e| {
                CommanderError::autohand("write_line", format!("write failed: {}", e))
            })?;
        stdin
            .flush()
            .await
            .map_err(|e| {
                CommanderError::autohand("write_line", format!("flush failed: {}", e))
            })?;
        Ok(())
    }

    /// Spawn a background tokio task that reads ACP ndJSON stdout line-by-line,
    /// classifies each message, and emits the appropriate Tauri events.
    ///
    /// Must be called **after** `start()`.
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

                match classify_acp_message(&line) {
                    Ok(msg) => {
                        if matches!(&msg, AcpMessage::Message { .. }) {
                            received_content = true;
                        }
                        dispatch_acp_message(&app, &session_id, msg, &last_state).await;
                    }
                    Err(_) => {
                        // Unparsable line -- skip silently.
                    }
                }
            }

            // EOF or error -- process exited.
            alive.store(false, std::sync::atomic::Ordering::SeqCst);

            // If no content was received, check stderr for error info.
            let error_content = if !received_content {
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

/// Dispatch a classified ACP message to the frontend via Tauri events.
async fn dispatch_acp_message(
    app: &tauri::AppHandle,
    session_id: &str,
    msg: AcpMessage,
    last_state: &Arc<Mutex<AutohandState>>,
) {
    use tauri::Emitter;
    let now = chrono::Utc::now().to_rfc3339();

    match msg {
        AcpMessage::Message { role, content } => {
            let _ = app.emit(
                "autohand:message",
                AutohandMessagePayload {
                    session_id: session_id.to_string(),
                    role: role.clone(),
                    content: content.clone(),
                    finished: false,
                    timestamp: now,
                },
            );
            // Also emit on cli-stream so ChatInterface renders it.
            if role == "assistant" {
                let _ = app.emit(
                    "cli-stream",
                    StreamChunk {
                        session_id: session_id.to_string(),
                        content,
                        finished: false,
                    },
                );
            }
        }

        AcpMessage::ToolStart { name, args } => {
            let _ = app.emit(
                "autohand:tool-event",
                AutohandToolEventPayload {
                    session_id: session_id.to_string(),
                    event: ToolEvent {
                        tool_id: String::new(),
                        tool_name: name,
                        phase: ToolPhase::Start,
                        args,
                        output: None,
                        success: None,
                        duration_ms: None,
                    },
                },
            );
        }

        AcpMessage::ToolUpdate { name, output } => {
            let _ = app.emit(
                "autohand:tool-event",
                AutohandToolEventPayload {
                    session_id: session_id.to_string(),
                    event: ToolEvent {
                        tool_id: String::new(),
                        tool_name: name,
                        phase: ToolPhase::Update,
                        args: None,
                        output,
                        success: None,
                        duration_ms: None,
                    },
                },
            );
        }

        AcpMessage::ToolEnd {
            name,
            output,
            success,
            duration_ms,
        } => {
            let _ = app.emit(
                "autohand:tool-event",
                AutohandToolEventPayload {
                    session_id: session_id.to_string(),
                    event: ToolEvent {
                        tool_id: String::new(),
                        tool_name: name,
                        phase: ToolPhase::End,
                        args: None,
                        output,
                        success: Some(success),
                        duration_ms,
                    },
                },
            );
        }

        AcpMessage::PermissionRequest {
            request_id,
            tool_name,
            description,
        } => {
            let _ = app.emit(
                "autohand:permission-request",
                AutohandPermissionPayload {
                    session_id: session_id.to_string(),
                    request: PermissionRequest {
                        request_id,
                        tool_name,
                        description,
                        file_path: None,
                        is_destructive: false,
                    },
                },
            );
        }

        AcpMessage::StateChange {
            status,
            context_percent,
        } => {
            let parsed_status = match status.as_str() {
                "processing" => AutohandStatus::Processing,
                "waiting_permission" | "waitingPermission" => AutohandStatus::WaitingPermission,
                _ => AutohandStatus::Idle,
            };

            let new_state = AutohandState {
                status: parsed_status,
                session_id: Some(session_id.to_string()),
                model: None,
                context_percent: context_percent.unwrap_or(0.0) as f32,
                message_count: 0,
            };

            *last_state.lock().await = new_state.clone();

            let _ = app.emit(
                "autohand:state-change",
                AutohandStatePayload {
                    session_id: session_id.to_string(),
                    state: new_state,
                },
            );
        }

        AcpMessage::Unknown => {
            // Unknown message type -- ignore.
        }
    }
}

#[async_trait]
impl AutohandProtocol for AutohandAcpClient {
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
        let args = build_acp_spawn_args(working_dir, config, Some(&headless_config));

        let mut child = Command::new("autohand")
            .args(&args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| {
                CommanderError::autohand(
                    "start",
                    format!("failed to spawn autohand in ACP mode: {}", e),
                )
            })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            CommanderError::autohand("start", "failed to capture stdin for ACP process")
        })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            CommanderError::autohand("start", "failed to capture stdout for ACP process")
        })?;

        let stderr = child.stderr.take().ok_or_else(|| {
            CommanderError::autohand("start", "failed to capture stderr for ACP process")
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
        let line = build_acp_prompt_line(message, images);
        self.write_line(&line).await
    }

    async fn abort(&self) -> Result<(), CommanderError> {
        let line = build_acp_command_line("abort");
        self.write_line(&line).await
    }

    async fn reset(&self) -> Result<(), CommanderError> {
        let line = build_acp_command_line("reset");
        self.write_line(&line).await
    }

    async fn get_state(&self) -> Result<AutohandState, CommanderError> {
        // Return the last known state captured from state_change ndJSON messages.
        Ok(self.last_state.lock().await.clone())
    }

    async fn respond_permission(
        &self,
        request_id: &str,
        approved: bool,
    ) -> Result<(), CommanderError> {
        let line = build_acp_permission_response_line(request_id, approved);
        self.write_line(&line).await
    }

    async fn shutdown(&self) -> Result<(), CommanderError> {
        // Try to send a graceful shutdown command, then kill the process.
        let _ = self
            .write_line(&build_acp_command_line("shutdown"))
            .await;

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
