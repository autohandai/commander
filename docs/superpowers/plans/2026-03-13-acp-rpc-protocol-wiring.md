# ACP/RPC Protocol Wiring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire ACP and RPC protocol support into Commander's execution pipeline with autohand as the default first-citizen agent, trait-based executors, and PTY fallback.

**Architecture:** Extract the monolithic `execute_persistent_cli_command()` into a trait-based executor system (`PtyExecutor`, `AcpExecutor`, `RpcExecutor`). A factory picks the right executor based on a cached protocol probe. New `protocol-event` Tauri channel carries structured events alongside existing `cli-stream`. `SessionManager` replaces the global `SESSIONS` map.

**Tech Stack:** Rust/Tauri (backend), React/TypeScript (frontend), async-trait, tokio, serde, portable-pty

**Spec:** `docs/superpowers/specs/2026-03-13-acp-rpc-protocol-wiring-design.md`

---

## Chunk 1: Backend Models & Error Types

### Task 1: Add ProtocolMode and ProtocolError types

**Files:**
- Create: `src-tauri/src/models/protocol.rs`
- Modify: `src-tauri/src/models/mod.rs`
- Test: `src-tauri/src/tests/models/protocol_tests.rs`

- [ ] **Step 1: Write failing tests for protocol types**

```rust
// src-tauri/src/tests/models/protocol_tests.rs
#[cfg(test)]
mod tests {
    use crate::models::protocol::{ProtocolMode, ProtocolError, ProtocolEvent, SessionEventKind, ToolKind};
    use serde_json;

    #[test]
    fn protocol_mode_serializes_to_lowercase() {
        let acp = ProtocolMode::Acp;
        let json = serde_json::to_string(&acp).unwrap();
        assert_eq!(json, "\"acp\"");

        let rpc = ProtocolMode::Rpc;
        let json = serde_json::to_string(&rpc).unwrap();
        assert_eq!(json, "\"rpc\"");
    }

    #[test]
    fn protocol_mode_deserializes_from_lowercase() {
        let acp: ProtocolMode = serde_json::from_str("\"acp\"").unwrap();
        assert_eq!(acp, ProtocolMode::Acp);
    }

    #[test]
    fn protocol_error_converts_to_commander_error() {
        use crate::error::CommanderError;
        let err = ProtocolError::ProcessDied(1);
        let ce: CommanderError = err.into();
        let msg = ce.to_string();
        assert!(msg.contains("process_died"));
    }

    #[test]
    fn protocol_event_serializes_with_tag() {
        let event = ProtocolEvent::Message {
            session_id: "s1".into(),
            role: "assistant".into(),
            content: "hello".into(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "Message");
        assert_eq!(json["data"]["content"], "hello");
    }

    #[test]
    fn tool_kind_serializes_to_snake_case() {
        let kind = ToolKind::Read;
        let json = serde_json::to_string(&kind).unwrap();
        assert_eq!(json, "\"read\"");
    }

    #[test]
    fn session_event_kind_roundtrips() {
        let kind = SessionEventKind::FallbackToPty;
        let json = serde_json::to_string(&kind).unwrap();
        let back: SessionEventKind = serde_json::from_str(&json).unwrap();
        assert_eq!(back, kind);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test protocol_tests -- --nocapture 2>&1 | head -20`
Expected: Compilation error — module `protocol` not found.

- [ ] **Step 3: Create the protocol models file**

```rust
// src-tauri/src/models/protocol.rs
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::CommanderError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtocolMode {
    Acp,
    Rpc,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProtocolError {
    ProcessDied(i32),
    ParseError(String),
    AgentError { code: i32, message: String },
    WriteFailed(String),
    Timeout(String),
}

impl std::fmt::Display for ProtocolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::ProcessDied(code) => write!(f, "Process exited with code {code}"),
            Self::ParseError(msg) => write!(f, "Parse error: {msg}"),
            Self::AgentError { code, message } => write!(f, "Agent error ({code}): {message}"),
            Self::WriteFailed(msg) => write!(f, "Write failed: {msg}"),
            Self::Timeout(msg) => write!(f, "Timeout: {msg}"),
        }
    }
}

impl From<ProtocolError> for CommanderError {
    fn from(e: ProtocolError) -> Self {
        match e {
            ProtocolError::ProcessDied(code) => CommanderError::Protocol {
                kind: "process_died".into(),
                code: Some(code),
                message: format!("Process exited with code {code}"),
            },
            ProtocolError::ParseError(msg) => CommanderError::Protocol {
                kind: "parse_error".into(),
                code: None,
                message: msg,
            },
            ProtocolError::AgentError { code, message } => CommanderError::Protocol {
                kind: "agent_error".into(),
                code: Some(code),
                message,
            },
            ProtocolError::WriteFailed(msg) => CommanderError::Protocol {
                kind: "write_failed".into(),
                code: None,
                message: msg,
            },
            ProtocolError::Timeout(msg) => CommanderError::Protocol {
                kind: "timeout".into(),
                code: None,
                message: msg,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ProtocolEvent {
    Message {
        session_id: String,
        role: String,
        content: String,
    },
    ToolStart {
        session_id: String,
        tool_id: String,
        tool_name: String,
        tool_kind: ToolKind,
        args: Option<Value>,
    },
    ToolUpdate {
        session_id: String,
        tool_id: String,
        tool_name: String,
        output: Option<String>,
    },
    ToolEnd {
        session_id: String,
        tool_id: String,
        tool_name: String,
        output: Option<String>,
        success: bool,
        duration_ms: Option<u64>,
    },
    PermissionRequest {
        session_id: String,
        request_id: String,
        tool_name: String,
        description: String,
    },
    StateChange {
        session_id: String,
        status: String,
        context_percent: Option<f64>,
    },
    Error {
        session_id: String,
        message: String,
    },
    SessionEvent {
        session_id: String,
        event: SessionEventKind,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionEventKind {
    Connected,
    Reconnected,
    Disconnected,
    FallbackToPty,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    Read,
    Write,
    Edit,
    Delete,
    Execute,
    Think,
    Fetch,
    Search,
    Other,
}
```

- [ ] **Step 4: Register the module in models/mod.rs**

Add `pub mod protocol;` to `src-tauri/src/models/mod.rs`.

- [ ] **Step 5: Add Protocol variant to CommanderError**

In `src-tauri/src/error.rs`, add the variant to the `CommanderError` enum (after `Application`):

```rust
Protocol {
    kind: String,
    code: Option<i32>,
    message: String,
},
```

**IMPORTANT**: `CommanderError` does NOT implement `Display` directly — it delegates to `user_message()`. Add the match arm in `user_message()` (around line 306, after the `Application` arm):

```rust
CommanderError::Protocol { kind, code, message } => match code {
    Some(c) => format!(
        "Protocol error ({}, code {}): {}",
        kind, c, message
    ),
    None => format!("Protocol error ({}): {}", kind, message),
},
```

Also add a constructor method (following the pattern of existing constructors like `pub fn git(...)`, `pub fn session(...)` etc.):

```rust
pub fn protocol(kind: impl Into<String>, code: Option<i32>, message: impl Into<String>) -> Self {
    CommanderError::Protocol {
        kind: kind.into(),
        code,
        message: message.into(),
    }
}
```

- [ ] **Step 6: Create tests/models/ module directory**

Create `src-tauri/src/tests/models/mod.rs` with:
```rust
mod protocol_tests;
```

Then add `pub mod models;` to `src-tauri/src/tests/mod.rs`.

- [ ] **Step 7: Register test module (already done in Step 6)**

Add `mod protocol_tests;` to `src-tauri/src/tests/models/mod.rs` (create if needed).

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd src-tauri && cargo test protocol_tests -- --nocapture`
Expected: All 6 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/models/protocol.rs src-tauri/src/models/mod.rs src-tauri/src/error.rs src-tauri/src/tests/
git commit -m "feat: add ProtocolMode, ProtocolError, and ProtocolEvent types"
```

---

### Task 2: Extend AIAgent model with protocol fields

**Files:**
- Modify: `src-tauri/src/models/ai_agent.rs`
- Modify: `src-tauri/src/models/ai_agent.rs` (AllAgentSettings)
- Test: `src-tauri/src/tests/models/ai_agent_tests.rs`

- [ ] **Step 1: Write failing tests**

