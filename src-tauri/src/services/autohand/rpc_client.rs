#![allow(dead_code)] // Items used by later tasks (commands, event dispatcher)

use async_trait::async_trait;
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::CommanderError;
use crate::models::autohand::{
    AutohandConfig, AutohandState, JsonRpcId, JsonRpcRequest, JsonRpcResponse,
    ProtocolMode,
};
use crate::services::autohand::protocol::AutohandProtocol;

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

/// Build the CLI arguments needed to spawn an autohand process in RPC/ACP mode.
pub fn build_spawn_args(working_dir: &str, config: &AutohandConfig) -> Vec<String> {
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
}

impl AutohandRpcClient {
    /// Create a new, unstarted RPC client.
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            stdin_writer: Arc::new(Mutex::new(None)),
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
}

#[async_trait]
impl AutohandProtocol for AutohandRpcClient {
    async fn start(
        &mut self,
        working_dir: &str,
        config: &AutohandConfig,
    ) -> Result<(), CommanderError> {
        let args = build_spawn_args(working_dir, config);

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

        *self.stdin_writer.lock().await = Some(stdin);
        *self.child.lock().await = Some(child);

        Ok(())
    }

    async fn send_prompt(
        &self,
        message: &str,
        images: Option<Vec<String>>,
    ) -> Result<(), CommanderError> {
        let params = build_prompt_params(message, images);
        self.send_request("prompt", Some(params)).await?;
        Ok(())
    }

    async fn abort(&self) -> Result<(), CommanderError> {
        self.send_request("abort", None).await?;
        Ok(())
    }

    async fn reset(&self) -> Result<(), CommanderError> {
        self.send_request("reset", None).await?;
        Ok(())
    }

    async fn get_state(&self) -> Result<AutohandState, CommanderError> {
        self.send_request("getState", None).await?;
        // In a full implementation we would read back the response from stdout.
        // For now return a default state; the read-loop will be wired in a
        // later task (event dispatcher).
        Ok(AutohandState::default())
    }

    async fn respond_permission(
        &self,
        request_id: &str,
        approved: bool,
    ) -> Result<(), CommanderError> {
        let params = build_permission_response_params(request_id, approved);
        self.send_request("permissionResponse", Some(params))
            .await?;
        Ok(())
    }

    async fn shutdown(&self) -> Result<(), CommanderError> {
        // Send a graceful shutdown request, then kill if needed.
        let mut guard = self.child.lock().await;
        if let Some(ref mut child) = *guard {
            // Try to kill the process
            let _ = child.kill().await;
        }
        *guard = None;
        *self.stdin_writer.lock().await = None;
        Ok(())
    }

    fn is_alive(&self) -> bool {
        // We cannot do async in a sync fn, so we use try_lock.
        if let Ok(guard) = self.child.try_lock() {
            guard.is_some()
        } else {
            // Lock is held (process is being used) -- assume alive.
            true
        }
    }
}
