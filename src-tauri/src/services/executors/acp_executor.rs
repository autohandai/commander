use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;
use tokio::process::{Child, ChildStdin};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use async_trait::async_trait;
use tauri::Emitter;
use crate::error::CommanderError;
use crate::models::ai_agent::AgentSettings;
use crate::models::protocol::{ProtocolMode, ProtocolEvent, SessionEventKind, ToolKind};
use super::AgentExecutor;

// ---------------------------------------------------------------------------
// AcpMessage enum -- classified ACP ndJSON messages
// ---------------------------------------------------------------------------

/// A classified ACP message received from the agent CLI via ndJSON.
///
/// ACP uses a `{"type": ..., "data": ...}` envelope.
/// This enum maps the known `type` values to structured variants.
#[derive(Debug, Clone)]
pub enum AcpMessage {
    /// A text message from the assistant or user.
    Message { role: String, content: String },
    /// A tool execution has started.
    ToolStart {
        name: String,
        args: Option<serde_json::Value>,
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
    Unknown(serde_json::Value),
}

// ---------------------------------------------------------------------------
// Tool kind resolution
// ---------------------------------------------------------------------------

/// Map a tool name reported by the agent CLI to a ToolKind enum variant.
pub fn resolve_tool_kind(tool_name: &str) -> ToolKind {
    match tool_name {
        "read_file" | "read_image" | "get_file_info" => ToolKind::Read,
        "grep_search" | "glob_search" | "search_files" | "find_definition" | "find_references" | "grep" => ToolKind::Search,
        "write_file" | "create_file" => ToolKind::Write,
        "edit_file" | "multi_edit_file" => ToolKind::Edit,
        "delete_file" => ToolKind::Delete,
        "bash" | "shell" | "execute" | "run" => ToolKind::Execute,
        "think" | "plan" => ToolKind::Think,
        "web_fetch" | "fetch" | "curl" => ToolKind::Fetch,
        _ => ToolKind::Other,
    }
}

// ---------------------------------------------------------------------------
// ndJSON line classifier
// ---------------------------------------------------------------------------

/// Parse and classify a single ndJSON line into a typed `AcpMessage`.
///
/// The expected envelope is `{"type": "<kind>", "data": { ... }}`.
/// Unknown types are wrapped in `AcpMessage::Unknown`.
pub fn classify_acp_message(line: &str) -> Result<AcpMessage, String> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err("empty or whitespace-only line".to_string());
    }

    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|e| format!("invalid JSON: {}", e))?;

    let msg_type = value
        .get("type")
        .and_then(|t| t.as_str())
        .unwrap_or("");

    let data = value.get("data").cloned().unwrap_or(serde_json::Value::Null);

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
// Helper to write an ndJSON line to stdin
// ---------------------------------------------------------------------------