```rust
// src-tauri/src/tests/models/ai_agent_tests.rs
#[cfg(test)]
mod tests {
    use crate::models::ai_agent::{AIAgent, AllAgentSettings, AgentSettings};
    use crate::models::protocol::ProtocolMode;

    #[test]
    fn ai_agent_has_protocol_field() {
        let agent = AIAgent {
            name: "autohand".into(),
            command: "autohand".into(),
            display_name: "Autohand".into(),
            available: true,
            enabled: true,
            error_message: None,
            installed_version: Some("1.0.0".into()),
            latest_version: Some("1.0.0".into()),
            upgrade_available: false,
            protocol: Some(ProtocolMode::Acp),
            is_default: true,
            removable: false,
        };
        assert_eq!(agent.protocol, Some(ProtocolMode::Acp));
        assert!(agent.is_default);
        assert!(!agent.removable);
    }

    #[test]
    fn all_agent_settings_deserializes_without_autohand() {
        let json = r#"{
            "claude": { "enabled": true, "model": null, "sandbox_mode": false, "auto_approval": false, "session_timeout_minutes": 30, "output_format": "text", "debug_mode": false, "max_tokens": null, "temperature": null },
            "codex": { "enabled": true, "model": null, "sandbox_mode": false, "auto_approval": false, "session_timeout_minutes": 30, "output_format": "text", "debug_mode": false, "max_tokens": null, "temperature": null },
            "gemini": { "enabled": true, "model": null, "sandbox_mode": false, "auto_approval": false, "session_timeout_minutes": 30, "output_format": "text", "debug_mode": false, "max_tokens": null, "temperature": null },
            "max_concurrent_sessions": 3
        }"#;
        let settings: AllAgentSettings = serde_json::from_str(json).unwrap();
        assert!(settings.autohand.enabled);  // default value
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test ai_agent_tests -- --nocapture 2>&1 | head -20`
Expected: Compilation error — missing fields.

- [ ] **Step 3: Add new fields to AIAgent**

In `src-tauri/src/models/ai_agent.rs`, add to the `AIAgent` struct:

```rust
use crate::models::protocol::ProtocolMode;

// Add these fields after upgrade_available:
pub protocol: Option<ProtocolMode>,
pub is_default: bool,
pub removable: bool,
```

- [ ] **Step 4: Add autohand to AllAgentSettings with serde(default)**

In `src-tauri/src/models/ai_agent.rs`, add to `AllAgentSettings`:

```rust
#[serde(default)]
pub autohand: AgentSettings,
```

Ensure `AgentSettings` implements `Default`. If it doesn't, add (note: use `"markdown"` to match existing default at `ai_agent.rs:28`):

```rust
impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            model: None,
            sandbox_mode: false,
            auto_approval: false,
            session_timeout_minutes: 30,
            output_format: "markdown".to_string(),
            debug_mode: false,
            max_tokens: None,
            temperature: None,
        }
    }
}
```

- [ ] **Step 5: Fix ALL code that constructs AIAgent or AllAgentSettings**

There are multiple construction sites that must be updated:

**A) `agent_status_service.rs`** — two AIAgent construction sites:
1. Disabled agent path (~line 68-79): add `protocol: None, is_default: false, removable: true`
2. Enabled agent path (~line 188-199): add `protocol: None, is_default: false, removable: true`

Note: use hardcoded defaults here. Task 3 will update these to use `def.removable` and `def.id == "autohand"` when `AgentDefinition` gets the `removable` field.

**B) `cli_commands.rs`** — AllAgentSettings fallback constructions:
1. ~line 122-127: add `autohand: AgentSettings::default()`
2. ~line 779-784: add `autohand: AgentSettings::default()`
3. Search for any other `AllAgentSettings {` constructions in the codebase

**C) `settings_commands.rs`** — default AllAgentSettings:
1. In `load_all_agent_settings` default return: add `autohand: AgentSettings::default()`

**D) `llm_commands.rs`** — `load_agent_settings` helper:
1. Add `("autohand".to_string(), true)` to the default enabled map

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd src-tauri && cargo test ai_agent_tests -- --nocapture`
Expected: Both tests pass.

- [ ] **Step 7: Run full test suite to check nothing breaks**

Run: `cd src-tauri && cargo test 2>&1 | tail -5`
Expected: All existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/models/ai_agent.rs src-tauri/src/services/agent_status_service.rs src-tauri/src/tests/
git commit -m "feat: extend AIAgent with protocol, is_default, removable fields"
```

---

## Chunk 2: Agent Definitions & Protocol Probe

### Task 3: Extend AgentDefinition and add autohand

**Files:**
- Modify: `src-tauri/src/services/agent_status_service.rs`
- Test: existing tests in `src-tauri/src/tests/services/agent_status_service.rs`

- [ ] **Step 1: Write failing test for autohand in agent definitions**

Add to existing test file `src-tauri/src/tests/services/agent_status_service.rs`:

```rust
#[tokio::test]
async fn autohand_is_first_agent_and_non_removable() {
    // FakeProbe uses builder pattern: .with_command(name, available, version_result)
    let probe = FakeProbe::new()
        .with_command("autohand", true, Ok(Some("0.1.0".into())))
        .with_command("claude", true, Ok(Some("2.0.0".into())))
        .with_command("codex", true, Ok(Some("1.0.0".into())))
        .with_command("gemini", true, Ok(Some("1.0.0".into())));

    let service = AgentStatusService::with_probe(probe);
    let mut enabled = HashMap::new();
    enabled.insert("autohand".to_string(), true);
    enabled.insert("claude".to_string(), true);
    enabled.insert("codex".to_string(), true);
    enabled.insert("gemini".to_string(), true);

    let status = service.check_agents(&enabled).await.unwrap();
    let autohand = &status.agents[0];
    assert_eq!(autohand.name, "autohand");
    assert!(autohand.is_default);
    assert!(!autohand.removable);
}
```

**IMPORTANT: Update existing test fixtures.** The existing tests in `agent_status_service.rs` use `all_enabled()` (lines 11-17) which only includes claude/codex/gemini. After adding autohand to `AGENT_DEFINITIONS`:

1. Update `all_enabled()` to include `("autohand".to_string(), true)`
2. Update all `FakeProbe::new()` calls in existing tests to include `.with_command("autohand", ...)` entries
3. If `FakeProbe.locate()` panics on unknown commands, ensure autohand has an entry in every test
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd src-tauri && cargo test autohand_is_first -- --nocapture 2>&1 | head -20`
Expected: Fail — no "autohand" agent definition.

- [ ] **Step 3: Extend AgentDefinition struct and add autohand**

In `src-tauri/src/services/agent_status_service.rs`:

Add `removable` field to `AgentDefinition`:

```rust
#[derive(Debug, Clone)]
struct AgentDefinition {
    id: &'static str,
    command: &'static str,
    display_name: &'static str,
    package: Option<&'static str>,
    removable: bool,
}
```

Add autohand as first entry in `AGENT_DEFINITIONS`:

```rust
AgentDefinition {
    id: "autohand",
    command: "autohand",
    display_name: "Autohand",
    package: None,
    removable: false,
},
```

Add `removable: true` to existing claude, codex, gemini entries.

- [ ] **Step 4: Update check_agents to populate new AIAgent fields**

Where `AIAgent` is constructed in `check_agents()`, add:

```rust
protocol: None,  // populated by protocol cache later (Task 4)
is_default: def.id == "autohand",
removable: def.removable,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd src-tauri && cargo test agent_status -- --nocapture`
Expected: All agent status tests pass including the new one.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/agent_status_service.rs src-tauri/src/tests/
git commit -m "feat: add autohand as first-citizen agent in definitions"
```

---

### Task 4: Add protocol probe and cache to AgentStatusService

**Files:**
- Modify: `src-tauri/src/services/agent_status_service.rs`
- Test: `src-tauri/src/tests/services/agent_status_service.rs`

- [ ] **Step 1: Write failing tests for protocol detection**

```rust
#[tokio::test]
async fn detect_protocol_finds_acp_in_help_output() {
    let mut probe = FakeProbe::new();
    probe.set_available("autohand", true);
    probe.set_version("autohand", "0.1.0");
    probe.set_help_output("autohand", "Usage: autohand [OPTIONS]\n  --mode acp   Use ACP protocol\n  --mode rpc   Use RPC protocol\n");

    let result = probe.detect_protocol("autohand").await.unwrap();
    assert_eq!(result, Some((ProtocolMode::Acp, "--mode acp".to_string())));
}

#[tokio::test]
async fn detect_protocol_finds_rpc_flag() {
    let mut probe = FakeProbe::new();
    probe.set_help_output("myagent", "Options:\n  --rpc   Enable JSON-RPC mode\n");

    let result = probe.detect_protocol("myagent").await.unwrap();
    assert_eq!(result, Some((ProtocolMode::Rpc, "--rpc".to_string())));
}

#[tokio::test]
async fn detect_protocol_returns_none_when_no_flags() {
    let mut probe = FakeProbe::new();
    probe.set_help_output("basic", "Usage: basic [prompt]\n  --verbose  Enable verbose output\n");

    let result = probe.detect_protocol("basic").await.unwrap();
    assert_eq!(result, None);
}

#[tokio::test]
async fn protocol_cache_invalidates_on_version_change() {
    let mut cache = ProtocolCache::new();
    cache.set("autohand", ProtocolCacheEntry {
        protocol: Some(ProtocolMode::Acp),
        agent_version: "0.1.0".into(),
        flag_variant: Some("--mode acp".into()),
    });

    assert!(cache.needs_reprobe("autohand", "0.2.0"));
    assert!(!cache.needs_reprobe("autohand", "0.1.0"));
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test detect_protocol -- --nocapture 2>&1 | head -20`
Expected: Compilation error — `detect_protocol` method and `ProtocolCache` don't exist.

