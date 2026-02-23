use serde::{Deserialize, Serialize};
use serde_json::Value;

// ---------------------------------------------------------------------------
// Protocol & JSON-RPC types
// ---------------------------------------------------------------------------

/// The protocol mode used to communicate with the autohand CLI.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtocolMode {
    Rpc,
    Acp,
}

/// A JSON-RPC 2.0 request / notification id (string or number).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum JsonRpcId {
    Str(String),
    Num(i64),
}

/// A JSON-RPC 2.0 request or notification.
///
/// When `id` is `None` this represents a *notification* (no response expected).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<JsonRpcId>,
}

/// A JSON-RPC 2.0 response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
    pub id: Option<JsonRpcId>,
}

/// A JSON-RPC 2.0 error object.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

// ---------------------------------------------------------------------------
// Autohand session state
// ---------------------------------------------------------------------------

/// Current status of the autohand CLI session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AutohandStatus {
    Idle,
    Processing,
    WaitingPermission,
}

/// Snapshot of the autohand session state exposed to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandState {
    pub status: AutohandStatus,
    pub session_id: Option<String>,
    pub model: Option<String>,
    pub context_percent: f32,
    pub message_count: u32,
}

impl Default for AutohandState {
    fn default() -> Self {
        Self {
            status: AutohandStatus::Idle,
            session_id: None,
            model: None,
            context_percent: 0.0,
            message_count: 0,
        }
    }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/// Configuration for an autohand CLI session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandConfig {
    pub protocol: ProtocolMode,
    pub provider: String,
    pub model: Option<String>,
    pub permissions_mode: String,
    pub hooks: Vec<HookDefinition>,
}

impl Default for AutohandConfig {
    fn default() -> Self {
        Self {
            protocol: ProtocolMode::Rpc,
            provider: "anthropic".to_string(),
            model: None,
            permissions_mode: "interactive".to_string(),
            hooks: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/// Lifecycle events that hooks can attach to.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HookEvent {
    SessionStart,
    SessionEnd,
    PreTool,
    PostTool,
    FileModified,
    PrePrompt,
    PostResponse,
    SubagentStop,
    PermissionRequest,
    Notification,
    SessionError,
    AutomodeStart,
    AutomodeStop,
    AutomodeError,
}

/// A hook definition that maps a lifecycle event to a shell command.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookDefinition {
    pub id: String,
    pub event: HookEvent,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

// ---------------------------------------------------------------------------
// Permission requests
// ---------------------------------------------------------------------------

/// A permission request from the autohand CLI for a potentially destructive operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub request_id: String,
    pub tool_name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
    pub is_destructive: bool,
}

// ---------------------------------------------------------------------------
// Tool events
// ---------------------------------------------------------------------------

/// Phase of a tool execution lifecycle.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolPhase {
    Start,
    Update,
    End,
}

/// An event describing a tool execution phase with optional arguments and output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolEvent {
    pub tool_id: String,
    pub tool_name: String,
    pub phase: ToolPhase,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub success: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
}

// ---------------------------------------------------------------------------
// Tauri event payloads
// ---------------------------------------------------------------------------

/// Payload for autohand assistant/user messages forwarded to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandMessagePayload {
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub finished: bool,
    pub timestamp: String,
}

/// Payload for tool execution events forwarded to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandToolEventPayload {
    pub session_id: String,
    pub event: ToolEvent,
}

/// Payload for permission request events forwarded to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandPermissionPayload {
    pub session_id: String,
    pub request: PermissionRequest,
}

/// Payload for hook execution events forwarded to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandHookEventPayload {
    pub session_id: String,
    pub hook_id: String,
    pub event: HookEvent,
    pub output: Option<String>,
    pub success: bool,
}

/// Payload for autohand session state changes forwarded to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandStatePayload {
    pub session_id: String,
    pub state: AutohandState,
}