async fn write_stdin_line(
    stdin: &Arc<Mutex<Option<ChildStdin>>>,
    line: &str,
) -> Result<(), CommanderError> {
    let mut guard = stdin.lock().await;
    let writer = guard.as_mut().ok_or_else(|| {
        CommanderError::protocol("write_failed", None, "ACP process stdin not available")
    })?;
    writer
        .write_all(line.as_bytes())
        .await
        .map_err(|e| CommanderError::protocol("write_failed", None, format!("write failed: {}", e)))?;
    writer
        .flush()
        .await
        .map_err(|e| CommanderError::protocol("write_failed", None, format!("flush failed: {}", e)))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// AcpExecutor struct
// ---------------------------------------------------------------------------

pub struct AcpExecutor {
    flag_variant: Option<String>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    child: Arc<Mutex<Option<Child>>>,
    alive: Arc<AtomicBool>,
}

impl AcpExecutor {
    pub fn new(flag_variant: Option<String>) -> Self {
        Self {
            flag_variant,
            stdin: Arc::new(Mutex::new(None)),
            child: Arc::new(Mutex::new(None)),
            alive: Arc::new(AtomicBool::new(false)),
        }
    }
}

#[async_trait]
impl AgentExecutor for AcpExecutor {
    async fn execute(
        &mut self,
        app: &tauri::AppHandle,
        session_id: &str,
        agent: &str,
        message: &str,
        working_dir: &str,
        _settings: &AgentSettings,
        resume_session_id: Option<&str>,
    ) -> Result<(), CommanderError> {
        // 1. Resolve agent binary path.
        // The caller may pass an absolute path (pre-resolved via sidecar module)
        // or a bare command name (resolved via PATH).
        let agent_path = {
            let candidate = std::path::PathBuf::from(agent);
            if candidate.is_absolute() && candidate.exists() {
                candidate
            } else {
                which::which(agent).map_err(|e| {
                    CommanderError::command(
                        agent,
                        None,
                        format!("agent not found in PATH: {}", e),
                    )
                })?
            }
        };

        // 2. Build spawn args
        let mut args: Vec<String> = Vec::new();

        // Add flag variant flags (e.g. "--mode acp" → ["--mode", "acp"])
        if let Some(ref flag) = self.flag_variant {
            for part in flag.split_whitespace() {
                args.push(part.to_string());
            }
        }

        // Add working directory
        args.push("--path".to_string());
        args.push(working_dir.to_string());

        // Add resume session if provided
        if let Some(session) = resume_session_id {
            args.push("--resume".to_string());
            args.push(session.to_string());
        }

        // 3. Spawn child process
        let mut child = tokio::process::Command::new(&agent_path)
            .args(&args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| {
                CommanderError::command(
                    agent,
                    None,
                    format!("failed to spawn agent in ACP mode: {}", e),
                )
            })?;

        // 4. Capture stdin and stdout
        let stdin = child.stdin.take().ok_or_else(|| {
            CommanderError::command(agent, None, "failed to capture stdin for ACP process")
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            CommanderError::command(agent, None, "failed to capture stdout for ACP process")
        })?;

        // 5. Store stdin and child
        *self.stdin.lock().await = Some(stdin);
        *self.child.lock().await = Some(child);

        // 6. Set alive flag
        self.alive.store(true, Ordering::SeqCst);

        // 7. Emit Connected event
        let session_id_owned = session_id.to_string();
        let _ = app.emit(
            "protocol-event",
            ProtocolEvent::SessionEvent {
                session_id: session_id_owned.clone(),
                event: SessionEventKind::Connected,
            },
        );

        // 7.5. Send initial prompt via ndJSON stdin
        let prompt_envelope = serde_json::json!({
            "type": "prompt",
            "data": { "message": message }
        });
        let mut prompt_line = serde_json::to_string(&prompt_envelope)
            .map_err(|e| CommanderError::protocol("write_failed", None, format!("serialize failed: {}", e)))?;
        prompt_line.push('\n');
        write_stdin_line(&self.stdin, &prompt_line).await?;

        // 8. Read stdout line-by-line in a background task
        let app_handle = app.clone();
        let alive_flag = Arc::clone(&self.alive);
        let session_id_task = session_id_owned.clone();

        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        // 9. Classify and emit each message
                        match classify_acp_message(&line) {
                            Ok(msg) => {
                                let event = acp_message_to_protocol_event(&session_id_task, msg);
                                let _ = app_handle.emit("protocol-event", event);
                            }
                            Err(err) => {
                                let _ = app_handle.emit(
                                    "protocol-event",
                                    ProtocolEvent::Error {
                                        session_id: session_id_task.clone(),
                                        message: err,
                                    },
                                );
                            }
                        }
                    }
                    Ok(None) => {
                        // EOF — process exited
                        break;
                    }
                    Err(_) => {
                        break;
                    }
                }
            }

            // 10. Emit Disconnected event on EOF/exit
            alive_flag.store(false, Ordering::SeqCst);
            let _ = app_handle.emit(
                "protocol-event",
                ProtocolEvent::SessionEvent {
                    session_id: session_id_task,
                    event: SessionEventKind::Disconnected,
                },
            );
        });

        Ok(())
    }

    async fn respond_permission(&self, request_id: &str, approved: bool) -> Result<(), CommanderError> {
        let envelope = serde_json::json!({
            "type": "permission_response",
            "data": {
                "request_id": request_id,
                "approved": approved,
            },
        });
        let mut line = serde_json::to_string(&envelope)
            .map_err(|e| CommanderError::protocol("write_failed", None, format!("serialize failed: {}", e)))?;
        line.push('\n');
        write_stdin_line(&self.stdin, &line).await
    }

    async fn abort(&self) -> Result<(), CommanderError> {
        // Send graceful shutdown command
        let envelope = serde_json::json!({
            "type": "command",
            "data": { "command": "shutdown" },
        });
        let mut line = serde_json::to_string(&envelope)
            .map_err(|e| CommanderError::protocol("write_failed", None, format!("serialize failed: {}", e)))?;
        line.push('\n');
        let _ = write_stdin_line(&self.stdin, &line).await;

        // Wait 2 seconds then kill
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        let mut guard = self.child.lock().await;
        if let Some(ref mut child) = *guard {
            let _ = child.kill().await;
        }
        *guard = None;
        *self.stdin.lock().await = None;
        self.alive.store(false, Ordering::SeqCst);
        Ok(())
    }

    fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    fn protocol(&self) -> Option<ProtocolMode> {
        Some(ProtocolMode::Acp)
    }
}

// ---------------------------------------------------------------------------
// Convert AcpMessage to ProtocolEvent
// ---------------------------------------------------------------------------

fn acp_message_to_protocol_event(session_id: &str, msg: AcpMessage) -> ProtocolEvent {
    match msg {
        AcpMessage::Message { role, content } => ProtocolEvent::Message {
            session_id: session_id.to_string(),
            role,
            content,
        },
        AcpMessage::ToolStart { name, args } => {
            let tool_kind = resolve_tool_kind(&name);
            let tool_id = uuid::Uuid::new_v4().to_string();
            ProtocolEvent::ToolStart {
                session_id: session_id.to_string(),
                tool_id,
                tool_name: name,
                tool_kind,
                args,
            }
        }
        AcpMessage::ToolUpdate { name, output } => {
            let tool_id = uuid::Uuid::new_v4().to_string();
            ProtocolEvent::ToolUpdate {
                session_id: session_id.to_string(),
                tool_id,
                tool_name: name,
                output,
            }
        }
        AcpMessage::ToolEnd { name, output, success, duration_ms } => {
            let tool_id = uuid::Uuid::new_v4().to_string();
            ProtocolEvent::ToolEnd {
                session_id: session_id.to_string(),
                tool_id,
                tool_name: name,
                output,
                success,
                duration_ms,
            }
        }
        AcpMessage::PermissionRequest { request_id, tool_name, description } => {
            ProtocolEvent::PermissionRequest {
                session_id: session_id.to_string(),
                request_id,
                tool_name,
                description,
            }
        }
        AcpMessage::StateChange { status, context_percent } => {
            ProtocolEvent::StateChange {
                session_id: session_id.to_string(),
                status,
                context_percent,
            }
        }
        AcpMessage::Unknown(_) => ProtocolEvent::Error {
            session_id: session_id.to_string(),
            message: "received unknown ACP message type".to_string(),
        },
    }
}
