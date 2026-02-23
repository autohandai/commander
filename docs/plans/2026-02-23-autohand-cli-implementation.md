# Autohand CLI First-Class Integration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate autohand code CLI as a first-class agent in Commander with dual-protocol (JSON-RPC 2.0 + ACP) support, full hooks UI, permission dialogs, and tool event visibility.

**Architecture:** Spawn autohand CLI as a subprocess with `--mode rpc` or `--mode acp`. A shared `AutohandProtocol` trait abstracts both protocols. Incoming messages are dispatched as typed Tauri events. Frontend renders tool events inline, permission requests as native dialogs, and hooks via a dedicated management panel.

**Tech Stack:** Rust (Tauri backend), TypeScript/React (frontend), async-trait, serde_json, tokio (async process I/O), Tailwind CSS + shadcn/ui (components)

**Design doc:** `docs/plans/2026-02-23-autohand-cli-integration-design.md`

---

## Task 1: Autohand Models

**Files:**
- Create: `src-tauri/src/models/autohand.rs`
- Modify: `src-tauri/src/models/mod.rs:9` (add module declaration)
- Test: `src-tauri/src/tests/models/autohand.rs`
- Create: `src-tauri/src/tests/models/mod.rs`

**Step 1: Write the failing tests**

Create `src-tauri/src/tests/models/mod.rs`:
```rust
pub mod autohand;
```

Add `pub mod models;` to `src-tauri/src/tests/mod.rs` (after line 6).

Create `src-tauri/src/tests/models/autohand.rs`:
```rust
use crate::models::autohand::*;

#[test]
fn test_protocol_mode_serialization() {
    let rpc = ProtocolMode::Rpc;
    let json = serde_json::to_string(&rpc).unwrap();
    assert_eq!(json, "\"rpc\"");

    let acp: ProtocolMode = serde_json::from_str("\"acp\"").unwrap();
    assert_eq!(acp, ProtocolMode::Acp);
}

#[test]
fn test_autohand_status_default() {
    let state = AutohandState::default();
    assert_eq!(state.status, AutohandStatus::Idle);
    assert_eq!(state.context_percent, 0.0);
    assert_eq!(state.message_count, 0);
}

#[test]
fn test_hook_definition_serialization() {
    let hook = HookDefinition {
        id: "hook-1".to_string(),
        event: HookEvent::PostTool,
        command: "~/.autohand/hooks/format.sh".to_string(),
        pattern: Some("*.ts".to_string()),
        enabled: true,
        description: Some("Auto-format TypeScript files".to_string()),
    };
    let json = serde_json::to_string(&hook).unwrap();
    let deserialized: HookDefinition = serde_json::from_str(&json).unwrap();
    assert_eq!(deserialized.id, "hook-1");
    assert_eq!(deserialized.event, HookEvent::PostTool);
    assert!(deserialized.enabled);
}

#[test]
fn test_autohand_config_defaults() {
    let config = AutohandConfig::default();
    assert_eq!(config.protocol, ProtocolMode::Rpc);
    assert_eq!(config.provider, "anthropic");
    assert_eq!(config.permissions_mode, "interactive");
    assert!(config.hooks.is_empty());
}

#[test]
fn test_permission_request_serialization() {
    let req = PermissionRequest {
        request_id: "req-123".to_string(),
        tool_name: "write_file".to_string(),
        description: "Write to src/app.ts".to_string(),
        file_path: Some("src/app.ts".to_string()),
        is_destructive: false,
    };
    let json = serde_json::to_string(&req).unwrap();
    assert!(json.contains("write_file"));
    assert!(json.contains("req-123"));
}

#[test]
fn test_hook_event_covers_all_lifecycle() {
    // Ensure key lifecycle events exist
    let events = vec![
        HookEvent::SessionStart,
        HookEvent::SessionEnd,
        HookEvent::PreTool,
        HookEvent::PostTool,
        HookEvent::FileModified,
        HookEvent::PrePrompt,
        HookEvent::PostResponse,
    ];
    for event in &events {
        let json = serde_json::to_string(event).unwrap();
        let back: HookEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(&back, event);
    }
}

#[test]
fn test_rpc_request_serialization() {
    let req = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "prompt".to_string(),
        params: Some(serde_json::json!({"message": "hello"})),
        id: Some(JsonRpcId::Str("1".to_string())),
    };
    let json = serde_json::to_string(&req).unwrap();
    assert!(json.contains("\"jsonrpc\":\"2.0\""));
    assert!(json.contains("\"method\":\"prompt\""));
}

#[test]
fn test_rpc_notification_has_no_id() {
    let notification = JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "agent/turnEnd".to_string(),
        params: Some(serde_json::json!({})),
        id: None,
    };
    let json = serde_json::to_string(&notification).unwrap();
    // id should be absent or null for notifications
    let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
    assert!(parsed.get("id").is_none() || parsed["id"].is_null());
}

#[test]
fn test_tool_event_serialization() {
    let event = ToolEvent {
        tool_id: "tool-1".to_string(),
        tool_name: "read_file".to_string(),
        phase: ToolPhase::Start,
        args: Some(serde_json::json!({"path": "src/main.rs"})),
        output: None,
        success: None,
        duration_ms: None,
    };
    let json = serde_json::to_string(&event).unwrap();
    assert!(json.contains("read_file"));
    assert!(json.contains("\"phase\":\"start\""));
}
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test test_protocol_mode_serialization -- --nocapture 2>&1`
Expected: FAIL - module `autohand` not found

**Step 3: Write the models**

Create `src-tauri/src/models/autohand.rs`:
```rust
use serde::{Deserialize, Serialize};

// === Protocol Types ===

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtocolMode {
    Rpc,
    Acp,
}

// === JSON-RPC 2.0 Base Types ===

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum JsonRpcId {
    Str(String),
    Num(i64),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<JsonRpcId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<JsonRpcError>,
    pub id: Option<JsonRpcId>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

// === Agent State ===

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AutohandStatus {
    Idle,
    Processing,
    WaitingPermission,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandState {
    pub status: AutohandStatus,
    pub session_id: Option<String>,
    pub model: String,
    pub context_percent: f32,
    pub message_count: u32,
}

impl Default for AutohandState {
    fn default() -> Self {
        Self {
            status: AutohandStatus::Idle,
            session_id: None,
            model: String::new(),
            context_percent: 0.0,
            message_count: 0,
        }
    }
}

// === Configuration ===

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

// === Hooks ===

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
    AutomodeIteration,
    AutomodeCheckpoint,
    AutomodePause,
    AutomodeResume,
    AutomodeCancel,
    AutomodeComplete,
    AutomodeError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HookDefinition {
    pub id: String,
    pub event: HookEvent,
    pub command: String,
    pub pattern: Option<String>,
    pub enabled: bool,
    pub description: Option<String>,
}

// === Permission ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRequest {
    pub request_id: String,
    pub tool_name: String,
    pub description: String,
    pub file_path: Option<String>,
    pub is_destructive: bool,
}

// === Tool Events ===

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolPhase {
    Start,
    Update,
    End,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolEvent {
    pub tool_id: String,
    pub tool_name: String,
    pub phase: ToolPhase,
    pub args: Option<serde_json::Value>,
    pub output: Option<String>,
    pub success: Option<bool>,
    pub duration_ms: Option<u64>,
}

// === Tauri Event Payloads ===

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandMessagePayload {
    pub session_id: String,
    pub content: String,
    pub finished: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandToolEventPayload {
    pub session_id: String,
    pub event: ToolEvent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandPermissionPayload {
    pub session_id: String,
    pub request: PermissionRequest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandHookEventPayload {
    pub session_id: String,
    pub hook_id: String,
    pub event: HookEvent,
    pub success: bool,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutohandStatePayload {
    pub session_id: String,
    pub state: AutohandState,
}
```

Add to `src-tauri/src/models/mod.rs` after line 8:
```rust
pub mod autohand;
```

And add re-export after line 17:
```rust
pub use autohand::*;
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test models::autohand -- --nocapture`
Expected: All 9 tests PASS

**Step 5: Run full test suite for regressions**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test`
Expected: All existing tests + new tests PASS

**Step 6: Commit**

```bash
git add src-tauri/src/models/autohand.rs src-tauri/src/models/mod.rs src-tauri/src/tests/models/
git commit -m "feat(autohand): add data models for autohand CLI integration

Add AutohandConfig, AutohandState, HookDefinition, PermissionRequest,
ToolEvent, JsonRpcRequest/Response types with full serialization tests."
```

---

## Task 2: Error Variants for Autohand

**Files:**
- Modify: `src-tauri/src/error.rs:71-74` (add new error variant)
- Test: `src-tauri/src/tests/error_handling.rs` (add autohand error tests)

**Step 1: Write the failing test**

Add to `src-tauri/src/tests/error_handling.rs` (at the end):
```rust
#[test]
fn test_autohand_error_messages() {
    let not_installed = CommanderError::autohand("not_installed", "Autohand CLI not found in PATH");
    assert!(not_installed.user_message().contains("Autohand"));

    let timeout = CommanderError::autohand("timeout", "No response within 30 seconds");
    assert!(timeout.user_message().contains("Autohand"));

    let protocol = CommanderError::autohand("protocol_error", "Invalid JSON-RPC response");
    assert!(protocol.user_message().contains("Autohand"));
}
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test test_autohand_error_messages -- --nocapture`
Expected: FAIL - no method `autohand` found

**Step 3: Add Autohand error variant**

Add to `CommanderError` enum in `src-tauri/src/error.rs` (after line 74, before the closing `}`):
```rust
    /// Autohand CLI integration errors
    Autohand {
        operation: String,
        message: String,
    },