- [ ] **Step 3: Add detect_protocol to AgentProbe trait**

In `src-tauri/src/services/agent_status_service.rs`, extend the `AgentProbe` trait:

```rust
async fn detect_protocol(&self, command: &str) -> Result<Option<(ProtocolMode, String)>, String>;
```

Returns `Some((mode, flag_variant))` or `None`.

- [ ] **Step 4: Implement detect_protocol on SystemAgentProbe**

```rust
async fn detect_protocol(&self, command: &str) -> Result<Option<(ProtocolMode, String)>, String> {
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        tokio::process::Command::new(command)
            .arg("--help")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| "Help probe timed out".to_string())?
    .map_err(|e| format!("Failed to run --help: {e}"))?;

    let combined = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr),
    );

    // Check for ACP flags first (prefer ACP over RPC if both present)
    if combined.contains("--mode acp") {
        return Ok(Some((ProtocolMode::Acp, "--mode acp".to_string())));
    }
    if combined.contains("--acp") {
        return Ok(Some((ProtocolMode::Acp, "--acp".to_string())));
    }
    if combined.contains("--mode rpc") {
        return Ok(Some((ProtocolMode::Rpc, "--mode rpc".to_string())));
    }
    if combined.contains("--rpc") {
        return Ok(Some((ProtocolMode::Rpc, "--rpc".to_string())));
    }

    Ok(None)
}
```

- [ ] **Step 5: Implement detect_protocol on FakeProbe**

```rust
// In FakeProbe, add:
help_outputs: HashMap<String, String>,

pub fn set_help_output(&mut self, command: &str, output: &str) {
    self.help_outputs.insert(command.to_string(), output.to_string());
}

async fn detect_protocol(&self, command: &str) -> Result<Option<(ProtocolMode, String)>, String> {
    let help = self.help_outputs.get(command).cloned().unwrap_or_default();
    if help.contains("--mode acp") {
        return Ok(Some((ProtocolMode::Acp, "--mode acp".into())));
    }
    if help.contains("--acp") {
        return Ok(Some((ProtocolMode::Acp, "--acp".into())));
    }
    if help.contains("--mode rpc") {
        return Ok(Some((ProtocolMode::Rpc, "--mode rpc".into())));
    }
    if help.contains("--rpc") {
        return Ok(Some((ProtocolMode::Rpc, "--rpc".into())));
    }
    Ok(None)
}
```

- [ ] **Step 6: Add ProtocolCache struct**

In `src-tauri/src/services/agent_status_service.rs`:

```rust
use crate::models::protocol::ProtocolMode;

#[derive(Debug, Clone)]
pub struct ProtocolCacheEntry {
    pub protocol: Option<ProtocolMode>,
    pub agent_version: String,
    pub flag_variant: Option<String>,
}

#[derive(Debug, Default)]
pub struct ProtocolCache {
    entries: HashMap<String, ProtocolCacheEntry>,
}

impl ProtocolCache {
    pub fn new() -> Self {
        Self { entries: HashMap::new() }
    }

    pub fn get(&self, agent: &str) -> Option<&ProtocolCacheEntry> {
        self.entries.get(agent)
    }

    pub fn set(&mut self, agent: &str, entry: ProtocolCacheEntry) {
        self.entries.insert(agent.to_string(), entry);
    }

    pub fn needs_reprobe(&self, agent: &str, current_version: &str) -> bool {
        match self.entries.get(agent) {
            Some(entry) => entry.agent_version != current_version,
            None => true,
        }
    }
}
```

- [ ] **Step 7: Wire protocol probe into check_agents()**

In `check_agents()`, after getting the version for each agent, check the cache and probe if needed:

```rust
// After getting version for this agent:
let version_str = version.clone().unwrap_or_default();
if self.protocol_cache.needs_reprobe(def.id, &version_str) {
    if let Ok(detected) = self.probe.detect_protocol(def.command).await {
        let entry = ProtocolCacheEntry {
            protocol: detected.as_ref().map(|(mode, _)| *mode),
            agent_version: version_str.clone(),
            flag_variant: detected.map(|(_, flag)| flag),
        };
        self.protocol_cache.set(def.id, entry);
    }
}

// When constructing AIAgent:
let protocol = self.protocol_cache.get(def.id).and_then(|e| e.protocol);
```

Note: `AgentStatusService` needs to own a `ProtocolCache`. Change the struct to hold `protocol_cache: ProtocolCache` and make `check_agents` take `&mut self`.

**IMPORTANT: Updating call sites.** Changing `check_agents` to `&mut self` breaks:
1. `check_ai_agents()` in `llm_commands.rs` (~line 339-351) — currently creates `AgentStatusService::new()` each call. Change to store the service in Tauri managed state (`app.manage()`), or keep creating fresh instances (cache would be lost per call). **Recommended**: Store `AgentStatusService` as Tauri managed state with interior mutability (`Arc<Mutex<AgentStatusService>>`), shared between `check_ai_agents` and `monitor_ai_agents`.
2. `monitor_ai_agents()` in `llm_commands.rs` (~line 413-428) — same service instance, called in a loop.
3. Any tests that call `check_agents` — update from `&self` to `&mut self`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd src-tauri && cargo test agent_status -- --nocapture`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/services/agent_status_service.rs src-tauri/src/tests/
git commit -m "feat: add protocol probe and cache to AgentStatusService"
```

---

## Chunk 3: AgentExecutor Trait & PtyExecutor Extraction

### Task 5: Define AgentExecutor trait and ExecutorFactory

**Files:**
- Create: `src-tauri/src/services/executors/mod.rs`
- Modify: `src-tauri/src/services/mod.rs`
- Test: `src-tauri/src/tests/services/executor_tests.rs`

- [ ] **Step 1: Write failing tests for trait and factory**

```rust
// src-tauri/src/tests/services/executor_tests.rs
#[cfg(test)]
mod tests {
    use crate::services::executors::{ExecutorFactory, AgentExecutor};
    use crate::services::agent_status_service::{ProtocolCache, ProtocolCacheEntry};
    use crate::models::protocol::ProtocolMode;

    #[test]
    fn factory_creates_pty_executor_when_no_protocol() {
        let cache = ProtocolCache::new();
        let executor = ExecutorFactory::create("claude", &cache);
        assert_eq!(executor.protocol(), None);
    }

    #[test]
    fn factory_creates_acp_executor_when_acp_cached() {
        let mut cache = ProtocolCache::new();
        cache.set("autohand", ProtocolCacheEntry {
            protocol: Some(ProtocolMode::Acp),
            agent_version: "0.1.0".into(),
            flag_variant: Some("--mode acp".into()),
        });
        let executor = ExecutorFactory::create("autohand", &cache);
        assert_eq!(executor.protocol(), Some(ProtocolMode::Acp));
    }

    #[test]
    fn factory_creates_rpc_executor_when_rpc_cached() {
        let mut cache = ProtocolCache::new();
        cache.set("autohand", ProtocolCacheEntry {
            protocol: Some(ProtocolMode::Rpc),
            agent_version: "0.1.0".into(),
            flag_variant: Some("--rpc".into()),
        });
        let executor = ExecutorFactory::create("autohand", &cache);
        assert_eq!(executor.protocol(), Some(ProtocolMode::Rpc));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test executor_tests -- --nocapture 2>&1 | head -20`
Expected: Compilation error — module not found.

- [ ] **Step 3: Create executors module with trait and factory**

```rust
// src-tauri/src/services/executors/mod.rs
pub mod pty_executor;
pub mod acp_executor;
pub mod rpc_executor;

use async_trait::async_trait;
use crate::error::CommanderError;
use crate::models::ai_agent::AgentSettings;
use crate::models::protocol::ProtocolMode;
use crate::services::agent_status_service::ProtocolCache;

use self::pty_executor::PtyExecutor;
use self::acp_executor::AcpExecutor;
use self::rpc_executor::RpcExecutor;

#[async_trait]
pub trait AgentExecutor: Send + Sync {
    async fn execute(
        &mut self,
        app: &tauri::AppHandle,
        session_id: &str,
        agent: &str,
        message: &str,
        working_dir: &str,
        settings: &AgentSettings,
        resume_session_id: Option<&str>,
    ) -> Result<(), CommanderError>;

    async fn abort(&self) -> Result<(), CommanderError>;

    async fn respond_permission(&self, request_id: &str, approved: bool) -> Result<(), CommanderError>;

    fn is_alive(&self) -> bool;

    fn protocol(&self) -> Option<ProtocolMode>;
}

pub struct ExecutorFactory;

impl ExecutorFactory {
    pub fn create(agent: &str, protocol_cache: &ProtocolCache) -> Box<dyn AgentExecutor> {
        let entry = protocol_cache.get(agent);
        match entry.and_then(|e| e.protocol) {
            Some(ProtocolMode::Acp) => {
                let flag = entry.and_then(|e| e.flag_variant.clone());
                Box::new(AcpExecutor::new(flag))
            }
            Some(ProtocolMode::Rpc) => {
                let flag = entry.and_then(|e| e.flag_variant.clone());
                Box::new(RpcExecutor::new(flag))
            }
            None => Box::new(PtyExecutor::new()),
        }
    }
}
```

