use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::Mutex;
use tokio::process::{Child, ChildStdin};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use crate::error::CommanderError;
use crate::models::ai_agent::AgentSettings;
use crate::models::protocol::{ProtocolMode, ProtocolEvent, SessionEventKind};
use super::AgentExecutor;
use super::acp_executor::resolve_tool_kind;

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 types
// ---------------------------------------------------------------------------

/// A JSON-RPC 2.0 request or notification sent to the agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

/// A JSON-RPC 2.0 response received from the agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<serde_json::Value>,
}

/// A parsed JSON-RPC 2.0 message received from the agent CLI.
#[derive(Debug, Clone)]
pub enum RpcMessage {
    /// A response to a request we sent (has an `id` and `result`/`error`).
    Response(JsonRpcResponse),
    /// A server-initiated notification (has `method`, no `id`).
    Notification(JsonRpcRequest),
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/// Build a JSON-RPC 2.0 request with an auto-generated UUID id.
pub fn build_rpc_request(method: &str, params: Option<serde_json::Value>) -> JsonRpcRequest {
    JsonRpcRequest {
        jsonrpc: "2.0".into(),
        method: method.into(),
        params,
        id: Some(uuid::Uuid::new_v4().to_string()),
    }
}

/// Parse a single JSON line into an `RpcMessage`.
///
/// Notifications have a `method` key and no `id`.
/// Responses have `result` or `error`.
/// Requests with both `method` and `id` are treated as notifications.
pub fn parse_rpc_line(line: &str) -> Result<RpcMessage, String> {
    let v: serde_json::Value = serde_json::from_str(line).map_err(|e| e.to_string())?;
    if v.get("method").is_some() && v.get("id").is_none() {
        // Notification (no id)
        let req: JsonRpcRequest = serde_json::from_value(v).map_err(|e| e.to_string())?;
        Ok(RpcMessage::Notification(req))
    } else if v.get("result").is_some() || v.get("error").is_some() {
        // Response
        let resp: JsonRpcResponse = serde_json::from_value(v).map_err(|e| e.to_string())?;
        Ok(RpcMessage::Response(resp))
    } else if v.get("method").is_some() {
        // Request with id (treat as notification)
        let req: JsonRpcRequest = serde_json::from_value(v).map_err(|e| e.to_string())?;
        Ok(RpcMessage::Notification(req))
    } else {
        Err("Unrecognized JSON-RPC message".into())
    }
}

/// Build the params object for a prompt RPC call.
pub fn build_prompt_params(message: &str, images: Option<Vec<String>>) -> serde_json::Value {
    let mut params = serde_json::json!({"message": message});
    if let Some(imgs) = images {
        params["images"] = serde_json::json!(imgs);
    }
    params
}

/// Build the params object for a permission response RPC call.
pub fn build_permission_response_params(request_id: &str, approved: bool) -> serde_json::Value {
    serde_json::json!({"request_id": request_id, "approved": approved})
}

/// Serialize a JSON-RPC request to a newline-terminated string.
fn serialize_rpc_to_line(req: &JsonRpcRequest) -> String {
    let mut line = serde_json::to_string(req).unwrap_or_default();
    line.push('\n');
    line
}

// ---------------------------------------------------------------------------
// Helper to write a line to stdin
// ---------------------------------------------------------------------------

async fn write_stdin_line(
    stdin: &Arc<Mutex<Option<ChildStdin>>>,
    line: &str,
) -> Result<(), CommanderError> {
    let mut guard = stdin.lock().await;
    let writer = guard.as_mut().ok_or_else(|| {
        CommanderError::protocol("write_failed", None, "RPC process stdin not available")
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
// RpcExecutor struct
// ---------------------------------------------------------------------------

pub struct RpcExecutor {
    pub flag_variant: Option<String>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    child: Arc<Mutex<Option<Child>>>,
    alive: Arc<AtomicBool>,
}

impl RpcExecutor {
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
impl AgentExecutor for RpcExecutor {
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
        // 1. Resolve agent binary path
        let agent_path = which::which(agent).map_err(|e| {
            CommanderError::command(agent, None, format!("agent not found in PATH: {}", e))
        })?;

        // 2. Build spawn args
        let mut args: Vec<String> = Vec::new();

        // Add flag variant flags (e.g. "--mode rpc" → ["--mode", "rpc"])
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
                    format!("failed to spawn agent in RPC mode: {}", e),
                )
            })?;

        // 4. Capture stdin and stdout
        let stdin = child.stdin.take().ok_or_else(|| {
            CommanderError::command(agent, None, "failed to capture stdin for RPC process")
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            CommanderError::command(agent, None, "failed to capture stdout for RPC process")
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

        // 8. Send initial prompt via JSON-RPC
        let prompt_req = build_rpc_request(
            "autohand.prompt",
            Some(build_prompt_params(message, None)),
        );
        let prompt_line = serialize_rpc_to_line(&prompt_req);
        write_stdin_line(&self.stdin, &prompt_line).await?;

        // 9. Read stdout line-by-line in a background task
        let app_handle = app.clone();
        let alive_flag = Arc::clone(&self.alive);
        let session_id_task = session_id_owned.clone();

        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            loop {
                match lines.next_line().await {
                    Ok(Some(line)) => {
                        let trimmed = line.trim().to_string();
                        if trimmed.is_empty() {
                            continue;
                        }
                        match parse_rpc_line(&trimmed) {
                            Ok(RpcMessage::Notification(req)) => {
                                let event =
                                    rpc_notification_to_protocol_event(&session_id_task, &req);
                                let _ = app_handle.emit("protocol-event", event);
                            }
                            Ok(RpcMessage::Response(_resp)) => {
                                // Responses are acknowledged but not forwarded to frontend
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
        let req = build_rpc_request(
            "autohand.permissionResponse",
            Some(build_permission_response_params(request_id, approved)),
        );
        let line = serialize_rpc_to_line(&req);
        write_stdin_line(&self.stdin, &line).await
    }

    async fn abort(&self) -> Result<(), CommanderError> {
        // Send graceful shutdown request
        let req = build_rpc_request("autohand.shutdown", None);
        let line = serialize_rpc_to_line(&req);
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
        Some(ProtocolMode::Rpc)
    }
}

// ---------------------------------------------------------------------------
// Map RPC notifications to ProtocolEvent
// ---------------------------------------------------------------------------

fn rpc_notification_to_protocol_event(session_id: &str, req: &JsonRpcRequest) -> ProtocolEvent {
    let params = req.params.as_ref().cloned().unwrap_or(serde_json::Value::Null);

    match req.method.as_str() {
        "autohand.message_start" | "autohand.message" => {
            let role = params
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("assistant")
                .to_string();
            let content = params
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            ProtocolEvent::Message {
                session_id: session_id.to_string(),
                role,
                content,
            }
        }
        "autohand.tool_start" => {
            let tool_name = params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let tool_id = params
                .get("id")
                .and_then(|v| v.as_str())
                .map(String::from)
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let tool_kind = resolve_tool_kind(&tool_name);
            let args = params.get("args").cloned();
            ProtocolEvent::ToolStart {
                session_id: session_id.to_string(),
                tool_id,
                tool_name,
                tool_kind,
                args,
            }
        }
        "autohand.tool_update" => {
            let tool_name = params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let tool_id = params
                .get("id")
                .and_then(|v| v.as_str())
                .map(String::from)
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let output = params.get("output").and_then(|v| v.as_str()).map(String::from);
            ProtocolEvent::ToolUpdate {
                session_id: session_id.to_string(),
                tool_id,
                tool_name,
                output,
            }
        }
        "autohand.tool_end" => {
            let tool_name = params
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            let tool_id = params
                .get("id")
                .and_then(|v| v.as_str())
                .map(String::from)
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let output = params.get("output").and_then(|v| v.as_str()).map(String::from);
            let success = params.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
            let duration_ms = params.get("duration_ms").and_then(|v| v.as_u64());
            ProtocolEvent::ToolEnd {
                session_id: session_id.to_string(),
                tool_id,
                tool_name,
                output,
                success,
                duration_ms,
            }
        }
        "autohand.permission_request" => {
            let request_id = params
                .get("request_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tool_name = params
                .get("tool_name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let description = params
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            ProtocolEvent::PermissionRequest {
                session_id: session_id.to_string(),
                request_id,
                tool_name,
                description,
            }
        }
        "autohand.state_change" => {
            let status = params
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("idle")
                .to_string();
            let context_percent = params.get("context_percent").and_then(|v| v.as_f64());
            ProtocolEvent::StateChange {
                session_id: session_id.to_string(),
                status,
                context_percent,
            }
        }
        "autohand.error" => {
            let message = params
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown error")
                .to_string();
            ProtocolEvent::Error {
                session_id: session_id.to_string(),
                message,
            }
        }
        _ => ProtocolEvent::Error {
            session_id: session_id.to_string(),
            message: format!("received unknown RPC notification: {}", req.method),
        },
    }
}