```

Add builder method (after `application` method, before `user_message`):
```rust
    /// Create an Autohand error
    pub fn autohand(operation: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Autohand {
            operation: operation.into(),
            message: message.into(),
        }
    }
```

Add to `user_message` match (before the closing `}`):
```rust
            CommanderError::Autohand { operation, message } => {
                format!("Autohand {}: {}", operation, message)
            }
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test test_autohand_error_messages -- --nocapture`
Expected: PASS

**Step 5: Run full test suite**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src-tauri/src/error.rs src-tauri/src/tests/error_handling.rs
git commit -m "feat(autohand): add Autohand error variant to CommanderError"
```

---

## Task 3: Protocol Trait

**Files:**
- Create: `src-tauri/src/services/autohand/mod.rs`
- Create: `src-tauri/src/services/autohand/protocol.rs`
- Create: `src-tauri/src/services/autohand/types.rs`
- Modify: `src-tauri/src/services/mod.rs:12` (add module)

**Step 1: Create the module structure**

Create `src-tauri/src/services/autohand/mod.rs`:
```rust
pub mod protocol;
pub mod types;
```

Create `src-tauri/src/services/autohand/types.rs`:
```rust
use crate::models::autohand::*;

/// RPC method names matching autohand CLI's src/modes/rpc/types.ts
pub mod rpc_methods {
    pub const PROMPT: &str = "prompt";
    pub const ABORT: &str = "abort";
    pub const RESET: &str = "reset";
    pub const GET_STATE: &str = "getState";
    pub const GET_MESSAGES: &str = "getMessages";
    pub const PERMISSION_RESPONSE: &str = "permissionResponse";
    pub const GET_SKILLS_REGISTRY: &str = "getSkillsRegistry";
    pub const PLAN_MODE_SET: &str = "planModeSet";
    pub const YOLO_SET: &str = "yoloSet";
}

/// RPC notification names matching autohand CLI's src/modes/rpc/types.ts
pub mod rpc_notifications {
    pub const AGENT_START: &str = "agent/start";
    pub const AGENT_END: &str = "agent/end";
    pub const TURN_START: &str = "agent/turnStart";
    pub const TURN_END: &str = "agent/turnEnd";
    pub const MESSAGE_UPDATE: &str = "agent/messageUpdate";
    pub const TOOL_START: &str = "agent/toolStart";
    pub const TOOL_UPDATE: &str = "agent/toolUpdate";
    pub const TOOL_END: &str = "agent/toolEnd";
    pub const PERMISSION_REQUEST: &str = "agent/permissionRequest";
    pub const HOOK_PRE_TOOL: &str = "agent/hookPreTool";
    pub const HOOK_POST_TOOL: &str = "agent/hookPostTool";
    pub const HOOK_FILE_MODIFIED: &str = "agent/hookFileModified";
    pub const HOOK_PRE_PROMPT: &str = "agent/hookPrePrompt";
    pub const HOOK_POST_RESPONSE: &str = "agent/hookPostResponse";
    pub const STATE_CHANGE: &str = "agent/stateChange";
}

/// JSON-RPC 2.0 standard error codes
pub mod rpc_error_codes {
    pub const PARSE_ERROR: i32 = -32700;
    pub const INVALID_REQUEST: i32 = -32600;
    pub const METHOD_NOT_FOUND: i32 = -32601;
    pub const INVALID_PARAMS: i32 = -32602;
    pub const INTERNAL_ERROR: i32 = -32603;
    // Custom error codes
    pub const PERMISSION_DENIED: i32 = -32001;
    pub const TIMEOUT: i32 = -32002;
    pub const AGENT_BUSY: i32 = -32003;
    pub const OPERATION_ABORTED: i32 = -32004;
}
```

Create `src-tauri/src/services/autohand/protocol.rs`:
```rust
use async_trait::async_trait;
use crate::error::CommanderError;
use crate::models::autohand::*;

/// Shared trait for autohand protocol implementations (RPC and ACP).
/// Both protocols spawn autohand as a subprocess and communicate via stdin/stdout.
#[async_trait]
pub trait AutohandProtocol: Send + Sync {
    /// Start the autohand process with the given working directory and config.
    async fn start(
        &mut self,
        working_dir: &str,
        config: &AutohandConfig,
    ) -> Result<(), CommanderError>;

    /// Send a prompt/instruction to autohand.
    async fn send_prompt(
        &self,
        message: &str,
        images: Option<Vec<String>>,
    ) -> Result<(), CommanderError>;

    /// Abort the current in-flight operation.
    async fn abort(&self) -> Result<(), CommanderError>;

    /// Reset the agent state (clear conversation).
    async fn reset(&self) -> Result<(), CommanderError>;

    /// Query the current agent state.
    async fn get_state(&self) -> Result<AutohandState, CommanderError>;

    /// Respond to a permission request (approve or deny).
    async fn respond_permission(
        &self,
        request_id: &str,
        approved: bool,
    ) -> Result<(), CommanderError>;

    /// Gracefully shut down the autohand process.
    async fn shutdown(&self) -> Result<(), CommanderError>;

    /// Check if the process is still running.
    fn is_alive(&self) -> bool;
}
```

Add to `src-tauri/src/services/mod.rs` (after line 12):
```rust
pub mod autohand;
```

**Step 2: Verify it compiles**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo check`
Expected: Compiles without errors

**Step 3: Run full test suite**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test`
Expected: All tests PASS (no regressions)

**Step 4: Commit**

```bash
git add src-tauri/src/services/autohand/ src-tauri/src/services/mod.rs
git commit -m "feat(autohand): add AutohandProtocol trait and RPC constants

Define the shared protocol trait for RPC/ACP communication and
map all JSON-RPC method and notification names from the CLI."
```

---

## Task 4: JSON-RPC 2.0 Client

**Files:**
- Create: `src-tauri/src/services/autohand/rpc_client.rs`
- Modify: `src-tauri/src/services/autohand/mod.rs` (add module)
- Test: `src-tauri/src/tests/services/autohand_rpc.rs`
- Modify: `src-tauri/src/tests/services/mod.rs` (add test module)

**Step 1: Write the failing tests**

Check if `src-tauri/src/tests/services/mod.rs` exists. If not, create it. Add:
```rust
pub mod autohand_rpc;
```

Create `src-tauri/src/tests/services/autohand_rpc.rs`:
```rust
use crate::models::autohand::*;
use crate::services::autohand::rpc_client::*;

#[test]
fn test_build_rpc_request_with_id() {
    let req = build_rpc_request("prompt", Some(serde_json::json!({"message": "hello"})));
    assert_eq!(req.jsonrpc, "2.0");
    assert_eq!(req.method, "prompt");
    assert!(req.id.is_some());
    assert!(req.params.is_some());
}

#[test]
fn test_build_rpc_notification_without_id() {
    let notif = build_rpc_notification("agent/start", Some(serde_json::json!({})));
    assert_eq!(notif.jsonrpc, "2.0");
    assert!(notif.id.is_none());
}

#[test]
fn test_serialize_rpc_request_to_line() {
    let req = build_rpc_request("getState", None);
    let line = serialize_rpc_to_line(&req);
    assert!(line.ends_with('\n'));
    assert!(!line.contains('\n') || line.ends_with('\n'));
    let parsed: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
    assert_eq!(parsed["jsonrpc"], "2.0");
}

#[test]
fn test_parse_rpc_line_response() {
    let line = r#"{"jsonrpc":"2.0","result":{"status":"idle"},"id":"1"}"#;
    let parsed = parse_rpc_line(line);
    assert!(parsed.is_ok());
    match parsed.unwrap() {
        RpcMessage::Response(resp) => {
            assert!(resp.result.is_some());
            assert!(resp.error.is_none());
        }
        _ => panic!("Expected Response"),
    }
}

#[test]
fn test_parse_rpc_line_notification() {
    let line = r#"{"jsonrpc":"2.0","method":"agent/messageUpdate","params":{"content":"hello"}}"#;
    let parsed = parse_rpc_line(line);
    assert!(parsed.is_ok());
    match parsed.unwrap() {
        RpcMessage::Notification(req) => {
            assert_eq!(req.method, "agent/messageUpdate");
            assert!(req.id.is_none());
        }
        _ => panic!("Expected Notification"),
    }
}

#[test]
fn test_parse_rpc_line_invalid_json() {
    let line = "not json at all";
    let parsed = parse_rpc_line(line);
    assert!(parsed.is_err());
}

#[test]
fn test_build_prompt_params() {
    let params = build_prompt_params("Fix the bug", None);
    assert_eq!(params["message"], "Fix the bug");
    assert!(params.get("images").is_none());
}

#[test]
fn test_build_prompt_params_with_images() {
    let images = vec!["base64data".to_string()];
    let params = build_prompt_params("Describe this", Some(images));
    assert_eq!(params["message"], "Describe this");
    assert!(params["images"].is_array());
}

#[test]
fn test_build_permission_response_params() {
    let params = build_permission_response_params("req-123", true);
    assert_eq!(params["requestId"], "req-123");
    assert_eq!(params["approved"], true);
}

#[test]
fn test_build_autohand_spawn_args_rpc() {
    let config = AutohandConfig::default();
    let args = build_spawn_args("/home/user/project", &config);
    assert!(args.contains(&"--mode".to_string()));
    assert!(args.contains(&"rpc".to_string()));
    assert!(args.contains(&"--path".to_string()));
    assert!(args.contains(&"/home/user/project".to_string()));
}

#[test]
fn test_build_autohand_spawn_args_with_model() {
    let mut config = AutohandConfig::default();
    config.model = Some("claude-opus-4-20250514".to_string());
    let args = build_spawn_args("/project", &config);
    assert!(args.contains(&"--model".to_string()));
    assert!(args.contains(&"claude-opus-4-20250514".to_string()));
}
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test autohand_rpc -- --nocapture 2>&1`
Expected: FAIL - module `rpc_client` not found