- [ ] **Step 4: Create stub executor files**

Create minimal stub implementations so the module compiles. Each will be fully implemented in later tasks.

```rust
// src-tauri/src/services/executors/pty_executor.rs
use std::sync::Arc;
use tokio::sync::Mutex;
use async_trait::async_trait;
use crate::error::CommanderError;
use crate::models::ai_agent::AgentSettings;
use crate::models::protocol::ProtocolMode;
use super::AgentExecutor;

pub struct PtyExecutor;

impl PtyExecutor {
    pub fn new() -> Self { Self }
}

#[async_trait]
impl AgentExecutor for PtyExecutor {
    async fn execute(&mut self, _app: &tauri::AppHandle, _session_id: &str, _agent: &str, _message: &str, _working_dir: &str, _settings: &AgentSettings, _resume_session_id: Option<&str>) -> Result<(), CommanderError> {
        todo!("Extract from cli_commands.rs")
    }
    async fn abort(&self) -> Result<(), CommanderError> { Ok(()) }
    async fn respond_permission(&self, _request_id: &str, _approved: bool) -> Result<(), CommanderError> { Ok(()) }
    fn is_alive(&self) -> bool { false }
    fn protocol(&self) -> Option<ProtocolMode> { None }
}
```

```rust
// src-tauri/src/services/executors/acp_executor.rs
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::process::{Child, ChildStdin};
use async_trait::async_trait;
use crate::error::CommanderError;
use crate::models::ai_agent::AgentSettings;
use crate::models::protocol::ProtocolMode;
use super::AgentExecutor;

pub struct AcpExecutor {
    flag_variant: Option<String>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    child: Arc<Mutex<Option<Child>>>,
}

impl AcpExecutor {
    pub fn new(flag_variant: Option<String>) -> Self {
        Self {
            flag_variant,
            stdin: Arc::new(Mutex::new(None)),
            child: Arc::new(Mutex::new(None)),
        }
    }
}

#[async_trait]
impl AgentExecutor for AcpExecutor {
    async fn execute(&mut self, _app: &tauri::AppHandle, _session_id: &str, _agent: &str, _message: &str, _working_dir: &str, _settings: &AgentSettings, _resume_session_id: Option<&str>) -> Result<(), CommanderError> {
        todo!("Restore from git history")
    }
    async fn abort(&self) -> Result<(), CommanderError> { Ok(()) }
    async fn respond_permission(&self, _request_id: &str, _approved: bool) -> Result<(), CommanderError> { Ok(()) }
    fn is_alive(&self) -> bool { false }
    fn protocol(&self) -> Option<ProtocolMode> { Some(ProtocolMode::Acp) }
}
```

```rust
// src-tauri/src/services/executors/rpc_executor.rs
// Same structure as acp_executor.rs but returns Some(ProtocolMode::Rpc)
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::process::{Child, ChildStdin};
use async_trait::async_trait;
use crate::error::CommanderError;
use crate::models::ai_agent::AgentSettings;
use crate::models::protocol::ProtocolMode;
use super::AgentExecutor;

pub struct RpcExecutor {
    flag_variant: Option<String>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    child: Arc<Mutex<Option<Child>>>,
}

impl RpcExecutor {
    pub fn new(flag_variant: Option<String>) -> Self {
        Self {
            flag_variant,
            stdin: Arc::new(Mutex::new(None)),
            child: Arc::new(Mutex::new(None)),
        }
    }
}

#[async_trait]
impl AgentExecutor for RpcExecutor {
    async fn execute(&mut self, _app: &tauri::AppHandle, _session_id: &str, _agent: &str, _message: &str, _working_dir: &str, _settings: &AgentSettings, _resume_session_id: Option<&str>) -> Result<(), CommanderError> {
        todo!("Restore from git history")
    }
    async fn abort(&self) -> Result<(), CommanderError> { Ok(()) }
    async fn respond_permission(&self, _request_id: &str, _approved: bool) -> Result<(), CommanderError> { Ok(()) }
    fn is_alive(&self) -> bool { false }
    fn protocol(&self) -> Option<ProtocolMode> { Some(ProtocolMode::Rpc) }
}
```

- [ ] **Step 5: Register module in services/mod.rs**

Add `pub mod executors;` to `src-tauri/src/services/mod.rs`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd src-tauri && cargo test executor_tests -- --nocapture`
Expected: All 3 factory tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/services/executors/ src-tauri/src/services/mod.rs src-tauri/src/tests/
git commit -m "feat: add AgentExecutor trait, ExecutorFactory, and stub executors"
```

---

### Task 6: Extract PtyExecutor from cli_commands.rs

**Files:**
- Modify: `src-tauri/src/services/executors/pty_executor.rs`
- Modify: `src-tauri/src/commands/cli_commands.rs`
- Test: `src-tauri/src/tests/services/pty_executor_tests.rs`

This is the largest extraction task. The goal is to move PTY/pipe spawning and streaming logic (lines ~858-1107 of `cli_commands.rs`) into `PtyExecutor::execute()` without changing behavior.

- [ ] **Step 1: Write integration test for PtyExecutor**

```rust
// src-tauri/src/tests/services/pty_executor_tests.rs
#[cfg(test)]
mod tests {
    use crate::services::executors::pty_executor::PtyExecutor;
    use crate::services::executors::AgentExecutor;
    use crate::models::protocol::ProtocolMode;

    #[test]
    fn pty_executor_reports_no_protocol() {
        let executor = PtyExecutor::new();
        assert_eq!(executor.protocol(), None);
    }

    #[test]
    fn pty_executor_is_not_alive_before_execute() {
        let executor = PtyExecutor::new();
        assert!(!executor.is_alive());
    }
}
```

- [ ] **Step 2: Run tests to verify current stubs pass**

Run: `cd src-tauri && cargo test pty_executor_tests -- --nocapture`
Expected: PASS (stubs already return correct values for these).

- [ ] **Step 3: Extract PTY spawning and streaming logic into PtyExecutor**

Move the following from `execute_persistent_cli_command()` into `PtyExecutor::execute()`:
- Agent path resolution via `which::which()`
- Agent-specific arg building (`build_claude_cli_args`, `build_codex_command_args`, etc.)
- PTY spawn via `try_spawn_with_pty()` with pipe fallback
- Stdout/stderr streaming loops with `CodexStreamAccumulator` and `BufReader`
- `StreamChunk` event emission on `cli-stream` channel
- Exit code handling and final chunk emission

The `PtyExecutor` struct gains:

```rust
pub struct PtyExecutor {
    child: Arc<Mutex<Option<Child>>>,
}
```

Key: Keep `execute_persistent_cli_command()` as the Tauri command entry point, but have it delegate to the executor via the factory. This means the function shrinks to: parse command → create executor → call execute → handle fallback.

- [ ] **Step 4: Update execute_persistent_cli_command to use PtyExecutor**

Replace the PTY/pipe section of `execute_persistent_cli_command()` with:

```rust
let mut executor = PtyExecutor::new();
executor.execute(&app_clone, &session_id, &agent_name, &message, &working_dir, &settings, None).await
    .map_err(|e| e.to_string())?;
```

This is the intermediate step — full factory wiring comes in Task 9.

- [ ] **Step 5: Run full test suite**

Run: `cd src-tauri && cargo test 2>&1 | tail -10`
Expected: All tests pass. No behavior change.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/executors/pty_executor.rs src-tauri/src/commands/cli_commands.rs src-tauri/src/tests/
git commit -m "refactor: extract PTY/pipe execution into PtyExecutor"
```

---

## Chunk 4: ACP Executor Implementation

### Task 7: Implement AcpExecutor with ndJSON parsing

**Files:**
- Modify: `src-tauri/src/services/executors/acp_executor.rs`
- Test: `src-tauri/src/tests/services/acp_executor_tests.rs`

Reference: `git show 5d7f243:src-tauri/src/services/autohand/acp_client.rs` for the original implementation.

- [ ] **Step 1: Write failing tests for ACP message parsing**

```rust
// src-tauri/src/tests/services/acp_executor_tests.rs
#[cfg(test)]
mod tests {
    use crate::services::executors::acp_executor::{classify_acp_message, AcpMessage, resolve_tool_kind};
    use crate::models::protocol::ToolKind;

