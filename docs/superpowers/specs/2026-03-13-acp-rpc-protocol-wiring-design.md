# ACP/RPC Protocol Wiring Design

**Date:** 2026-03-13
**Branch:** `rewire_acp_rpc`
**Status:** Approved

## Purpose

Wire ACP (Agentic Communication Protocol) and RPC (JSON-RPC 2.0) support into Commander's CLI execution pipeline so that any coding CLI agent that speaks ACP or RPC gets structured, typed communication instead of raw PTY streaming. Add `autohand` as the default, non-removable first-citizen agent. Fall back to PTY when protocol connection fails.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Protocol detection | Probe once at startup, cache by (agent, version) | Keeps 10-second polling loop light |
| Event architecture | New `protocol-event` channel alongside existing `cli-stream` | Additive, doesn't break existing agents |
| Execution model | Trait-based executors (`AgentExecutor`) with factory | Clean separation, testable, extensible |
| Mid-session failure | Surface error, try reconnect with session ID, then PTY fallback | Honest UX, preserves context when possible |
| Session resumption | Pass `--resume <session_id>` on reconnect | Agent-side context restoration, zero replay |
| Default protocol for autohand | Let autohand decide (probe `--help`) | No hardcoded preference for ACP vs RPC |
| autohand status | Default agent, non-removable, always first in status bar | First-citizen treatment |

---

## Section 1: Agent Registration & Protocol Probe

### Agent Definitions

`autohand` is the default, non-removable first-citizen agent. Existing three remain as optional built-ins.

```rust
const AGENT_DEFINITIONS: &[AgentDefinition] = &[
    AgentDefinition {
        id: "autohand",
        command: "autohand",
        display_name: "Autohand",
        package: None,
        removable: false,
        default_protocol: None,           // let autohand decide
    },
    AgentDefinition {
        id: "claude",
        command: "claude",
        display_name: "Claude Code CLI",
        package: Some("@anthropic-ai/claude-code"),
        removable: true,
        default_protocol: None,
    },
    AgentDefinition {
        id: "codex",
        command: "codex",
        display_name: "Codex",
        package: Some("@openai/codex"),
        removable: true,
        default_protocol: None,
    },
    AgentDefinition {
        id: "gemini",
        command: "gemini",
        display_name: "Gemini",
        package: Some("@google/gemini-cli"),
        removable: true,
        default_protocol: None,
    },
];
```

### Protocol Probe

Extended on the existing `AgentProbe` trait:

```rust
#[async_trait]
pub trait AgentProbe: Send + Sync {
    async fn locate(&self, command: &str) -> Result<bool, String>;
    async fn command_version(&self, command: &str) -> Result<Option<String>, String>;
    async fn latest_package_version(&self, package: &str) -> Result<Option<String>, String>;
    async fn installed_package_version(&self, package: &str) -> Result<Option<String>, String>;

    // new
    async fn detect_protocol(&self, command: &str) -> Result<Option<ProtocolMode>, String>;
}
```

`detect_protocol()` runs `<command> --help` and parses for `--acp`, `--rpc`, `--mode acp`, `--mode rpc` keywords. Returns `Some(Acp)`, `Some(Rpc)`, or `None` (PTY only).

Accepted flags from any CLI: `--acp`, `--rpc`, `--mode acp`, `--mode rpc`.

### Protocol Cache

```rust
struct ProtocolCache {
    entries: HashMap<String, ProtocolCacheEntry>,
}

struct ProtocolCacheEntry {
    protocol: Option<ProtocolMode>,
    agent_version: String,
}
```

- Populated once at startup during the initial `check_ai_agents()` call.
- The 10-second polling loop only re-probes protocol if `command_version()` returns a different version than cached.
- Cache lives in `AgentStatusService`, shared via `Arc<Mutex<>>`.

### AIAgent Model Extension

```rust
pub struct AIAgent {
    pub name: String,
    pub command: String,
    pub display_name: String,
    pub available: bool,
    pub enabled: bool,
    pub error_message: Option<String>,
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub upgrade_available: bool,
    // new
    pub protocol: Option<ProtocolMode>,
    pub is_default: bool,
    pub removable: bool,
}
```

---

## Section 2: Executor Trait & Implementations

### AgentExecutor Trait

```rust
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
    ) -> Result<(), CommanderError>;

    async fn abort(&self) -> Result<(), CommanderError>;

    fn is_alive(&self) -> bool;

    fn protocol(&self) -> Option<ProtocolMode>;
}
```