**Step 3: Write the RPC client**

Create `src-tauri/src/services/autohand/rpc_client.rs`:
```rust
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use async_trait::async_trait;

use crate::error::CommanderError;
use crate::models::autohand::*;
use crate::services::autohand::protocol::AutohandProtocol;
use crate::services::autohand::types::*;

/// Parsed RPC message from autohand stdout
#[derive(Debug, Clone)]
pub enum RpcMessage {
    Response(JsonRpcResponse),
    Notification(JsonRpcRequest),
}

/// Build a JSON-RPC 2.0 request (with auto-generated id)
pub fn build_rpc_request(method: &str, params: Option<serde_json::Value>) -> JsonRpcRequest {
    JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method: method.to_string(),
        params,
        id: Some(JsonRpcId::Str(uuid::Uuid::new_v4().to_string())),
    }
}

/// Build a JSON-RPC 2.0 notification (no id)
pub fn build_rpc_notification(method: &str, params: Option<serde_json::Value>) -> JsonRpcRequest {
    JsonRpcRequest {
        jsonrpc: "2.0".to_string(),
        method: method.to_string(),
        params,
        id: None,
    }
}

/// Serialize a JSON-RPC message to a newline-terminated string
pub fn serialize_rpc_to_line(req: &JsonRpcRequest) -> String {
    let mut json = serde_json::to_string(req).unwrap_or_default();
    json.push('\n');
    json
}

/// Parse a line of stdout into an RpcMessage
pub fn parse_rpc_line(line: &str) -> Result<RpcMessage, CommanderError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err(CommanderError::autohand("parse", "Empty line"));
    }

    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|e| CommanderError::autohand("parse", format!("Invalid JSON: {}", e)))?;

    // If it has a "method" field, it's a notification or request
    if value.get("method").is_some() {
        let req: JsonRpcRequest = serde_json::from_value(value)
            .map_err(|e| CommanderError::autohand("parse", format!("Invalid request: {}", e)))?;
        Ok(RpcMessage::Notification(req))
    } else {
        // It's a response
        let resp: JsonRpcResponse = serde_json::from_value(value)
            .map_err(|e| CommanderError::autohand("parse", format!("Invalid response: {}", e)))?;
        Ok(RpcMessage::Response(resp))
    }
}

/// Build params for the "prompt" RPC method
pub fn build_prompt_params(message: &str, images: Option<Vec<String>>) -> serde_json::Value {
    let mut params = serde_json::json!({
        "message": message,
    });
    if let Some(imgs) = images {
        params["images"] = serde_json::json!(imgs);
    }
    params
}

/// Build params for the "permissionResponse" RPC method
pub fn build_permission_response_params(request_id: &str, approved: bool) -> serde_json::Value {
    serde_json::json!({
        "requestId": request_id,
        "approved": approved,
    })
}

/// Build command-line arguments to spawn autohand
pub fn build_spawn_args(working_dir: &str, config: &AutohandConfig) -> Vec<String> {
    let mut args = vec![
        "--mode".to_string(),
        match config.protocol {
            ProtocolMode::Rpc => "rpc".to_string(),
            ProtocolMode::Acp => "acp".to_string(),
        },
        "--path".to_string(),
        working_dir.to_string(),
    ];

    if let Some(ref model) = config.model {
        args.push("--model".to_string());
        args.push(model.clone());
    }

    args
}

/// The JSON-RPC 2.0 client for communicating with the autohand CLI
pub struct AutohandRpcClient {
    process: Option<Child>,
    stdin: Option<Arc<Mutex<tokio::process::ChildStdin>>>,
    alive: Arc<std::sync::atomic::AtomicBool>,
}

impl AutohandRpcClient {
    pub fn new() -> Self {
        Self {
            process: None,
            stdin: None,
            alive: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    /// Write a JSON-RPC request to stdin
    async fn write_request(&self, req: &JsonRpcRequest) -> Result<(), CommanderError> {
        let stdin = self.stdin.as_ref().ok_or_else(|| {
            CommanderError::autohand("write", "Process not started")
        })?;
        let line = serialize_rpc_to_line(req);
        let mut guard = stdin.lock().await;
        guard.write_all(line.as_bytes()).await.map_err(|e| {
            CommanderError::autohand("write", format!("Failed to write to stdin: {}", e))
        })?;
        guard.flush().await.map_err(|e| {
            CommanderError::autohand("write", format!("Failed to flush stdin: {}", e))
        })?;
        Ok(())
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
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| {
                CommanderError::autohand(
                    "start",
                    format!("Failed to spawn autohand: {}. Is it installed?", e),
                )
            })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            CommanderError::autohand("start", "Failed to capture autohand stdin")
        })?;

        self.stdin = Some(Arc::new(Mutex::new(stdin)));
        self.process = Some(child);
        self.alive.store(true, std::sync::atomic::Ordering::SeqCst);

        Ok(())
    }

    async fn send_prompt(
        &self,
        message: &str,
        images: Option<Vec<String>>,
    ) -> Result<(), CommanderError> {
        let params = build_prompt_params(message, images);
        let req = build_rpc_request(rpc_methods::PROMPT, Some(params));
        self.write_request(&req).await
    }

    async fn abort(&self) -> Result<(), CommanderError> {
        let req = build_rpc_request(rpc_methods::ABORT, None);
        self.write_request(&req).await
    }

    async fn reset(&self) -> Result<(), CommanderError> {
        let req = build_rpc_request(rpc_methods::RESET, None);
        self.write_request(&req).await
    }

    async fn get_state(&self) -> Result<AutohandState, CommanderError> {
        // For now return default; actual implementation will wait for response
        Ok(AutohandState::default())
    }

    async fn respond_permission(
        &self,
        request_id: &str,
        approved: bool,
    ) -> Result<(), CommanderError> {
        let params = build_permission_response_params(request_id, approved);
        let req = build_rpc_request(rpc_methods::PERMISSION_RESPONSE, Some(params));
        self.write_request(&req).await
    }

    async fn shutdown(&self) -> Result<(), CommanderError> {
        // Send abort to stop any in-flight work, then drop will kill process
        let _ = self.abort().await;
        self.alive.store(false, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }

    fn is_alive(&self) -> bool {
        self.alive.load(std::sync::atomic::Ordering::SeqCst)
    }
}
```

Update `src-tauri/src/services/autohand/mod.rs`:
```rust
pub mod protocol;
pub mod rpc_client;
pub mod types;
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test autohand_rpc -- --nocapture`
Expected: All 11 tests PASS

**Step 5: Run full test suite**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src-tauri/src/services/autohand/ src-tauri/src/tests/services/
git commit -m "feat(autohand): implement JSON-RPC 2.0 client

AutohandRpcClient implements AutohandProtocol trait. Spawns autohand
with --mode rpc and communicates via newline-delimited JSON on stdin/stdout.
Includes request building, serialization, and line parsing utilities."
```

---

## Task 5: ACP Client

**Files:**
- Create: `src-tauri/src/services/autohand/acp_client.rs`
- Modify: `src-tauri/src/services/autohand/mod.rs` (add module)
- Test: `src-tauri/src/tests/services/autohand_acp.rs`

**Step 1: Write the failing tests**

Add `pub mod autohand_acp;` to `src-tauri/src/tests/services/mod.rs`.

Create `src-tauri/src/tests/services/autohand_acp.rs`:
```rust
use crate::models::autohand::*;
use crate::services::autohand::acp_client::*;

#[test]
fn test_build_acp_spawn_args() {
    let mut config = AutohandConfig::default();
    config.protocol = ProtocolMode::Acp;
    let args = build_acp_spawn_args("/project", &config);
    assert!(args.contains(&"--mode".to_string()));
    assert!(args.contains(&"acp".to_string()));
    assert!(args.contains(&"--path".to_string()));
}

#[test]
fn test_tool_kind_mapping() {
    assert_eq!(resolve_tool_kind("read_file"), "read");
    assert_eq!(resolve_tool_kind("write_file"), "edit");
    assert_eq!(resolve_tool_kind("run_command"), "execute");
    assert_eq!(resolve_tool_kind("grep_search"), "search");
    assert_eq!(resolve_tool_kind("unknown_tool"), "other");
}

#[test]
fn test_parse_acp_ndjson_line() {
    let line = r#"{"type":"tool_start","data":{"name":"read_file","args":{"path":"src/main.rs"}}}"#;
    let parsed = parse_acp_line(line);
    assert!(parsed.is_ok());
}

#[test]
fn test_parse_acp_empty_line() {
    let parsed = parse_acp_line("");
    assert!(parsed.is_err());
}
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test autohand_acp -- --nocapture 2>&1`
Expected: FAIL - module `acp_client` not found

**Step 3: Write the ACP client**

Create `src-tauri/src/services/autohand/acp_client.rs`:
```rust
use std::sync::Arc;
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use async_trait::async_trait;

use crate::error::CommanderError;
use crate::models::autohand::*;
use crate::services::autohand::protocol::AutohandProtocol;