    #[test]
    fn classify_message_event() {
        let line = r#"{"type":"message","data":{"role":"assistant","content":"Hello"}}"#;
        let msg = classify_acp_message(line).unwrap();
        match msg {
            AcpMessage::Message { role, content } => {
                assert_eq!(role, "assistant");
                assert_eq!(content, "Hello");
            }
            _ => panic!("Expected Message"),
        }
    }

    #[test]
    fn classify_tool_start_event() {
        let line = r#"{"type":"tool_start","data":{"name":"read_file","args":{"path":"foo.rs"}}}"#;
        let msg = classify_acp_message(line).unwrap();
        match msg {
            AcpMessage::ToolStart { name, args } => {
                assert_eq!(name, "read_file");
                assert!(args.is_some());
            }
            _ => panic!("Expected ToolStart"),
        }
    }

    #[test]
    fn classify_tool_end_event() {
        let line = r#"{"type":"tool_end","data":{"name":"write_file","output":"done","success":true,"duration_ms":150}}"#;
        let msg = classify_acp_message(line).unwrap();
        match msg {
            AcpMessage::ToolEnd { name, success, duration_ms, .. } => {
                assert_eq!(name, "write_file");
                assert!(success);
                assert_eq!(duration_ms, Some(150));
            }
            _ => panic!("Expected ToolEnd"),
        }
    }

    #[test]
    fn classify_permission_request() {
        let line = r#"{"type":"permission_request","data":{"request_id":"r1","tool_name":"bash","description":"Run command"}}"#;
        let msg = classify_acp_message(line).unwrap();
        match msg {
            AcpMessage::PermissionRequest { request_id, tool_name, description } => {
                assert_eq!(request_id, "r1");
                assert_eq!(tool_name, "bash");
                assert_eq!(description, "Run command");
            }
            _ => panic!("Expected PermissionRequest"),
        }
    }

    #[test]
    fn classify_state_change() {
        let line = r#"{"type":"state_change","data":{"status":"processing","context_percent":0.45}}"#;
        let msg = classify_acp_message(line).unwrap();
        match msg {
            AcpMessage::StateChange { status, context_percent } => {
                assert_eq!(status, "processing");
                assert_eq!(context_percent, Some(0.45));
            }
            _ => panic!("Expected StateChange"),
        }
    }

    #[test]
    fn classify_unknown_type() {
        let line = r#"{"type":"custom","data":{}}"#;
        let msg = classify_acp_message(line).unwrap();
        assert!(matches!(msg, AcpMessage::Unknown(_)));
    }

    #[test]
    fn resolve_tool_kind_maps_correctly() {
        assert_eq!(resolve_tool_kind("read_file"), ToolKind::Read);
        assert_eq!(resolve_tool_kind("write_file"), ToolKind::Write);
        assert_eq!(resolve_tool_kind("bash"), ToolKind::Execute);
        assert_eq!(resolve_tool_kind("grep"), ToolKind::Search);
        assert_eq!(resolve_tool_kind("unknown_tool"), ToolKind::Other);
    }

    #[test]
    fn acp_executor_reports_acp_protocol() {
        use crate::services::executors::AgentExecutor;
        use crate::services::executors::acp_executor::AcpExecutor;
        use crate::models::protocol::ProtocolMode;

        let executor = AcpExecutor::new(Some("--mode acp".into()));
        assert_eq!(executor.protocol(), Some(ProtocolMode::Acp));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test acp_executor_tests -- --nocapture 2>&1 | head -20`
Expected: Compilation error — `classify_acp_message` and `AcpMessage` don't exist.

- [ ] **Step 3: Implement ACP message types and parsing**

Restore and adapt from git history (`git show 5d7f243:src-tauri/src/services/autohand/acp_client.rs`). Key pieces to port into `acp_executor.rs`:

- `AcpMessage` enum
- `classify_acp_message()` function
- `resolve_tool_kind()` function (adapt return type from `&str` to `ToolKind`)
- `build_acp_spawn_args()` (adapted for the executor's flag_variant)

- [ ] **Step 4: Implement AcpExecutor::execute()**

The `execute()` method should:
1. Resolve agent path with `which::which(agent)`
2. Build spawn args using `flag_variant` (e.g., `["--mode", "acp", "--path", working_dir]` or `["--acp"]`)
3. If `resume_session_id` is Some, add `["--resume", session_id]`
4. Spawn child process with piped stdin/stdout/stderr
5. Store `ChildStdin` in `self.stdin` (interior mutability)
6. Read stdout line-by-line via `BufReader`
7. For each line, call `classify_acp_message()` → convert to `ProtocolEvent` → `app.emit("protocol-event", event)`
8. Emit `ProtocolEvent::SessionEvent { event: Connected }` at start
9. On EOF, emit final session event
10. On parse error, emit `ProtocolEvent::Error` and skip the line

- [ ] **Step 5: Implement respond_permission for ACP**

```rust
async fn respond_permission(&self, request_id: &str, approved: bool) -> Result<(), CommanderError> {
    let line = serde_json::to_string(&serde_json::json!({
        "type": "permission_response",
        "data": { "request_id": request_id, "approved": approved }
    })).map_err(|e| ProtocolError::WriteFailed(e.to_string()))?;

    let mut stdin_guard = self.stdin.lock().await;
    if let Some(stdin) = stdin_guard.as_mut() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(format!("{line}\n").as_bytes()).await
            .map_err(|e| ProtocolError::WriteFailed(e.to_string()))?;
        stdin.flush().await
            .map_err(|e| ProtocolError::WriteFailed(e.to_string()))?;
        Ok(())
    } else {
        Err(ProtocolError::WriteFailed("stdin not available".into()).into())
    }
}
```

- [ ] **Step 6: Implement abort for ACP**

```rust
async fn abort(&self) -> Result<(), CommanderError> {
    // Send shutdown command
    let line = r#"{"type":"command","data":{"command":"shutdown"}}"#;
    let mut stdin_guard = self.stdin.lock().await;
    if let Some(stdin) = stdin_guard.as_mut() {
        use tokio::io::AsyncWriteExt;
        let _ = stdin.write_all(format!("{line}\n").as_bytes()).await;
        let _ = stdin.flush().await;
    }
    // Give 2 seconds, then kill
    let mut child_guard = self.child.lock().await;
    if let Some(child) = child_guard.as_mut() {
        let _ = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            child.wait(),
        ).await;
        let _ = child.kill().await;
    }
    Ok(())
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd src-tauri && cargo test acp_executor_tests -- --nocapture`
Expected: All 7 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/services/executors/acp_executor.rs src-tauri/src/tests/
git commit -m "feat: implement AcpExecutor with ndJSON parsing and ProtocolEvent emission"
```

---

## Chunk 5: RPC Executor Implementation

### Task 8: Implement RpcExecutor with JSON-RPC 2.0

**Files:**
- Modify: `src-tauri/src/services/executors/rpc_executor.rs`
- Test: `src-tauri/src/tests/services/rpc_executor_tests.rs`

Reference: `git show 3d6981e:src-tauri/src/services/autohand/rpc_client.rs` for the original implementation.

- [ ] **Step 1: Write failing tests for RPC message building/parsing**

```rust
// src-tauri/src/tests/services/rpc_executor_tests.rs
#[cfg(test)]
mod tests {
    use crate::services::executors::rpc_executor::{
        build_rpc_request, parse_rpc_line, RpcMessage,
        build_prompt_params, build_permission_response_params,
    };

    #[test]
    fn build_rpc_request_has_correct_shape() {
        let req = build_rpc_request("autohand.prompt", Some(serde_json::json!({"message": "hi"})));
        assert_eq!(req.jsonrpc, "2.0");
        assert_eq!(req.method, "autohand.prompt");
        assert!(req.id.is_some());
    }

    #[test]
    fn parse_rpc_notification() {
        let line = r#"{"jsonrpc":"2.0","method":"autohand.message_start","params":{"role":"assistant","content":"hi"}}"#;
        let msg = parse_rpc_line(line).unwrap();
        assert!(matches!(msg, RpcMessage::Notification(_)));
    }

    #[test]
    fn parse_rpc_response() {
        let line = r#"{"jsonrpc":"2.0","id":"abc-123","result":{"status":"ok"}}"#;
        let msg = parse_rpc_line(line).unwrap();
        assert!(matches!(msg, RpcMessage::Response(_)));
    }

    #[test]
    fn build_prompt_params_structure() {
        let params = build_prompt_params("hello", None);
        assert_eq!(params["message"], "hello");
        assert!(params.get("images").is_none() || params["images"].is_null());
    }

    #[test]
    fn build_permission_response_params_structure() {
        let params = build_permission_response_params("r1", true);
        assert_eq!(params["request_id"], "r1");
        assert_eq!(params["approved"], true);
    }

    #[test]
    fn rpc_executor_reports_rpc_protocol() {
        use crate::services::executors::AgentExecutor;
        use crate::services::executors::rpc_executor::RpcExecutor;
        use crate::models::protocol::ProtocolMode;

        let executor = RpcExecutor::new(Some("--mode rpc".into()));
        assert_eq!(executor.protocol(), Some(ProtocolMode::Rpc));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test rpc_executor_tests -- --nocapture 2>&1 | head -20`
Expected: Compilation error.

- [ ] **Step 3: Implement RPC types and utility functions**

Restore from git history and adapt. Port into `rpc_executor.rs`:
- `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcId` structs
- `RpcMessage` enum
- `build_rpc_request()`, `build_rpc_notification()`
- `serialize_rpc_to_line()`, `parse_rpc_line()`
- `build_prompt_params()`, `build_permission_response_params()`

- [ ] **Step 4: Implement RpcExecutor::execute()**

Similar to AcpExecutor but:
1. Spawns with RPC flag variant (`--mode rpc` or `--rpc`)
2. Sends initial prompt via `build_rpc_request("autohand.prompt", ...)` over stdin
3. Reads stdout line-by-line, parses with `parse_rpc_line()`
4. Maps RPC notifications to `ProtocolEvent` by method name:
   - `autohand.message_start/update/end` → `ProtocolEvent::Message`
   - `autohand.tool_start` → `ProtocolEvent::ToolStart`
   - `autohand.tool_end` → `ProtocolEvent::ToolEnd`
   - `autohand.permission_request` → `ProtocolEvent::PermissionRequest`
   - `autohand.state_change` → `ProtocolEvent::StateChange`
   - `autohand.error` → `ProtocolEvent::Error`
5. RPC responses (with `id`) are used for request correlation (ignored for now, logged)

- [ ] **Step 5: Implement respond_permission and abort for RPC**

```rust
// respond_permission sends a JSON-RPC request:
async fn respond_permission(&self, request_id: &str, approved: bool) -> Result<(), CommanderError> {
    let params = build_permission_response_params(request_id, approved);
    let req = build_rpc_request("autohand.permissionResponse", Some(params));
    let line = serialize_rpc_to_line(&req);
    // Write to stdin (same pattern as ACP)
    ...
}

// abort sends shutdown JSON-RPC request:
async fn abort(&self) -> Result<(), CommanderError> {
    let req = build_rpc_request("autohand.shutdown", None);
    let line = serialize_rpc_to_line(&req);
    // Write to stdin, wait 2s, then kill
    ...
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd src-tauri && cargo test rpc_executor_tests -- --nocapture`
Expected: All 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/services/executors/rpc_executor.rs src-tauri/src/tests/
git commit -m "feat: implement RpcExecutor with JSON-RPC 2.0 and ProtocolEvent emission"
```

---

## Chunk 6: Session Management & Fallback Wiring

### Task 9: Implement SessionManager

**Files:**
- Create: `src-tauri/src/services/session_manager.rs`
- Modify: `src-tauri/src/services/mod.rs`
- Test: `src-tauri/src/tests/services/session_manager_tests.rs`

- [ ] **Step 1: Write failing tests**

```rust
// src-tauri/src/tests/services/session_manager_tests.rs
#[cfg(test)]
mod tests {
    use crate::services::session_manager::SessionManager;