### Three Implementations

**`PtyExecutor`** — extracted from current `execute_persistent_cli_command()` lines 858-1107:
- Spawns via PTY (fallback to pipes).
- Emits `cli-stream` events with `StreamChunk` (unchanged).
- Handles `CodexStreamAccumulator` for Codex, `BufReader` for others.
- `protocol()` returns `None`.

**`AcpExecutor`** — restored from git commit `5d7f243` (`acp_client.rs`):
- Spawns agent with `--acp` or `--mode acp`.
- Reads ndJSON lines from stdout.
- Classifies via `classify_acp_message()` into typed variants.
- Emits `protocol-event` events with `ProtocolEvent`.
- `protocol()` returns `Some(Acp)`.

**`RpcExecutor`** — restored from git commit `3d6981e` (`rpc_client.rs`):
- Spawns agent with `--rpc` or `--mode rpc`.
- Sends JSON-RPC 2.0 requests over stdin, reads responses/notifications from stdout.
- Maps notifications to `ProtocolEvent`.
- `protocol()` returns `Some(Rpc)`.

### ExecutorFactory

```rust
pub struct ExecutorFactory;

impl ExecutorFactory {
    pub fn create(
        agent: &str,
        protocol_cache: &ProtocolCache,
    ) -> Box<dyn AgentExecutor> {
        match protocol_cache.get(agent) {
            Some(ProtocolMode::Acp) => Box::new(AcpExecutor::new()),
            Some(ProtocolMode::Rpc) => Box::new(RpcExecutor::new()),
            None => Box::new(PtyExecutor::new()),
        }
    }
}
```

### Fallback Flow

```rust
let mut executor = ExecutorFactory::create(&agent, &protocol_cache);
let result = executor.execute(&app, &session_id, &agent, &message, &dir, &settings).await;

if let Err(e) = result {
    if executor.protocol().is_some() {
        // Surface error
        emit_error(&app, &session_id, &format!("Protocol error: {e}"));

        // Try reconnect with session ID
        let reconnect = executor.execute(&app, &session_id, &agent, &message, &dir, &settings).await;

        if reconnect.is_err() {
            // Final fallback to PTY
            emit_notice(&app, &session_id, "Falling back to raw mode");
            let mut pty = PtyExecutor::new();
            pty.execute(&app, &session_id, &agent, &message, &dir, &settings).await?;
        }
    } else {
        return Err(e);
    }
}
```

### File Organization

```
src-tauri/src/services/
├── executors/
│   ├── mod.rs              // AgentExecutor trait + ExecutorFactory
│   ├── pty_executor.rs     // extracted from cli_commands.rs
│   ├── acp_executor.rs     // restored from git + adapted
│   └── rpc_executor.rs     // restored from git + adapted
├── agent_status_service.rs // + protocol probe + cache
├── cli_output_service.rs   // CodexStreamAccumulator (unchanged)
└── cli_command_builder.rs  // arg builders (unchanged)
```

---

## Section 3: Protocol Events & Frontend Mapping

### ProtocolEvent Type (Backend)

Emitted on Tauri channel `protocol-event`, distinct from `cli-stream`:

```rust
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
        tool_name: String,
        tool_kind: ToolKind,
        args: Option<Value>,
    },
    ToolUpdate {
        session_id: String,
        tool_name: String,
        output: Option<String>,
    },
    ToolEnd {
        session_id: String,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionEventKind {
    Connected,
    Reconnected,
    Disconnected,
    FallbackToPty,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    Read, Write, Edit, Delete, Execute, Think, Fetch, Search, Other,
}
```

### Frontend: useProtocolEvents Hook

```typescript
// src/components/chat/hooks/useProtocolEvents.ts

export function useProtocolEvents(
  sessionId: string,
  callbacks: {
    onMessage: (data: MessageData) => void
    onToolStart: (data: ToolStartData) => void
    onToolUpdate: (data: ToolUpdateData) => void
    onToolEnd: (data: ToolEndData) => void
    onPermissionRequest: (data: PermissionData) => void
    onStateChange: (data: StateData) => void
    onError: (data: ErrorData) => void
    onSessionEvent: (data: SessionData) => void
  }
)
```

### ChatInterface Integration

Both hooks are active simultaneously. For a given session, events arrive on one channel or the other depending on which executor is running:

- `cli-stream` → `useCLIEvents` → existing parser paths (Claude JSON, Codex JSON, raw)
- `protocol-event` → `useProtocolEvents` → typed callbacks (message append, tool cards, permission dialogs, status indicators)

### Permission Response

New Tauri command for the frontend to approve/deny permission requests:

```rust
#[tauri::command]
pub async fn respond_permission(
    session_id: String,
    request_id: String,
    approved: bool,
) -> Result<(), String>
```

Routes to the active executor's stdin (ACP ndJSON line or RPC request).

### Event Flow

```
ACP/RPC Agent               Commander Backend              Frontend
stdout ndJSON/RPC  ───►  AcpExecutor/RpcExecutor
                              ├─ classify message
                              ├─ map to ProtocolEvent
                              └─ emit("protocol-event") ──► useProtocolEvents
                                                              ├─ onMessage → chat text
                                                              ├─ onToolStart → tool card
                                                              ├─ onToolEnd → card update
                                                              ├─ onPermissionRequest → dialog
                                                              └─ onStateChange → status

PTY Agent (fallback)         Commander Backend              Frontend
raw stdout  ─────────►  PtyExecutor
                              └─ emit("cli-stream") ──────► useCLIEvents
                                                              └─ existing parsers
```

---

## Section 4: Status Bar Updates

### AIAgentStatusBar Changes

- **Autohand gets a permanent, non-removable slot** — always first in the row.
- **Protocol badge** — small text badge next to each agent dot: `ACP`, `RPC`, or no badge (PTY only).
- **Version card popup extension** — clicking an agent also shows:
  - Protocol: `ACP` / `RPC` / `None`
  - Session status: `Connected` / `Idle` / `Disconnected`

### Updated TypeScript Interface

```typescript
interface AIAgent {
  name: string
  command: string
  display_name: string
  available: boolean
  enabled: boolean
  error_message?: string
  installed_version?: string | null
  latest_version?: string | null
  upgrade_available?: boolean
  // new
  protocol?: 'acp' | 'rpc' | null
  is_default: boolean
  removable: boolean
}
```

No changes to the 10-second polling loop logic. `AgentStatusService::check_agents()` populates the `protocol` field from the cache.

---

## Section 5: Session Management & Error Handling

### Session Tracking

```rust
pub struct SessionManager {
    sessions: HashMap<String, ActiveSession>,
}

pub struct ActiveSession {
    pub session_id: String,
    pub agent: String,
    pub protocol: Option<ProtocolMode>,
    pub executor: Box<dyn AgentExecutor>,
    pub agent_session_id: Option<String>,   // for --resume
    pub started_at: Instant,
}
```

- Created when `execute_persistent_cli_command()` spawns an executor.
- `agent_session_id` captured from the agent's first response (ACP `state_change` or RPC `agent_start`).
- Destroyed when session ends or user closes the chat.

### Reconnection Flow

```
ACP/RPC stream breaks
  │
  ├─ Emit ProtocolEvent::Error ("Connection lost")
  │
  ├─ Attempt reconnect:
  │   ├─ Has agent_session_id? → spawn with --resume <id>
  │   └─ No agent_session_id? → spawn fresh
  │
  ├─ Reconnect succeeds?
  │   ├─ Yes → Emit SessionEvent::Reconnected, continue
  │   └─ No  → Emit SessionEvent::FallbackToPty
  │            ├─ Replace executor with PtyExecutor
  │            └─ Re-send the last user message via PTY
  │
  └─ Update ActiveSession with new executor
```

### Error Classification

```rust
pub enum ProtocolError {
    /// Process exited — trigger reconnect
    ProcessDied(i32),
    /// Malformed message — skip, keep streaming
    ParseError(String),
    /// Agent rejected request — surface, no fallback
    AgentError { code: i32, message: String },
    /// Stdin write failed — process dead, trigger reconnect
    WriteFailed(String),
}
```

- `ProcessDied` / `WriteFailed` → reconnect flow
- `ParseError` → skip bad line, emit warning, keep streaming
- `AgentError` → show in chat, no fallback

### Graceful Shutdown

```rust
// SessionManager::close_session()
if let Some(session) = self.sessions.remove(&session_id) {
    if session.executor.is_alive() {
        let _ = session.executor.abort().await;
    }
}
```

ACP sends `{"type":"command","data":{"command":"shutdown"}}`. RPC sends `shutdown()` JSON-RPC request. If no response within 2 seconds, SIGKILL.