/// Map internal tool names to ACP ToolKind values
/// Mirrors autohand CLI's src/modes/acp/types.ts TOOL_KIND_MAP
pub fn resolve_tool_kind(tool_name: &str) -> &'static str {
    match tool_name {
        "read_file" | "read_image" | "get_file_info" => "read",
        "grep_search" | "glob_search" | "search_files" | "find_definition" | "find_references" => "search",
        "write_file" | "edit_file" | "multi_edit_file" | "create_file" => "edit",
        "rename_file" | "move_file" => "move",
        "delete_file" => "delete",
        "run_command" | "git_commit" | "git_checkout" | "git_push" => "execute",
        "think" | "plan" => "think",
        "web_fetch" | "web_search" => "fetch",
        _ => "other",
    }
}

/// Build command-line arguments to spawn autohand in ACP mode
pub fn build_acp_spawn_args(working_dir: &str, config: &AutohandConfig) -> Vec<String> {
    let mut args = vec![
        "--mode".to_string(),
        "acp".to_string(),
        "--path".to_string(),
        working_dir.to_string(),
    ];

    if let Some(ref model) = config.model {
        args.push("--model".to_string());
        args.push(model.clone());
    }

    args
}

/// Parse a line of ndJSON from the ACP stream
pub fn parse_acp_line(line: &str) -> Result<serde_json::Value, CommanderError> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return Err(CommanderError::autohand("acp_parse", "Empty line"));
    }
    serde_json::from_str(trimmed)
        .map_err(|e| CommanderError::autohand("acp_parse", format!("Invalid ndJSON: {}", e)))
}

/// The ACP client for communicating with the autohand CLI
pub struct AutohandAcpClient {
    process: Option<Child>,
    stdin: Option<Arc<Mutex<tokio::process::ChildStdin>>>,
    alive: Arc<std::sync::atomic::AtomicBool>,
}

impl AutohandAcpClient {
    pub fn new() -> Self {
        Self {
            process: None,
            stdin: None,
            alive: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        }
    }