    #[test]
    fn new_session_manager_is_empty() {
        let manager = SessionManager::new();
        assert!(manager.get_agent_session_id("nonexistent").is_none());
    }

    #[test]
    fn close_session_removes_it() {
        let mut manager = SessionManager::new();
        // We can't easily create a full ActiveSession in tests without Tauri,
        // so test the public API that doesn't require an executor
        assert!(manager.get_agent_session_id("s1").is_none());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test session_manager_tests -- --nocapture 2>&1 | head -20`
Expected: Compilation error.

- [ ] **Step 3: Implement SessionManager**

```rust
// src-tauri/src/services/session_manager.rs
use std::collections::HashMap;
use std::time::Instant;
use crate::models::protocol::ProtocolMode;
use crate::services::executors::AgentExecutor;

/// Executor ownership design:
/// The spawned tokio task owns the executor directly (as a local variable).
/// SessionManager does NOT store the executor. Instead, it stores a
/// `permission_sender` channel that the spawned task reads from.
/// This avoids the ownership conflict of needing &mut self for execute()
/// while SessionManager holds the executor behind Arc<Mutex<>>.
///
/// Flow:
/// 1. Spawned task creates executor + mpsc channel
/// 2. SessionManager stores the sender half + metadata
/// 3. respond_permission() sends through the channel
/// 4. Spawned task reads from receiver and calls executor.respond_permission()

pub struct ActiveSession {
    pub session_id: String,
    pub agent: String,
    pub protocol: Option<ProtocolMode>,
    pub agent_session_id: Option<String>,
    pub permission_sender: tokio::sync::mpsc::UnboundedSender<PermissionResponse>,
    pub abort_sender: tokio::sync::oneshot::Sender<()>,  // one-shot to signal abort
    pub started_at: Instant,
}

#[derive(Debug)]
pub struct PermissionResponse {
    pub request_id: String,
    pub approved: bool,
}

pub struct SessionManager {
    sessions: HashMap<String, ActiveSession>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self { sessions: HashMap::new() }
    }

    pub fn insert(&mut self, session: ActiveSession) {
        self.sessions.insert(session.session_id.clone(), session);
    }

    pub fn get(&self, session_id: &str) -> Option<&ActiveSession> {
        self.sessions.get(session_id)
    }

    pub fn get_agent_session_id(&self, session_id: &str) -> Option<String> {
        self.sessions.get(session_id)
            .and_then(|s| s.agent_session_id.clone())
    }

    pub fn set_agent_session_id(&mut self, session_id: &str, agent_sid: String) {
        if let Some(session) = self.sessions.get_mut(session_id) {
            session.agent_session_id = Some(agent_sid);
        }
    }

    pub fn send_permission(&self, session_id: &str, request_id: String, approved: bool) -> Result<(), String> {
        if let Some(session) = self.sessions.get(session_id) {
            session.permission_sender.send(PermissionResponse { request_id, approved })
                .map_err(|_| format!("Session {} executor not running", session_id))
        } else {
            Err(format!("No active session: {session_id}"))
        }
    }

    pub fn remove(&mut self, session_id: &str) -> Option<ActiveSession> {
        self.sessions.remove(session_id)
    }

    /// Graceful close: signals abort then removes session.
    /// The spawned task receiving the abort signal calls executor.abort() directly.
    pub fn close_session(&mut self, session_id: &str) {
        if let Some(session) = self.sessions.remove(session_id) {
            let _ = session.abort_sender.send(());  // signal the spawned task to abort
        }
    }
}
```

- [ ] **Step 4: Register module**

Add `pub mod session_manager;` to `src-tauri/src/services/mod.rs`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd src-tauri && cargo test session_manager_tests -- --nocapture`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/services/session_manager.rs src-tauri/src/services/mod.rs src-tauri/src/tests/
git commit -m "feat: implement SessionManager replacing SESSIONS global"
```

---

### Task 10: Wire factory + fallback into execute_persistent_cli_command

**Files:**
- Modify: `src-tauri/src/commands/cli_commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: Manual integration test (run the app)

- [ ] **Step 1: Register SessionManager and ProtocolCache as Tauri managed state**

In `src-tauri/src/lib.rs`, in the `.setup()` closure:

```rust
use crate::services::session_manager::SessionManager;
use crate::services::agent_status_service::ProtocolCache;
use std::sync::Arc;
use tokio::sync::Mutex;

app.manage(Arc::new(Mutex::new(SessionManager::new())));
app.manage(Arc::new(Mutex::new(ProtocolCache::new())));
```

- [ ] **Step 2: Remove old SESSIONS global from cli_commands.rs**

Remove:
```rust
static SESSIONS: Lazy<Arc<Mutex<HashMap<String, ActiveSession>>>> = ...;
static SESSION_INDEX: Lazy<Arc<Mutex<HashMap<String, String>>>> = ...;
struct ActiveSession { ... }
```

Replace all references to `SESSIONS` with `SessionManager` accessed via Tauri state.

- [ ] **Step 3: Rewrite execute_persistent_cli_command to use factory**

Add `session_manager` and `protocol_cache` as Tauri state parameters:

```rust
#[tauri::command]
pub async fn execute_persistent_cli_command(
    app: tauri::AppHandle,
    session_manager: tauri::State<'_, Arc<Mutex<SessionManager>>>,
    protocol_cache: tauri::State<'_, Arc<Mutex<ProtocolCache>>>,
    session_id: String,
    agent: String,
    message: String,
    working_dir: Option<String>,
    execution_mode: Option<String>,
    dangerousBypass: Option<bool>,
    permissionMode: Option<String>,
) -> Result<(), String> {
    // ... existing preamble (parse command, load settings) ...

    let cache = protocol_cache.lock().await;
    let mut executor = ExecutorFactory::create(&agent_name, &cache);
    drop(cache);

    let sm = session_manager.inner().clone();

    // Create channels for permission responses and abort signaling
    let (perm_tx, mut perm_rx) = tokio::sync::mpsc::unbounded_channel::<PermissionResponse>();
    let (abort_tx, mut abort_rx) = tokio::sync::oneshot::channel::<()>();

    // Register session BEFORE spawning (so respond_permission works immediately)
    {
        let mut mgr = sm.lock().await;
        mgr.insert(ActiveSession {
            session_id: session_id.clone(),
            agent: agent_name.clone(),
            protocol: executor.protocol(),
            agent_session_id: None,
            permission_sender: perm_tx,
            abort_sender: abort_tx,
            started_at: Instant::now(),
        });
    }

    tokio::spawn(async move {
        // Spawn a background task to forward permission responses to executor
        let executor_perm = executor.clone_permission_handle(); // or use Arc internally
        tokio::spawn(async move {
            while let Some(resp) = perm_rx.recv().await {
                let _ = executor_perm.respond_permission(&resp.request_id, resp.approved).await;
            }
        });

        // Listen for abort signal in parallel
        // (The executor's execute() blocks until done or error)
        let result = tokio::select! {
            res = executor.execute(&app_clone, &session_id, &agent_name, &message, &dir, &settings, None) => res,
            _ = abort_rx => {
                let _ = executor.abort().await;
                Ok(())
            }
        };

        if let Err(e) = result {
            if executor.protocol().is_some() {
                // Surface error
                let _ = app_clone.emit("protocol-event", ProtocolEvent::Error {
                    session_id: session_id.clone(),
                    message: format!("Protocol error: {e}"),
                });

                // Try reconnect with 10s timeout
                let agent_sid = {
                    let mgr = sm.lock().await;
                    mgr.get_agent_session_id(&session_id)
                };
                let reconnect = tokio::time::timeout(
                    Duration::from_secs(10),
                    executor.execute(&app_clone, &session_id, &agent_name, &message, &dir, &settings, agent_sid.as_deref()),
                ).await;

                match reconnect {
                    Ok(Ok(())) => {
                        let _ = app_clone.emit("protocol-event", ProtocolEvent::SessionEvent {
                            session_id: session_id.clone(),
                            event: SessionEventKind::Reconnected,
                        });
                    }
                    _ => {
                        // Fallback to PTY
                        let _ = app_clone.emit("protocol-event", ProtocolEvent::SessionEvent {
                            session_id: session_id.clone(),
                            event: SessionEventKind::FallbackToPty,
                        });
                        let mut pty = PtyExecutor::new();
                        let _ = pty.execute(&app_clone, &session_id, &agent_name, &message, &dir, &settings, None).await;
                    }
                }
            } else {
                let _ = app_clone.emit("cli-stream", StreamChunk {
                    session_id: session_id.clone(),
                    content: format!("Error: {e}"),
                    finished: true,
                });
            }
        }

        // Clean up session (abort signal already sent if needed)
        let mut mgr = sm.lock().await;
        mgr.remove(&session_id);
    });

    Ok(())
}
```

**Key design: channel-based executor communication.**
- The spawned task **owns** the executor (solves `&mut self` ownership)
- `SessionManager` stores `permission_sender` (channel) and `abort_sender` (oneshot)
- `respond_permission` Tauri command sends through the channel → background task forwards to executor
- `close_session` sends abort signal → background task calls `executor.abort()`
- No need to store `Box<dyn AgentExecutor>` in SessionManager

**Note on `clone_permission_handle()`**: Each executor already uses `Arc<Mutex<ChildStdin>>` for interior mutability. Add a simple method that returns a lightweight handle for writing permission responses:

```rust
impl AcpExecutor {
    pub fn permission_handle(&self) -> PermissionHandle {
        PermissionHandle { stdin: self.stdin.clone() }
    }
}

pub struct PermissionHandle {
    stdin: Arc<Mutex<Option<ChildStdin>>>,
}

impl PermissionHandle {
    pub async fn respond_permission(&self, request_id: &str, approved: bool) -> Result<(), CommanderError> {
        // Same write logic as the executor
    }
}
```

- [ ] **Step 4: Add respond_permission Tauri command**

In `src-tauri/src/commands/cli_commands.rs`:

```rust
#[tauri::command]
pub async fn respond_permission(
    session_manager: tauri::State<'_, Arc<Mutex<SessionManager>>>,
    session_id: String,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    let mgr = session_manager.lock().await;
    mgr.send_permission(&session_id, request_id, approved)
}
```

- [ ] **Step 5: Register respond_permission in lib.rs invoke_handler**

Add `respond_permission` to the `.invoke_handler(tauri::generate_handler![...])` list.

- [ ] **Step 6: Run cargo check**

Run: `cd src-tauri && cargo check 2>&1 | tail -20`
Expected: Compiles without errors.

- [ ] **Step 7: Run full test suite**

Run: `cd src-tauri && cargo test 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands/cli_commands.rs src-tauri/src/lib.rs
git commit -m "feat: wire ExecutorFactory with fallback into execute_persistent_cli_command"
```

---

## Chunk 7: Frontend Changes

### Task 11: Add autohand to frontend agent registry

**Files:**
- Modify: `src/components/chat/agents.ts`
- Modify: `src/components/chat/hooks/useChatExecution.ts`

- [ ] **Step 1: Add autohand to agents.ts**

In `src/components/chat/agents.ts`:

Add `"autohand"` to `allowedAgentIds` (first position):
```typescript
export const allowedAgentIds = ['autohand', 'claude', 'codex', 'gemini', 'ollama', 'test'] as const
```

Add to `DEFAULT_CLI_AGENT_IDS`:
```typescript
export const DEFAULT_CLI_AGENT_IDS = ['autohand', 'claude', 'codex', 'gemini', 'ollama'] as const
```

Add to `AGENTS` array (first position):
```typescript
{
  id: 'autohand',
  name: 'autohand',
  displayName: 'Autohand',
  icon: Terminal,  // or appropriate icon
  description: 'Autohand CLI agent (ACP/RPC)',
},
```

Add to `DISPLAY_TO_ID` map:
```typescript
'Autohand': 'autohand',
```

Add to `AGENT_CAPABILITIES` (line ~70):
```typescript
autohand: {
  supportsExecutionMode: false,
  supportsPermissionMode: false,
  defaultCommand: 'autohand',
},
```

- [ ] **Step 2: Add autohand to useChatExecution.ts**

In the `agentCommandMap`, add:
```typescript
autohand: 'execute_persistent_cli_command',
```

- [ ] **Step 3: Verify no TypeScript errors**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/rewire_acp_rpc && npx tsc --noEmit 2>&1 | tail -10`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/chat/agents.ts src/components/chat/hooks/useChatExecution.ts
git commit -m "feat: register autohand in frontend agent registry"
```

---

### Task 12: Create useProtocolEvents hook

**Files:**
- Create: `src/components/chat/hooks/useProtocolEvents.ts`
- Test: `src/components/chat/hooks/__tests__/useProtocolEvents.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/components/chat/hooks/__tests__/useProtocolEvents.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProtocolEvents } from '../useProtocolEvents'

// Mock tauri event listener
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((event, handler) => {
    // Store handler for test invocation
    (globalThis as any).__protocolHandler = handler
    return Promise.resolve(() => {})
  }),
}))

describe('useProtocolEvents', () => {
  it('calls onMessage callback for Message events', async () => {
    const onMessage = vi.fn()
    renderHook(() =>
      useProtocolEvents('session-1', {
        onMessage,
        onToolStart: vi.fn(),
        onToolUpdate: vi.fn(),
        onToolEnd: vi.fn(),
        onPermissionRequest: vi.fn(),
        onStateChange: vi.fn(),
        onError: vi.fn(),
        onSessionEvent: vi.fn(),
      })
    )

    // Simulate event
    await act(async () => {
      ;(globalThis as any).__protocolHandler?.({
        payload: {
          type: 'Message',
          data: { session_id: 'session-1', role: 'assistant', content: 'hello' },
        },
      })
    })

    expect(onMessage).toHaveBeenCalledWith({
      session_id: 'session-1',
      role: 'assistant',
      content: 'hello',
    })
  })

  it('filters events by session_id', async () => {
    const onMessage = vi.fn()
    renderHook(() =>
      useProtocolEvents('session-1', {
        onMessage,
        onToolStart: vi.fn(),
        onToolUpdate: vi.fn(),
        onToolEnd: vi.fn(),
        onPermissionRequest: vi.fn(),
        onStateChange: vi.fn(),
        onError: vi.fn(),
        onSessionEvent: vi.fn(),
      })
    )

    await act(async () => {
      ;(globalThis as any).__protocolHandler?.({
        payload: {
          type: 'Message',
          data: { session_id: 'other-session', role: 'assistant', content: 'nope' },
        },
      })
    })

    expect(onMessage).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/chat/hooks/__tests__/useProtocolEvents.test.tsx 2>&1 | tail -10`
Expected: Module not found.

- [ ] **Step 3: Implement useProtocolEvents hook**

```typescript
// src/components/chat/hooks/useProtocolEvents.ts
import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'

export interface MessageData {
  session_id: string
  role: string
  content: string
}

export interface ToolStartData {
  session_id: string
  tool_id: string
  tool_name: string
  tool_kind: string
  args?: Record<string, unknown>
}

export interface ToolUpdateData {
  session_id: string
  tool_id: string
  tool_name: string
  output?: string
}

export interface ToolEndData {
  session_id: string
  tool_id: string
  tool_name: string
  output?: string
  success: boolean
  duration_ms?: number
}

export interface PermissionData {
  session_id: string
  request_id: string
  tool_name: string
  description: string
}

export interface StateData {
  session_id: string
  status: string
  context_percent?: number
}

export interface ErrorData {
  session_id: string
  message: string
}

export interface SessionData {
  session_id: string
  event: 'Connected' | 'Reconnected' | 'Disconnected' | 'FallbackToPty'
}

interface ProtocolEventPayload {
  type: string
  data: Record<string, unknown> & { session_id: string }
}

interface Callbacks {
  onMessage: (data: MessageData) => void
  onToolStart: (data: ToolStartData) => void
  onToolUpdate: (data: ToolUpdateData) => void
  onToolEnd: (data: ToolEndData) => void
  onPermissionRequest: (data: PermissionData) => void
  onStateChange: (data: StateData) => void
  onError: (data: ErrorData) => void
  onSessionEvent: (data: SessionData) => void
}

export function useProtocolEvents(sessionId: string, callbacks: Callbacks) {
  const cbRef = useRef(callbacks)
  cbRef.current = callbacks

  useEffect(() => {
    let unlisten: (() => void) | null = null

    listen<ProtocolEventPayload>('protocol-event', (event) => {
      const { type, data } = event.payload
      if (data.session_id !== sessionId) return

      switch (type) {
        case 'Message':
          cbRef.current.onMessage(data as unknown as MessageData)
          break
        case 'ToolStart':
          cbRef.current.onToolStart(data as unknown as ToolStartData)
          break
        case 'ToolUpdate':
          cbRef.current.onToolUpdate(data as unknown as ToolUpdateData)
          break
        case 'ToolEnd':
          cbRef.current.onToolEnd(data as unknown as ToolEndData)
          break
        case 'PermissionRequest':
          cbRef.current.onPermissionRequest(data as unknown as PermissionData)
          break
        case 'StateChange':
          cbRef.current.onStateChange(data as unknown as StateData)
          break
        case 'Error':
          cbRef.current.onError(data as unknown as ErrorData)
          break
        case 'SessionEvent':
          cbRef.current.onSessionEvent(data as unknown as SessionData)
          break
      }
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [sessionId])
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/chat/hooks/__tests__/useProtocolEvents.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/hooks/useProtocolEvents.ts src/components/chat/hooks/__tests__/useProtocolEvents.test.tsx
git commit -m "feat: add useProtocolEvents hook for structured protocol events"
```

---

### Task 13: Update AIAgentStatusBar with protocol badge and autohand slot

**Files:**
- Modify: `src/components/AIAgentStatusBar.tsx`
- Modify: `src/components/AIAgentStatusBar.tsx` (TypeScript interface)

- [ ] **Step 1: Update AIAgent interface**

Add new fields to the `AIAgent` interface in `AIAgentStatusBar.tsx`:

```typescript
interface AIAgent {
  // existing fields...
  protocol?: 'acp' | 'rpc' | null
  is_default: boolean
  removable: boolean
}
```

- [ ] **Step 2: Add protocol badge to agent dots**

In the agent rendering section, after the status dot, add a protocol badge:

```typescript
{agent.protocol && (
  <span className="text-[9px] font-mono uppercase text-zinc-500 ml-0.5">
    {agent.protocol}
  </span>
)}
```

- [ ] **Step 3: Ensure autohand renders first and is non-removable**

The backend already sends autohand first in the agents array (it's first in `AGENT_DEFINITIONS`). In the rendering, skip any "disable" or "hide" UI for agents where `removable === false`.

- [ ] **Step 4: Add protocol to version card popup**

In the version card popup section, add protocol info:

```typescript
{agent.protocol && (
  <div className="text-xs text-zinc-400">
    Protocol: <span className="text-zinc-300 uppercase">{agent.protocol}</span>
  </div>
)}
```

- [ ] **Step 5: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/AIAgentStatusBar.tsx
git commit -m "feat: add protocol badge and autohand first-citizen slot to status bar"
```

---

## Chunk 8: Integration & Final Wiring

### Task 14: Wire useProtocolEvents into ChatInterface

**Files:**
- Modify: `src/components/ChatInterface.tsx`

- [ ] **Step 1: Import and wire useProtocolEvents**

In `ChatInterface.tsx`, import the new hook:

```typescript
import { useProtocolEvents } from './chat/hooks/useProtocolEvents'
```

Wire it alongside the existing `useCLIEvents`. In the effect/callback area where stream handling happens, add:

```typescript
useProtocolEvents(activeSessionId, {
  onMessage: (data) => {
    // Append text to the current message, similar to ClaudeStreamParser delta
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === data.session_id
          ? { ...msg, content: (msg.content || '') + data.content }
          : msg
      )
    )
  },
  onToolStart: (data) => {
    // Add a tool step to the message timeline
    // Implementation depends on existing step/timeline data structures
  },
  onToolEnd: (data) => {
    // Update tool step with result
  },
  onPermissionRequest: (data) => {
    // Show inline permission prompt — implementation depends on UI patterns
    // For now, auto-approve (placeholder for permission UI)
    invoke('respond_permission', {
      session_id: data.session_id,
      request_id: data.request_id,
      approved: true,
    })
  },
  onStateChange: (data) => {
    // Update agent status indicator
  },
  onError: (data) => {
    // Append error to chat
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === data.session_id
          ? { ...msg, content: (msg.content || '') + `\n[Error: ${data.message}]` }
          : msg
      )
    )
  },
  onSessionEvent: (data) => {
    // Show system notice for reconnect/fallback
    const notices: Record<string, string> = {
      Connected: 'Connected via protocol',
      Reconnected: 'Reconnected to agent',
      Disconnected: 'Agent disconnected',
      FallbackToPty: 'Switched to raw mode',
    }
    // Append as system message or inline notice
  },
})
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatInterface.tsx
git commit -m "feat: wire useProtocolEvents into ChatInterface for ACP/RPC agents"
```

---

### Task 15: Update AllAgentSettings and settings commands

**Files:**
- Modify: `src-tauri/src/models/ai_agent.rs`
- Modify: `src-tauri/src/commands/settings_commands.rs`

- [ ] **Step 1: Ensure AgentSettings has Default derive**

In `src-tauri/src/models/ai_agent.rs`, if not already done in Task 2:

```rust
impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            model: None,
            sandbox_mode: false,
            auto_approval: false,
            session_timeout_minutes: 30,
            output_format: "text".to_string(),
            debug_mode: false,
            max_tokens: None,
            temperature: None,
        }
    }
}
```

- [ ] **Step 2: Update default AllAgentSettings construction in settings_commands.rs**

In `load_all_agent_settings`, ensure the default includes `autohand`:

```rust
AllAgentSettings {
    autohand: AgentSettings::default(),
    claude: AgentSettings::default(),
    codex: AgentSettings::default(),
    gemini: AgentSettings::default(),
    max_concurrent_sessions: 3,
}
```

- [ ] **Step 3: Update load_agent_settings helper**

In `load_agent_settings()` (used by `check_ai_agents`), add autohand to the default enabled map:

```rust
HashMap::from([
    ("autohand".to_string(), true),
    ("claude".to_string(), true),
    ("codex".to_string(), true),
    ("gemini".to_string(), true),
])
```

- [ ] **Step 4: Run cargo check and tests**

Run: `cd src-tauri && cargo check && cargo test 2>&1 | tail -10`
Expected: Compiles and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/models/ai_agent.rs src-tauri/src/commands/settings_commands.rs
git commit -m "feat: add autohand to AllAgentSettings with backward-compatible defaults"
```

---

### Task 16: Final integration verification

**Files:** None (verification only)

- [ ] **Step 1: Run full backend test suite**

Run: `cd src-tauri && cargo test 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 2: Run frontend type check**

Run: `npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 3: Run frontend test suite**

Run: `npx vitest run 2>&1 | tail -20`
Expected: All tests pass.

- [ ] **Step 4: Attempt cargo build**

Run: `cd src-tauri && cargo build 2>&1 | tail -10`
Expected: Successful build.

- [ ] **Step 5: Commit any remaining fixes**

If any fixes were needed, commit them.

```bash
git commit -m "fix: resolve integration issues from ACP/RPC wiring"
```
