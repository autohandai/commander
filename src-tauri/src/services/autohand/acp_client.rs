#![allow(dead_code)] // Items used by later tasks (commands, event dispatcher)

use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::error::CommanderError;
use crate::models::autohand::{AutohandConfig, AutohandState, AutohandStatus};
use crate::services::autohand::protocol::AutohandProtocol;

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
    /// An unrecognized message type (forward the raw JSON).
    Unknown(Value),
}

// ---------------------------------------------------------------------------
// Tool kind resolution
// ---------------------------------------------------------------------------

/// Map a tool name reported by the autohand CLI to an ACP tool "kind".
///
/// Kinds are broad categories used by the UI to display appropriate icons
/// and badge colors for each tool invocation.
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
        _ => Ok(AcpMessage::Unknown(value)),
    }
}

// ---------------------------------------------------------------------------
// ACP-specific spawn argument builder
// ---------------------------------------------------------------------------

/// Build the CLI arguments needed to spawn an autohand process in ACP mode.
///
/// This is ACP-specific and always passes `--mode acp`. For RPC mode, use
/// `rpc_client::build_spawn_args` instead.
pub fn build_acp_spawn_args(working_dir: &str, config: &AutohandConfig) -> Vec<String> {
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
}

impl AutohandAcpClient {
    /// Create a new, unstarted ACP client.
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            stdin_writer: Arc::new(Mutex::new(None)),
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
}

#[async_trait]
impl AutohandProtocol for AutohandAcpClient {
    async fn start(
        &mut self,
        working_dir: &str,
        config: &AutohandConfig,
    ) -> Result<(), CommanderError> {
        let args = build_acp_spawn_args(working_dir, config);

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

        *self.stdin_writer.lock().await = Some(stdin);
        *self.child.lock().await = Some(child);

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
        // In ACP mode, state is pushed via ndJSON state_change events rather
        // than pull-based. Return a default state; the event dispatcher will
        // maintain the real state from incoming state_change messages.
        Ok(AutohandState {
            status: AutohandStatus::Idle,
            session_id: None,
            model: None,
            context_percent: 0.0,
            message_count: 0,
        })
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
        Ok(())
    }

    fn is_alive(&self) -> bool {
        if let Ok(guard) = self.child.try_lock() {
            guard.is_some()
        } else {
            // Lock is held (process is being used) -- assume alive.
            true
        }
    }
}