    /// Write ndJSON to stdin
    async fn write_line(&self, value: &serde_json::Value) -> Result<(), CommanderError> {
        let stdin = self.stdin.as_ref().ok_or_else(|| {
            CommanderError::autohand("acp_write", "Process not started")
        })?;
        let mut line = serde_json::to_string(value)
            .map_err(|e| CommanderError::autohand("acp_write", format!("Serialize error: {}", e)))?;
        line.push('\n');
        let mut guard = stdin.lock().await;
        guard.write_all(line.as_bytes()).await.map_err(|e| {
            CommanderError::autohand("acp_write", format!("Write failed: {}", e))
        })?;
        guard.flush().await.map_err(|e| {
            CommanderError::autohand("acp_write", format!("Flush failed: {}", e))
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
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| {
                CommanderError::autohand(
                    "acp_start",
                    format!("Failed to spawn autohand: {}. Is it installed?", e),
                )
            })?;

        let stdin = child.stdin.take().ok_or_else(|| {
            CommanderError::autohand("acp_start", "Failed to capture autohand stdin")
        })?;

        self.stdin = Some(Arc::new(Mutex::new(stdin)));
        self.process = Some(child);
        self.alive.store(true, std::sync::atomic::Ordering::SeqCst);

        Ok(())
    }

    async fn send_prompt(
        &self,
        message: &str,
        _images: Option<Vec<String>>,
    ) -> Result<(), CommanderError> {
        let msg = serde_json::json!({
            "type": "prompt",
            "data": { "message": message }
        });
        self.write_line(&msg).await
    }

    async fn abort(&self) -> Result<(), CommanderError> {
        let msg = serde_json::json!({ "type": "abort" });
        self.write_line(&msg).await
    }

    async fn reset(&self) -> Result<(), CommanderError> {
        let msg = serde_json::json!({ "type": "reset" });
        self.write_line(&msg).await
    }

    async fn get_state(&self) -> Result<AutohandState, CommanderError> {
        Ok(AutohandState::default())
    }

    async fn respond_permission(
        &self,
        request_id: &str,
        approved: bool,
    ) -> Result<(), CommanderError> {
        let msg = serde_json::json!({
            "type": "permission_response",
            "data": { "requestId": request_id, "approved": approved }
        });
        self.write_line(&msg).await
    }

    async fn shutdown(&self) -> Result<(), CommanderError> {
        let _ = self.abort().await;
        self.alive.store(false, std::sync::atomic::Ordering::SeqCst);
        Ok(())
    }

    fn is_alive(&self) -> bool {
        self.alive.load(std::sync::atomic::Ordering::SeqCst)
    }
}
```

Update `src-tauri/src/services/autohand/mod.rs`:
```rust
pub mod acp_client;
pub mod protocol;
pub mod rpc_client;
pub mod types;
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test autohand_acp -- --nocapture`
Expected: All 4 tests PASS

**Step 5: Run full test suite**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src-tauri/src/services/autohand/ src-tauri/src/tests/services/
git commit -m "feat(autohand): implement ACP client

AutohandAcpClient implements AutohandProtocol trait. Spawns autohand
with --mode acp and communicates via ndJSON on stdin/stdout.
Includes tool kind mapping from autohand's ACP types."
```

---

## Task 6: Hooks Service

**Files:**
- Create: `src-tauri/src/services/autohand/hooks_service.rs`
- Modify: `src-tauri/src/services/autohand/mod.rs` (add module)
- Test: `src-tauri/src/tests/services/hooks_service.rs`

**Step 1: Write the failing tests**

Add `pub mod hooks_service;` to `src-tauri/src/tests/services/mod.rs`.

Create `src-tauri/src/tests/services/hooks_service.rs`:
```rust
use crate::models::autohand::*;
use crate::services::autohand::hooks_service::*;
use tempfile::TempDir;
use std::path::Path;

fn sample_hook() -> HookDefinition {
    HookDefinition {
        id: "hook-1".to_string(),
        event: HookEvent::PostTool,
        command: "/path/to/format.sh".to_string(),
        pattern: Some("*.ts".to_string()),
        enabled: true,
        description: Some("Format TS files".to_string()),
    }
}

fn write_config_with_hooks(dir: &Path, hooks: &[HookDefinition]) {
    let config = serde_json::json!({
        "hooks": {
            "definitions": hooks,
        }
    });
    let config_dir = dir.join(".autohand");
    std::fs::create_dir_all(&config_dir).unwrap();
    std::fs::write(config_dir.join("config.json"), serde_json::to_string_pretty(&config).unwrap()).unwrap();
}

#[test]
fn test_load_hooks_from_config() {
    let tmp = TempDir::new().unwrap();
    let hook = sample_hook();
    write_config_with_hooks(tmp.path(), &[hook.clone()]);

    let hooks = load_hooks_from_config(tmp.path()).unwrap();
    assert_eq!(hooks.len(), 1);
    assert_eq!(hooks[0].id, "hook-1");
    assert_eq!(hooks[0].event, HookEvent::PostTool);
}

#[test]
fn test_load_hooks_no_config_returns_empty() {
    let tmp = TempDir::new().unwrap();
    let hooks = load_hooks_from_config(tmp.path()).unwrap();
    assert!(hooks.is_empty());
}

#[test]
fn test_save_hook_to_config() {
    let tmp = TempDir::new().unwrap();
    write_config_with_hooks(tmp.path(), &[]);

    let hook = sample_hook();
    save_hook_to_config(tmp.path(), &hook).unwrap();

    let hooks = load_hooks_from_config(tmp.path()).unwrap();
    assert_eq!(hooks.len(), 1);
    assert_eq!(hooks[0].id, "hook-1");
}

#[test]
fn test_delete_hook_from_config() {
    let tmp = TempDir::new().unwrap();
    let hook = sample_hook();
    write_config_with_hooks(tmp.path(), &[hook]);

    delete_hook_from_config(tmp.path(), "hook-1").unwrap();

    let hooks = load_hooks_from_config(tmp.path()).unwrap();
    assert!(hooks.is_empty());
}

#[test]
fn test_toggle_hook_in_config() {
    let tmp = TempDir::new().unwrap();
    let hook = sample_hook();
    write_config_with_hooks(tmp.path(), &[hook]);

    toggle_hook_in_config(tmp.path(), "hook-1", false).unwrap();

    let hooks = load_hooks_from_config(tmp.path()).unwrap();
    assert!(!hooks[0].enabled);
}

#[test]
fn test_delete_nonexistent_hook_is_ok() {
    let tmp = TempDir::new().unwrap();
    write_config_with_hooks(tmp.path(), &[sample_hook()]);

    let result = delete_hook_from_config(tmp.path(), "nonexistent");
    assert!(result.is_ok());
}
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test hooks_service -- --nocapture 2>&1`
Expected: FAIL - module `hooks_service` not found

**Step 3: Write the hooks service**

Create `src-tauri/src/services/autohand/hooks_service.rs`:
```rust
use std::path::Path;
use crate::error::CommanderError;
use crate::models::autohand::HookDefinition;

/// Load hooks from autohand config at `workspace/.autohand/config.json`
pub fn load_hooks_from_config(workspace: &Path) -> Result<Vec<HookDefinition>, CommanderError> {
    let config_path = workspace.join(".autohand").join("config.json");
    if !config_path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&config_path).map_err(|e| {
        CommanderError::autohand("load_hooks", format!("Failed to read config: {}", e))
    })?;

    let config: serde_json::Value = serde_json::from_str(&content).map_err(|e| {
        CommanderError::autohand("load_hooks", format!("Invalid config JSON: {}", e))
    })?;

    let hooks = config
        .get("hooks")
        .and_then(|h| h.get("definitions"))
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| serde_json::from_value::<HookDefinition>(v.clone()).ok())
                .collect()
        })
        .unwrap_or_default();

    Ok(hooks)
}

/// Save a hook to the autohand config
pub fn save_hook_to_config(workspace: &Path, hook: &HookDefinition) -> Result<(), CommanderError> {
    let mut hooks = load_hooks_from_config(workspace)?;

    // Replace if exists, otherwise append
    if let Some(pos) = hooks.iter().position(|h| h.id == hook.id) {
        hooks[pos] = hook.clone();
    } else {
        hooks.push(hook.clone());
    }

    write_hooks_to_config(workspace, &hooks)
}

/// Delete a hook from the autohand config
pub fn delete_hook_from_config(workspace: &Path, hook_id: &str) -> Result<(), CommanderError> {
    let mut hooks = load_hooks_from_config(workspace)?;
    hooks.retain(|h| h.id != hook_id);
    write_hooks_to_config(workspace, &hooks)
}

/// Toggle a hook's enabled state
pub fn toggle_hook_in_config(
    workspace: &Path,
    hook_id: &str,
    enabled: bool,
) -> Result<(), CommanderError> {
    let mut hooks = load_hooks_from_config(workspace)?;
    if let Some(hook) = hooks.iter_mut().find(|h| h.id == hook_id) {
        hook.enabled = enabled;
    }
    write_hooks_to_config(workspace, &hooks)
}

/// Write hooks back to the config file
fn write_hooks_to_config(workspace: &Path, hooks: &[HookDefinition]) -> Result<(), CommanderError> {
    let config_path = workspace.join(".autohand").join("config.json");

    // Read existing config or create new
    let mut config: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path).map_err(|e| {
            CommanderError::autohand("write_hooks", format!("Failed to read config: {}", e))
        })?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Ensure hooks.definitions exists and update
    let hooks_value = serde_json::to_value(hooks).map_err(|e| {
        CommanderError::autohand("write_hooks", format!("Serialize error: {}", e))
    })?;

    if config.get("hooks").is_none() {
        config["hooks"] = serde_json::json!({});
    }
    config["hooks"]["definitions"] = hooks_value;

    // Write back
    let config_dir = workspace.join(".autohand");
    std::fs::create_dir_all(&config_dir).map_err(|e| {
        CommanderError::autohand("write_hooks", format!("Failed to create dir: {}", e))
    })?;

    std::fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap()).map_err(|e| {
        CommanderError::autohand("write_hooks", format!("Failed to write config: {}", e))
    })?;

    Ok(())
}
```

Update `src-tauri/src/services/autohand/mod.rs`:
```rust
pub mod acp_client;
pub mod hooks_service;
pub mod protocol;
pub mod rpc_client;
pub mod types;
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test hooks_service -- --nocapture`
Expected: All 6 tests PASS

**Step 5: Run full test suite**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src-tauri/src/services/autohand/ src-tauri/src/tests/services/
git commit -m "feat(autohand): implement hooks CRUD service

Read, create, update, delete, and toggle hooks in autohand's
.autohand/config.json configuration file."
```

---

## Task 7: Tauri Commands for Autohand

**Files:**
- Create: `src-tauri/src/commands/autohand_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs:13` (add module)
- Modify: `src-tauri/src/lib.rs:238` (register commands in generate_handler!)
- Test: `src-tauri/src/tests/commands/autohand_commands.rs`

**Step 1: Write the failing tests**

Add `pub mod autohand_commands;` to the test commands module. Check `src-tauri/src/tests/commands/mod.rs` and add it.

Create `src-tauri/src/tests/commands/autohand_commands.rs`:
```rust
use crate::models::autohand::*;
use crate::services::autohand::hooks_service;
use tempfile::TempDir;

#[test]
fn test_autohand_config_load_defaults() {
    let tmp = TempDir::new().unwrap();
    let config = crate::commands::autohand_commands::load_autohand_config_internal(
        tmp.path().to_str().unwrap(),
    );
    assert!(config.is_ok());
    let config = config.unwrap();
    assert_eq!(config.protocol, ProtocolMode::Rpc);
}

#[test]
fn test_autohand_hooks_roundtrip() {
    let tmp = TempDir::new().unwrap();
    let workspace = tmp.path().to_str().unwrap();

    // Initially empty
    let hooks = hooks_service::load_hooks_from_config(tmp.path()).unwrap();
    assert!(hooks.is_empty());

    // Add a hook
    let hook = HookDefinition {
        id: "test-hook".to_string(),
        event: HookEvent::PreTool,
        command: "echo test".to_string(),
        pattern: None,
        enabled: true,
        description: None,
    };
    hooks_service::save_hook_to_config(tmp.path(), &hook).unwrap();

    // Read back
    let hooks = hooks_service::load_hooks_from_config(tmp.path()).unwrap();
    assert_eq!(hooks.len(), 1);
    assert_eq!(hooks[0].id, "test-hook");

    // Toggle
    hooks_service::toggle_hook_in_config(tmp.path(), "test-hook", false).unwrap();
    let hooks = hooks_service::load_hooks_from_config(tmp.path()).unwrap();
    assert!(!hooks[0].enabled);

    // Delete
    hooks_service::delete_hook_from_config(tmp.path(), "test-hook").unwrap();
    let hooks = hooks_service::load_hooks_from_config(tmp.path()).unwrap();
    assert!(hooks.is_empty());
}
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test autohand_commands -- --nocapture 2>&1`
Expected: FAIL - module/function not found

**Step 3: Write the Tauri commands**

Create `src-tauri/src/commands/autohand_commands.rs`:
```rust
use std::path::Path;
use crate::models::autohand::*;
use crate::services::autohand::hooks_service;

/// Load autohand config from workspace (internal, testable)
pub fn load_autohand_config_internal(working_dir: &str) -> Result<AutohandConfig, String> {
    let workspace = Path::new(working_dir);
    let config_path = workspace.join(".autohand").join("config.json");

    if !config_path.exists() {
        return Ok(AutohandConfig::default());
    }

    let content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read autohand config: {}", e))?;

    let raw: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid autohand config: {}", e))?;

    // Extract fields with defaults
    let protocol = raw
        .get("protocol")
        .and_then(|v| serde_json::from_value::<ProtocolMode>(v.clone()).ok())
        .unwrap_or(ProtocolMode::Rpc);

    let provider = raw
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("anthropic")
        .to_string();

    let model = raw
        .get("model")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let permissions_mode = raw
        .get("permissions")
        .and_then(|v| v.get("mode"))
        .and_then(|v| v.as_str())
        .unwrap_or("interactive")
        .to_string();

    let hooks = hooks_service::load_hooks_from_config(workspace)
        .unwrap_or_default();

    Ok(AutohandConfig {
        protocol,
        provider,
        model,
        permissions_mode,
        hooks,
    })
}

// === Tauri Command Handlers ===

#[tauri::command]
pub async fn get_autohand_config(working_dir: String) -> Result<AutohandConfig, String> {
    load_autohand_config_internal(&working_dir)
}

#[tauri::command]
pub async fn save_autohand_config(working_dir: String, config: AutohandConfig) -> Result<(), String> {
    let workspace = Path::new(&working_dir);
    let config_dir = workspace.join(".autohand");
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create .autohand dir: {}", e))?;

    let config_path = config_dir.join("config.json");

    // Read existing config to preserve other fields
    let mut raw: serde_json::Value = if config_path.exists() {
        let content = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&content).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    raw["protocol"] = serde_json::to_value(&config.protocol).unwrap();
    raw["provider"] = serde_json::json!(config.provider);
    if let Some(ref model) = config.model {
        raw["model"] = serde_json::json!(model);
    }

    std::fs::write(&config_path, serde_json::to_string_pretty(&raw).unwrap())
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn get_autohand_hooks(working_dir: String) -> Result<Vec<HookDefinition>, String> {
    hooks_service::load_hooks_from_config(Path::new(&working_dir))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_autohand_hook(working_dir: String, hook: HookDefinition) -> Result<(), String> {
    hooks_service::save_hook_to_config(Path::new(&working_dir), &hook)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_autohand_hook(working_dir: String, hook_id: String) -> Result<(), String> {
    hooks_service::delete_hook_from_config(Path::new(&working_dir), &hook_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_autohand_hook(
    working_dir: String,
    hook_id: String,
    enabled: bool,
) -> Result<(), String> {
    hooks_service::toggle_hook_in_config(Path::new(&working_dir), &hook_id, enabled)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn respond_autohand_permission(
    _session_id: String,
    _request_id: String,
    _approved: bool,
) -> Result<(), String> {
    // TODO: Wire to active session's protocol.respond_permission()
    // This will be connected when the session manager is wired up
    Ok(())
}
```

Update `src-tauri/src/commands/mod.rs` - add after line 12:
```rust
pub mod autohand_commands;
```
And add re-export after line 27:
```rust
pub use autohand_commands::*;
```

Update `src-tauri/src/lib.rs` - add before the closing `]` of `generate_handler!` (before line 239):
```rust
            get_autohand_config,
            save_autohand_config,
            get_autohand_hooks,
            save_autohand_hook,
            delete_autohand_hook,
            toggle_autohand_hook,
            respond_autohand_permission,
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test autohand_commands -- --nocapture`
Expected: All tests PASS

**Step 5: Verify compilation**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo check`
Expected: No errors

**Step 6: Run full test suite**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test`
Expected: All tests PASS

**Step 7: Commit**

```bash
git add src-tauri/src/commands/autohand_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src-tauri/src/tests/commands/
git commit -m "feat(autohand): add Tauri command handlers for autohand integration

Register get/save config, hook CRUD, and permission response commands.
Wire into generate_handler! for frontend access via invoke()."
```

---

## Task 8: Frontend Agent Registration

**Files:**
- Modify: `src/components/chat/agents.ts` (add autohand agent)
- Modify: `src/components/chat/hooks/useChatExecution.ts` (add autohand routing)

**Step 1: Add autohand to agent list**

In `src/components/chat/agents.ts`:

Add to `allowedAgentIds` (line 18):
```typescript
export const allowedAgentIds = ['autohand', 'claude', 'codex', 'gemini', 'ollama', 'test'] as const
```

Add to `DEFAULT_CLI_AGENT_IDS` (line 21):
```typescript
export const DEFAULT_CLI_AGENT_IDS = ['autohand', 'claude', 'codex', 'gemini', 'ollama'] as const
```

Add to `DISPLAY_TO_ID` (line 24, add first entry):
```typescript
  'Autohand Code': 'autohand',
```

Add to `AGENTS` array (line 32, add first entry):
```typescript
  {
    id: 'autohand',
    name: 'autohand',
    displayName: 'Autohand Code',
    icon: Bot,
    description: 'Autonomous coding agent with hooks, tools, and multi-provider support',
  },
```

Add to `AGENT_CAPABILITIES` (after line 93):
```typescript
  autohand: [
    { id: 'autonomous', name: 'Autonomous Coding', description: 'Full autonomous coding with tool use and file operations', category: 'Development' },
    { id: 'hooks', name: 'Lifecycle Hooks', description: 'Pre/post tool hooks for automation workflows', category: 'Automation' },
    { id: 'multiprovider', name: 'Multi-Provider', description: 'Supports Claude, GPT-4, Gemini, Ollama, and more via OpenRouter', category: 'Configuration' },
    { id: 'skills', name: 'Skills System', description: 'Modular instruction packages for specialized tasks', category: 'Extensibility' },
  ],
```

**Step 2: Add autohand routing to useChatExecution**

In `src/components/chat/hooks/useChatExecution.ts` at line 27, add to `agentCommandMap`:
```typescript
        autohand: 'execute_autohand_command',
```

Note: For now this routes to a placeholder. The full RPC-based execution will be wired in Task 9.

**Step 3: Verify the app compiles**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && bun run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/chat/agents.ts src/components/chat/hooks/useChatExecution.ts
git commit -m "feat(autohand): register autohand as first-class agent in frontend

Add Autohand Code to agent list with capabilities. Route to
execute_autohand_command in chat execution hook."
```

---

## Task 9: Frontend Autohand Session Hook

**Files:**
- Create: `src/components/chat/hooks/useAutohandSession.ts`
- Create: `src/components/chat/hooks/useAutohandPermission.ts`
- Create: `src/components/chat/hooks/__tests__/useAutohandSession.test.ts`

**Step 1: Write the test**

Create `src/components/chat/hooks/__tests__/useAutohandSession.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

// Test the event payload types
describe('autohand session types', () => {
  it('should define message payload shape', () => {
    const payload = {
      session_id: 'sess-1',
      content: 'Hello',
      finished: false,
    }
    expect(payload.session_id).toBe('sess-1')
    expect(payload.finished).toBe(false)
  })

  it('should define tool event payload shape', () => {
    const payload = {
      session_id: 'sess-1',
      event: {
        tool_id: 'tool-1',
        tool_name: 'read_file',
        phase: 'start' as const,
        args: { path: 'src/main.rs' },
        output: null,
        success: null,
        duration_ms: null,
      },
    }
    expect(payload.event.tool_name).toBe('read_file')
    expect(payload.event.phase).toBe('start')
  })

  it('should define permission request payload shape', () => {
    const payload = {
      session_id: 'sess-1',
      request: {
        request_id: 'req-1',
        tool_name: 'write_file',
        description: 'Write to src/app.ts',
        file_path: 'src/app.ts',
        is_destructive: false,
      },
    }
    expect(payload.request.tool_name).toBe('write_file')
    expect(payload.request.is_destructive).toBe(false)
  })
})
```

**Step 2: Run test to verify it passes (type-only test)**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && bunx vitest run src/components/chat/hooks/__tests__/useAutohandSession.test.ts`
Expected: PASS

**Step 3: Write the hooks**

Create `src/components/chat/hooks/useAutohandSession.ts`:
```typescript
import { useCallback, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface AutohandMessagePayload {
  session_id: string
  content: string
  finished: boolean
}

export interface ToolEvent {
  tool_id: string
  tool_name: string
  phase: 'start' | 'update' | 'end'
  args?: Record<string, unknown>
  output?: string
  success?: boolean
  duration_ms?: number
}

export interface AutohandToolEventPayload {
  session_id: string
  event: ToolEvent
}

export interface PermissionRequest {
  request_id: string
  tool_name: string
  description: string
  file_path?: string
  is_destructive: boolean
}

export interface AutohandPermissionPayload {
  session_id: string
  request: PermissionRequest
}

export interface AutohandHookEventPayload {
  session_id: string
  hook_id: string
  event: string
  success: boolean
  duration_ms?: number
}

export interface AutohandStatePayload {
  session_id: string
  state: {
    status: 'idle' | 'processing' | 'waitingpermission'
    session_id?: string
    model: string
    context_percent: number
    message_count: number
  }
}

interface UseAutohandSessionParams {
  onMessage?: (payload: AutohandMessagePayload) => void
  onToolEvent?: (payload: AutohandToolEventPayload) => void
  onPermissionRequest?: (payload: AutohandPermissionPayload) => void
  onHookEvent?: (payload: AutohandHookEventPayload) => void
  onStateChange?: (payload: AutohandStatePayload) => void
}

export function useAutohandSession({
  onMessage,
  onToolEvent,
  onPermissionRequest,
  onHookEvent,
  onStateChange,
}: UseAutohandSessionParams) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const listenersRef = useRef<UnlistenFn[]>([])

  const setupListeners = useCallback(async (sid: string) => {
    const unlisteners: UnlistenFn[] = []

    if (onMessage) {
      unlisteners.push(
        await listen<AutohandMessagePayload>('autohand:message', (event) => {
          if (event.payload.session_id === sid) onMessage(event.payload)
        })
      )
    }

    if (onToolEvent) {
      unlisteners.push(
        await listen<AutohandToolEventPayload>('autohand:tool-event', (event) => {
          if (event.payload.session_id === sid) onToolEvent(event.payload)
        })
      )
    }

    if (onPermissionRequest) {
      unlisteners.push(
        await listen<AutohandPermissionPayload>('autohand:permission-request', (event) => {
          if (event.payload.session_id === sid) onPermissionRequest(event.payload)
        })
      )
    }

    if (onHookEvent) {
      unlisteners.push(
        await listen<AutohandHookEventPayload>('autohand:hook-event', (event) => {
          if (event.payload.session_id === sid) onHookEvent(event.payload)
        })
      )
    }

    if (onStateChange) {
      unlisteners.push(
        await listen<AutohandStatePayload>('autohand:state-change', (event) => {
          if (event.payload.session_id === sid) onStateChange(event.payload)
        })
      )
    }

    listenersRef.current = unlisteners
  }, [onMessage, onToolEvent, onPermissionRequest, onHookEvent, onStateChange])

  const cleanup = useCallback(() => {
    listenersRef.current.forEach((unlisten) => unlisten())
    listenersRef.current = []
  }, [])

  const sendPrompt = useCallback(
    async (message: string, workingDir: string, sid: string) => {
      setSessionId(sid)
      await setupListeners(sid)
      await invoke('execute_autohand_command', {
        sessionId: sid,
        message,
        workingDir,
      })
    },
    [setupListeners]
  )

  const respondPermission = useCallback(
    async (requestId: string, approved: boolean) => {
      if (!sessionId) return
      await invoke('respond_autohand_permission', {
        sessionId,
        requestId,
        approved,
      })
    },
    [sessionId]
  )

  const abort = useCallback(async () => {
    if (!sessionId) return
    await invoke('terminate_autohand_session', { sessionId })
    cleanup()
  }, [sessionId, cleanup])

  return {
    sessionId,
    sendPrompt,
    respondPermission,
    abort,
    cleanup,
  }
}
```

Create `src/components/chat/hooks/useAutohandPermission.ts`:
```typescript
import { useState, useCallback } from 'react'
import type { PermissionRequest } from './useAutohandSession'

interface UseAutohandPermissionParams {
  onRespond: (requestId: string, approved: boolean) => Promise<void>
}

export function useAutohandPermission({ onRespond }: UseAutohandPermissionParams) {
  const [pendingRequest, setPendingRequest] = useState<PermissionRequest | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const showPermissionDialog = useCallback((request: PermissionRequest) => {
    setPendingRequest(request)
    setIsOpen(true)
  }, [])

  const approve = useCallback(async () => {
    if (!pendingRequest) return
    await onRespond(pendingRequest.request_id, true)
    setIsOpen(false)
    setPendingRequest(null)
  }, [pendingRequest, onRespond])

  const deny = useCallback(async () => {
    if (!pendingRequest) return
    await onRespond(pendingRequest.request_id, false)
    setIsOpen(false)
    setPendingRequest(null)
  }, [pendingRequest, onRespond])

  return {
    pendingRequest,
    isOpen,
    showPermissionDialog,
    approve,
    deny,
  }
}
```

**Step 4: Run tests**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && bunx vitest run src/components/chat/hooks/__tests__/useAutohandSession.test.ts`
Expected: PASS

**Step 5: Verify build**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && bun run build`
Expected: Build succeeds (unused exports are fine)

**Step 6: Commit**

```bash
git add src/components/chat/hooks/useAutohandSession.ts src/components/chat/hooks/useAutohandPermission.ts src/components/chat/hooks/__tests__/useAutohandSession.test.ts
git commit -m "feat(autohand): add useAutohandSession and useAutohandPermission hooks

Frontend hooks for managing autohand RPC/ACP sessions, listening to
typed Tauri events, and handling permission request dialogs."
```

---

## Task 10: PermissionDialog Component

**Files:**
- Create: `src/components/chat/PermissionDialog.tsx`

**Step 1: Write the component**

Create `src/components/chat/PermissionDialog.tsx`:
```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { PermissionRequest } from './hooks/useAutohandSession'

interface PermissionDialogProps {
  request: PermissionRequest | null
  isOpen: boolean
  onApprove: () => void
  onDeny: () => void
}

export function PermissionDialog({ request, isOpen, onApprove, onDeny }: PermissionDialogProps) {
  if (!request) return null

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {request.is_destructive ? 'Destructive Action' : 'Permission Required'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                <span className="font-medium">Tool:</span>{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-sm">{request.tool_name}</code>
              </p>
              <p>{request.description}</p>
              {request.file_path && (
                <p>
                  <span className="font-medium">File:</span>{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-sm">{request.file_path}</code>
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDeny}>Deny</AlertDialogCancel>
          <AlertDialogAction onClick={onApprove}>Allow</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

**Step 2: Verify build**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/chat/PermissionDialog.tsx
git commit -m "feat(autohand): add PermissionDialog component

Native-style approval dialog for autohand tool permission requests
using shadcn AlertDialog."
```

---

## Task 11: ToolEventBadge Component

**Files:**
- Create: `src/components/chat/ToolEventBadge.tsx`

**Step 1: Write the component**

Create `src/components/chat/ToolEventBadge.tsx`:
```tsx
import type { ToolEvent } from './hooks/useAutohandSession'

interface ToolEventBadgeProps {
  event: ToolEvent
}

const PHASE_ICONS: Record<string, string> = {
  start: '\u{1F527}',  // wrench
  update: '\u{23F3}',  // hourglass
  end: '\u{2705}',     // check
}

export function ToolEventBadge({ event }: ToolEventBadgeProps) {
  const icon = PHASE_ICONS[event.phase] || '\u{1F527}'
  const isComplete = event.phase === 'end'
  const failed = isComplete && event.success === false

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-mono ${
        failed
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : isComplete
            ? 'border-border bg-muted/50 text-muted-foreground'
            : 'border-primary/20 bg-primary/5 text-primary'
      }`}
    >
      <span>{icon}</span>
      <span className="font-medium">{event.tool_name}</span>
      {event.args?.path && (
        <span className="text-muted-foreground truncate max-w-[200px]">
          {String(event.args.path)}
        </span>
      )}
      {event.duration_ms != null && (
        <span className="text-muted-foreground ml-auto">
          {(event.duration_ms / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  )
}
```

**Step 2: Verify build**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/chat/ToolEventBadge.tsx
git commit -m "feat(autohand): add ToolEventBadge component

Inline display for tool lifecycle events (start/update/end) in the
chat stream with tool name, file path, and duration."
```

---

## Task 12: HooksPanel Component

**Files:**
- Create: `src/components/settings/HooksPanel.tsx`
- Create: `src/hooks/useAutohandHooks.ts`

**Step 1: Write the hooks data hook**

Create `src/hooks/useAutohandHooks.ts`:
```typescript
import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface HookDefinition {
  id: string
  event: string
  command: string
  pattern?: string
  enabled: boolean
  description?: string
}

export function useAutohandHooks(workingDir: string | null) {
  const [hooks, setHooks] = useState<HookDefinition[]>([])
  const [loading, setLoading] = useState(false)

  const loadHooks = useCallback(async () => {
    if (!workingDir) return
    setLoading(true)
    try {
      const result = await invoke<HookDefinition[]>('get_autohand_hooks', { workingDir })
      setHooks(result)
    } catch {
      setHooks([])
    } finally {
      setLoading(false)
    }
  }, [workingDir])

  const saveHook = useCallback(
    async (hook: HookDefinition) => {
      if (!workingDir) return
      await invoke('save_autohand_hook', { workingDir, hook })
      await loadHooks()
    },
    [workingDir, loadHooks]
  )

  const deleteHook = useCallback(
    async (hookId: string) => {
      if (!workingDir) return
      await invoke('delete_autohand_hook', { workingDir, hookId })
      await loadHooks()
    },
    [workingDir, loadHooks]
  )

  const toggleHook = useCallback(
    async (hookId: string, enabled: boolean) => {
      if (!workingDir) return
      await invoke('toggle_autohand_hook', { workingDir, hookId, enabled })
      await loadHooks()
    },
    [workingDir, loadHooks]
  )

  useEffect(() => {
    loadHooks()
  }, [loadHooks])

  return { hooks, loading, loadHooks, saveHook, deleteHook, toggleHook }
}
```

**Step 2: Write the HooksPanel component**

Create `src/components/settings/HooksPanel.tsx`:
```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, Plus } from 'lucide-react'
import { useAutohandHooks, type HookDefinition } from '@/hooks/useAutohandHooks'

interface HooksPanelProps {
  workingDir: string | null
}

const HOOK_EVENTS = [
  'session-start',
  'session-end',
  'pre-tool',
  'post-tool',
  'file-modified',
  'pre-prompt',
  'post-response',
]

export function HooksPanel({ workingDir }: HooksPanelProps) {
  const { hooks, loading, saveHook, deleteHook, toggleHook } = useAutohandHooks(workingDir)
  const [showAdd, setShowAdd] = useState(false)
  const [newEvent, setNewEvent] = useState('post-tool')
  const [newCommand, setNewCommand] = useState('')
  const [newPattern, setNewPattern] = useState('')

  const handleAdd = async () => {
    if (!newCommand.trim()) return
    const hook: HookDefinition = {
      id: `hook-${Date.now()}`,
      event: newEvent,
      command: newCommand.trim(),
      pattern: newPattern.trim() || undefined,
      enabled: true,
      description: undefined,
    }
    await saveHook(hook)
    setNewCommand('')
    setNewPattern('')
    setShowAdd(false)
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading hooks...</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Lifecycle Hooks</h3>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-1 h-3 w-3" />
          Add Hook
        </Button>
      </div>

      {showAdd && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Event</Label>
              <select
                className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value)}
              >
                {HOOK_EVENTS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Pattern (optional)</Label>
              <Input
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                placeholder="*.ts"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Command</Label>
            <Input
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              placeholder="/path/to/hook-script.sh"
              className="h-8 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!newCommand.trim()}>
              Save
            </Button>
          </div>
        </div>
      )}

      {hooks.length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground">
          No hooks configured. Hooks run scripts at key lifecycle events (pre-tool, post-tool, file-modified, etc.).
        </p>
      )}

      <div className="space-y-2">
        {hooks.map((hook) => (
          <div
            key={hook.id}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <Switch
                checked={hook.enabled}
                onCheckedChange={(checked) => toggleHook(hook.id, checked)}
              />
              <div>
                <p className="text-sm font-mono">
                  <span className="text-primary">{hook.event}</span>
                  {hook.pattern && (
                    <span className="text-muted-foreground"> ({hook.pattern})</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                  {hook.command}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => deleteHook(hook.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Verify build**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && bun run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/hooks/useAutohandHooks.ts src/components/settings/HooksPanel.tsx
git commit -m "feat(autohand): add HooksPanel and useAutohandHooks

Hook management UI with add/edit/delete/toggle for autohand lifecycle hooks.
Communicates with backend via get/save/delete/toggle_autohand_hook commands."
```

---

## Task 13: Autohand Settings Tab

**Files:**
- Create: `src/components/settings/AutohandSettingsTab.tsx`
- Modify: Settings modal to include the new tab (identify exact file during implementation)

**Step 1: Write the component**

Create `src/components/settings/AutohandSettingsTab.tsx`:
```tsx
import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { HooksPanel } from './HooksPanel'

interface AutohandConfig {
  protocol: 'rpc' | 'acp'
  provider: string
  model?: string
  permissions_mode: string
  hooks: unknown[]
}

interface AutohandSettingsTabProps {
  workingDir: string | null
}

export function AutohandSettingsTab({ workingDir }: AutohandSettingsTabProps) {
  const [config, setConfig] = useState<AutohandConfig | null>(null)

  useEffect(() => {
    if (!workingDir) return
    invoke<AutohandConfig>('get_autohand_config', { workingDir })
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [workingDir])

  const updateConfig = async (updates: Partial<AutohandConfig>) => {
    if (!config || !workingDir) return
    const updated = { ...config, ...updates }
    setConfig(updated)
    await invoke('save_autohand_config', { workingDir, config: updated })
  }

  if (!config) {
    return <p className="text-sm text-muted-foreground">No autohand configuration found for this project.</p>
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Protocol</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Communication Mode</Label>
            <Select
              value={config.protocol}
              onValueChange={(v) => updateConfig({ protocol: v as 'rpc' | 'acp' })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rpc">JSON-RPC 2.0</SelectItem>
                <SelectItem value="acp">ACP (Agent Communication Protocol)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Permissions Mode</Label>
            <Select
              value={config.permissions_mode}
              onValueChange={(v) => updateConfig({ permissions_mode: v })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interactive">Interactive</SelectItem>
                <SelectItem value="auto">Auto-approve</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Model (optional)</Label>
          <Input
            value={config.model || ''}
            onChange={(e) => updateConfig({ model: e.target.value || undefined })}
            placeholder="e.g. anthropic/claude-sonnet-4-20250514"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="border-t pt-4">
        <HooksPanel workingDir={workingDir} />
      </div>
    </div>
  )
}
```

**Step 2: Verify build**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && bun run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/settings/AutohandSettingsTab.tsx
git commit -m "feat(autohand): add AutohandSettingsTab component

Settings panel for autohand protocol selection, permissions mode,
model override, and embedded hooks management."
```

---

## Task 14: Wire Into ChatInterface and SettingsModal

**Files:**
- Modify: `src/components/chat/ChatInterface.tsx` (or wherever messages are rendered)
- Modify: Settings modal file (identify during implementation)
- Modify: `src/components/chat/hooks/useChatExecution.ts` (final wiring)

This task requires identifying the exact components and line numbers at implementation time. The implementer should:

**Step 1: Find the settings modal**

Run: `grep -r "SettingsModal\|settings-modal\|SettingsDialog" src/components/ --include="*.tsx" -l`

**Step 2: Add "Autohand" tab to settings modal**

Add import for `AutohandSettingsTab` and add a new tab with the component.

**Step 3: Find where chat messages are rendered**

Run: `grep -r "ChatMessage\|message.role\|isStreaming" src/components/chat/ --include="*.tsx" -l`

**Step 4: Add ToolEventBadge rendering**

In the message list component, add rendering for tool events when agent is "autohand". Tool events should appear between assistant message chunks.

**Step 5: Add PermissionDialog to the chat view**

Import and render `PermissionDialog` in the chat layout, wired to `useAutohandPermission`.

**Step 6: Verify build and run**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && bun run build`
Expected: Build succeeds

**Step 7: Commit**

```bash
git add -A
git commit -m "feat(autohand): wire autohand into ChatInterface and SettingsModal

Add Autohand settings tab, inline tool events, and permission dialog
to the main UI surfaces."
```

---

## Task 15: Backend Event Dispatcher (RPC stdout reader)

**Files:**
- Modify: `src-tauri/src/services/autohand/rpc_client.rs` (add stdout reader task)
- Modify: `src-tauri/src/commands/autohand_commands.rs` (wire session management)

**Step 1: Add stdout reader to RPC client**

Add a method to `AutohandRpcClient` that spawns a tokio task reading stdout line-by-line, parsing each line as JSON-RPC, and emitting the appropriate Tauri events:

- `agent/messageUpdate` notifications -> `app.emit("autohand:message", ...)`
- `agent/toolStart` -> `app.emit("autohand:tool-event", ...)`
- `agent/toolEnd` -> `app.emit("autohand:tool-event", ...)`
- `agent/permissionRequest` -> `app.emit("autohand:permission-request", ...)`
- `agent/hookPreTool`, `agent/hookPostTool`, etc. -> `app.emit("autohand:hook-event", ...)`
- `agent/stateChange` -> `app.emit("autohand:state-change", ...)`

The reader task should:
1. Take ownership of `child.stdout`
2. Wrap in `BufReader`
3. Loop reading lines
4. Parse each line with `parse_rpc_line`
5. Match on notification method name
6. Emit typed Tauri event with appropriate payload
7. On EOF or error, emit a final `autohand:message` with `finished: true`

**Step 2: Add execute_autohand_command Tauri command**

In `autohand_commands.rs`, implement the full `execute_autohand_command`:
1. Create `AutohandRpcClient` or `AutohandAcpClient` based on config
2. Call `protocol.start(working_dir, config)`
3. Take stdout from the child process
4. Spawn the reader task with `app.clone()` for emitting events
5. Send the initial prompt via `protocol.send_prompt(message)`
6. Store session in a static `AUTOHAND_SESSIONS` map
7. Return session_id

**Step 3: Register new command in lib.rs**

Add `execute_autohand_command` and `terminate_autohand_session` to `generate_handler!`.

**Step 4: Test with cargo check**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo check`
Expected: Compiles

**Step 5: Run full test suite**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src-tauri/src/services/autohand/ src-tauri/src/commands/ src-tauri/src/lib.rs
git commit -m "feat(autohand): implement event dispatcher and session management

Spawn autohand process, read stdout in background task, parse
JSON-RPC notifications, and emit typed Tauri events for the frontend."
```

---

## Task 16: Integration Test

**Files:**
- Create: `src-tauri/src/tests/integration/autohand.rs`
- Modify: `src-tauri/src/tests/integration/mod.rs`

**Step 1: Write integration tests**

These tests verify the full flow without requiring autohand to be installed (mock the process):

```rust
use crate::models::autohand::*;
use crate::services::autohand::rpc_client::*;
use crate::services::autohand::acp_client::*;

#[test]
fn test_rpc_full_prompt_flow() {
    // Build request
    let req = build_rpc_request("prompt", Some(build_prompt_params("Fix the bug", None)));
    let line = serialize_rpc_to_line(&req);

    // Simulate response
    let response_line = r#"{"jsonrpc":"2.0","method":"agent/messageUpdate","params":{"content":"I'll fix that bug."}}"#;
    let parsed = parse_rpc_line(response_line).unwrap();

    match parsed {
        RpcMessage::Notification(notif) => {
            assert_eq!(notif.method, "agent/messageUpdate");
            let content = notif.params.unwrap()["content"].as_str().unwrap();
            assert_eq!(content, "I'll fix that bug.");
        }
        _ => panic!("Expected notification"),
    }
}

#[test]
fn test_rpc_permission_flow() {
    // Simulate permission request notification
    let perm_line = r#"{"jsonrpc":"2.0","method":"agent/permissionRequest","params":{"requestId":"req-1","toolName":"write_file","description":"Write to src/app.ts","filePath":"src/app.ts","isDestructive":false}}"#;
    let parsed = parse_rpc_line(perm_line).unwrap();

    match parsed {
        RpcMessage::Notification(notif) => {
            assert_eq!(notif.method, "agent/permissionRequest");
            let params = notif.params.unwrap();
            assert_eq!(params["toolName"], "write_file");
        }
        _ => panic!("Expected notification"),
    }

    // Build permission response
    let resp_req = build_rpc_request(
        "permissionResponse",
        Some(build_permission_response_params("req-1", true)),
    );
    let line = serialize_rpc_to_line(&resp_req);
    assert!(line.contains("permissionResponse"));
    assert!(line.contains("\"approved\":true"));
}

#[test]
fn test_acp_tool_kind_coverage() {
    // Verify critical tools are mapped
    assert_eq!(resolve_tool_kind("read_file"), "read");
    assert_eq!(resolve_tool_kind("write_file"), "edit");
    assert_eq!(resolve_tool_kind("grep_search"), "search");
    assert_eq!(resolve_tool_kind("run_command"), "execute");
    assert_eq!(resolve_tool_kind("think"), "think");
    assert_eq!(resolve_tool_kind("web_fetch"), "fetch");
    assert_eq!(resolve_tool_kind("delete_file"), "delete");
    assert_eq!(resolve_tool_kind("rename_file"), "move");
}

#[test]
fn test_hooks_service_integration() {
    use crate::services::autohand::hooks_service::*;
    let tmp = tempfile::TempDir::new().unwrap();

    // Full lifecycle: create -> read -> toggle -> delete
    let hook = HookDefinition {
        id: "int-hook-1".to_string(),
        event: HookEvent::PostTool,
        command: "echo formatted".to_string(),
        pattern: Some("*.rs".to_string()),
        enabled: true,
        description: Some("Format Rust files".to_string()),
    };

    save_hook_to_config(tmp.path(), &hook).unwrap();
    let hooks = load_hooks_from_config(tmp.path()).unwrap();
    assert_eq!(hooks.len(), 1);

    toggle_hook_in_config(tmp.path(), "int-hook-1", false).unwrap();
    let hooks = load_hooks_from_config(tmp.path()).unwrap();
    assert!(!hooks[0].enabled);

    delete_hook_from_config(tmp.path(), "int-hook-1").unwrap();
    let hooks = load_hooks_from_config(tmp.path()).unwrap();
    assert!(hooks.is_empty());
}
```

**Step 2: Run integration tests**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test integration::autohand -- --nocapture`
Expected: All tests PASS

**Step 3: Run FULL test suite (final verification)**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test`
Expected: ALL tests PASS, zero regressions

**Step 4: Commit**

```bash
git add src-tauri/src/tests/integration/
git commit -m "test(autohand): add integration tests for RPC flow, ACP mapping, and hooks

End-to-end tests for prompt/permission/hook flows without requiring
autohand CLI to be installed."
```

---

## Summary

| Task | Description | New Files | Modified Files |
|------|-------------|-----------|----------------|
| 1 | Models | 3 | 1 |
| 2 | Error variants | 0 | 2 |
| 3 | Protocol trait | 3 | 1 |
| 4 | RPC client | 1 | 2 |
| 5 | ACP client | 1 | 2 |
| 6 | Hooks service | 1 | 2 |
| 7 | Tauri commands | 1 | 3 |
| 8 | Frontend agent registration | 0 | 2 |
| 9 | Frontend session hooks | 3 | 0 |
| 10 | PermissionDialog | 1 | 0 |
| 11 | ToolEventBadge | 1 | 0 |
| 12 | HooksPanel + useAutohandHooks | 2 | 0 |
| 13 | AutohandSettingsTab | 1 | 0 |
| 14 | Wire into ChatInterface/Settings | 0 | 3+ |
| 15 | Event dispatcher | 0 | 3 |
| 16 | Integration tests | 1 | 1 |

**Total: ~19 new files, ~22 modified files, 16 tasks**
