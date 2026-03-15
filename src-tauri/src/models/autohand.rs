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

/// Configuration for an MCP (Model Context Protocol) server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    pub name: String,
    #[serde(default)]
    pub transport: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub args: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default, skip_serializing_if = "std::collections::HashMap::is_empty")]
    pub env: std::collections::HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default = "default_true")]
    pub auto_connect: bool,
}

fn default_true() -> bool {
    true
}

/// Container for MCP server configurations.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct McpConfig {
    #[serde(default)]
    pub servers: Vec<McpServerConfig>,
}

/// Provider-specific details (API key, model override, base URL).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderDetails {
    #[serde(skip_serializing_if = "Option::is_none", alias = "apiKey")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", alias = "baseUrl")]
    pub base_url: Option<String>,
}

/// Permissions configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionsConfig {
    #[serde(default = "default_permissions_mode")]
    pub mode: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub whitelist: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blacklist: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub rules: Vec<String>,
    #[serde(default, alias = "rememberSession")]
    pub remember_session: bool,
}

fn default_permissions_mode() -> String {
    "interactive".to_string()
}

impl Default for PermissionsConfig {
    fn default() -> Self {
        Self {
            mode: "interactive".to_string(),
            whitelist: Vec::new(),
            blacklist: Vec::new(),
            rules: Vec::new(),
            remember_session: false,
        }
    }
}

/// Agent behavior configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentBehaviorConfig {
    #[serde(default = "default_max_iterations")]
    pub max_iterations: u32,
    #[serde(default)]
    pub enable_request_queue: bool,
}

fn default_max_iterations() -> u32 {
    10
}

impl Default for AgentBehaviorConfig {
    fn default() -> Self {
        Self {
            max_iterations: 10,
            enable_request_queue: false,
        }
    }
}

/// Network configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkConfig {
    #[serde(default = "default_timeout")]
    pub timeout: u64,
    #[serde(default = "default_max_retries")]
    pub max_retries: u32,
    #[serde(default = "default_retry_delay")]
    pub retry_delay: u64,
}

fn default_timeout() -> u64 {
    30000
}
fn default_max_retries() -> u32 {
    3
}
fn default_retry_delay() -> u64 {
    1000
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            timeout: 30000,
            max_retries: 3,
            retry_delay: 1000,
        }
    }
}

/// Configuration for an autohand CLI session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandConfig {
    #[serde(default = "default_protocol")]
    pub protocol: ProtocolMode,
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default = "default_permissions_mode")]
    pub permissions_mode: String,

    // Hooks are managed separately via hooks_service, skip during serde
    #[serde(skip)]
    pub hooks: Vec<HookDefinition>,

    // Expanded config sections
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mcp: Option<McpConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_details: Option<ProviderDetails>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permissions: Option<PermissionsConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentBehaviorConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<NetworkConfig>,
}

fn default_protocol() -> ProtocolMode {
    ProtocolMode::Rpc
}

fn default_provider() -> String {
    "anthropic".to_string()
}

impl Default for AutohandConfig {
    fn default() -> Self {
        Self {
            protocol: ProtocolMode::Rpc,
            provider: "anthropic".to_string(),
            model: None,
            permissions_mode: "interactive".to_string(),
            hooks: Vec::new(),
            mcp: None,
            provider_details: None,
            permissions: None,
            agent: None,
            network: None,
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
