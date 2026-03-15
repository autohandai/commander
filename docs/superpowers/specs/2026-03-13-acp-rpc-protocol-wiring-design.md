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
| Concurrency model | Executors run inside `tokio::spawn` (fire-and-forget), errors emitted as events | Matches existing pattern in `execute_persistent_cli_command()` |
| Session state | New `SessionManager` replaces existing `SESSIONS` global entirely | Single source of truth, no dual ownership |
| Executor spawn contract | `execute()` always spawns a fresh process; callers may call it again after failure | Stateless between calls, safe for reconnect |
| autohand runtime | External CLI binary, must be on PATH; Commander does not bundle it | Same model as Claude/Codex/Gemini |
| Reconnect timeout | 10 seconds max for reconnect attempt before PTY fallback | Prevents indefinite hangs |
| Probe timeout | 3 seconds max for `--help` protocol detection | Keeps startup fast |

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

`detect_protocol()` runs `<command> --help` (capturing both stdout and stderr) and parses for `--acp`, `--rpc`, `--mode acp`, `--mode rpc` keywords. Returns `Some(Acp)`, `Some(Rpc)`, or `None` (PTY only).

Accepted flags from any CLI: `--acp`, `--rpc`, `--mode acp`, `--mode rpc`.

Additionally, the `ProtocolCacheEntry` stores the detected flag variant (e.g., `"--acp"` vs `"--mode acp"`) so executors know which flag to pass at spawn time. If `--help` fails or times out (3-second limit), the agent is treated as PTY-only.

Settings override: users can manually configure a protocol per agent in settings, which takes precedence over the probe result.

### Protocol Cache

```rust
struct ProtocolCache {
    entries: HashMap<String, ProtocolCacheEntry>,
}

struct ProtocolCacheEntry {
    protocol: Option<ProtocolMode>,
    agent_version: String,
    flag_variant: Option<String>,   // e.g., "--acp", "--mode acp", "--rpc", "--mode rpc"
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

### Concurrency Model

Executors run inside `tokio::spawn`, matching the existing fire-and-forget pattern. The Tauri command returns `Ok(())` immediately; all results and errors are communicated via event emissions. This is unchanged from how `execute_persistent_cli_command()` works today.

### Executor Spawn Contract

Each call to `execute()` spawns a **fresh child process**. Executors hold no state between calls — they are effectively stateless factories for process lifecycles. This means calling `execute()` again after a failure is safe and triggers a new process spawn (with `--resume <session_id>` if available).

### AgentExecutor Trait

```rust
#[async_trait]
pub trait AgentExecutor: Send + Sync {
    /// Spawn a fresh process and stream events. Each call creates a new child process.
    async fn execute(
        &mut self,
        app: &tauri::AppHandle,
        session_id: &str,
        agent: &str,
        message: &str,
        working_dir: &str,
        settings: &AgentSettings,
        resume_session_id: Option<&str>,    // for --resume on reconnect
    ) -> Result<(), CommanderError>;

    async fn abort(&self) -> Result<(), CommanderError>;

    /// Write a permission response to the agent's stdin
    async fn respond_permission(&self, request_id: &str, approved: bool) -> Result<(), CommanderError>;

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

Runs inside `tokio::spawn` (fire-and-forget). Errors are emitted as events, not returned.

```rust
let mut executor = ExecutorFactory::create(&agent, &protocol_cache);
let result = executor.execute(&app, &session_id, &agent, &message, &dir, &settings, None).await;

if let Err(e) = result {
    if executor.protocol().is_some() {
        // Surface error
        emit_error(&app, &session_id, &format!("Protocol error: {e}"));

        // Try reconnect with session ID (10-second timeout)
        let agent_sid = session_manager.get_agent_session_id(&session_id);
        let reconnect = tokio::time::timeout(
            Duration::from_secs(10),
            executor.execute(&app, &session_id, &agent, &message, &dir, &settings, agent_sid.as_deref()),
        ).await;

        if reconnect.is_err() {
            // Final fallback to PTY
            emit_notice(&app, &session_id, "Falling back to raw mode");
            let mut pty = PtyExecutor::new();
            pty.execute(&app, &session_id, &agent, &message, &dir, &settings, None).await?;
            // Update session with new executor
            session_manager.replace_executor(&session_id, Box::new(pty));
        }
    } else {
        emit_error(&app, &session_id, &format!("Execution error: {e}"));
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
        tool_id: String,            // unique ID for correlating Start/Update/End
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

`SessionManager` **fully replaces** the existing `static SESSIONS: Lazy<Arc<Mutex<HashMap<...>>>>` global in `cli_commands.rs`. The old `ActiveSession` struct (which held `process: Arc<Mutex<Option<Child>>>` and `stdin_sender`) is superseded — the executor now owns the child process internally.

`SessionManager` is registered as Tauri managed state (`app.manage(Arc::new(Mutex::new(SessionManager::new())))`) so that all Tauri commands (including `respond_permission`) can access it via `State<Arc<Mutex<SessionManager>>>`.

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

impl SessionManager {
    pub fn get_agent_session_id(&self, session_id: &str) -> Option<String>;
    pub fn replace_executor(&mut self, session_id: &str, executor: Box<dyn AgentExecutor>);
    pub fn close_session(&mut self, session_id: &str);
}
```

- Created when `execute_persistent_cli_command()` spawns an executor.
- `agent_session_id` captured from the agent's first response (ACP `state_change` or RPC `agent_start`).
- Destroyed when session ends or user closes the chat.

### Permission Response Routing

The `respond_permission` Tauri command accesses `SessionManager` via Tauri managed state:

```rust
#[tauri::command]
pub async fn respond_permission(
    session_manager: State<'_, Arc<Mutex<SessionManager>>>,
    session_id: String,
    request_id: String,
    approved: bool,
) -> Result<(), String> {
    let manager = session_manager.lock().await;
    if let Some(session) = manager.sessions.get(&session_id) {
        session.executor.respond_permission(&request_id, approved).await
            .map_err(|e| e.to_string())
    } else {
        Err(format!("No active session: {session_id}"))
    }
}
```

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

---

## Section 6: Integration Points

### Autohand Runtime Identity

`autohand` is an **external CLI binary** that must be installed on the user's system and present in PATH. Commander does not bundle it. If `which autohand` fails, it shows as "unavailable" in the status bar (red dot) with an installation hint — same behavior as Claude/Codex/Gemini today.

### AllAgentSettings Update

The existing `AllAgentSettings` struct adds an `autohand` field:

```rust
pub struct AllAgentSettings {
    pub autohand: AgentSettings,    // new — always present
    pub claude: AgentSettings,
    pub codex: AgentSettings,
    pub gemini: AgentSettings,
    pub max_concurrent_sessions: usize,
}
```

### Frontend Agent Registration

The following frontend files must be updated to include `autohand`:

- `src/components/chat/agents.ts`:
  - Add `"autohand"` to `allowedAgentIds`
  - Add entry to `AGENTS` array, `DISPLAY_TO_ID`, and `AGENT_CAPABILITIES`
- `src/components/chat/hooks/useChatExecution.ts`:
  - Add `autohand` to `agentCommandMap` pointing to `execute_persistent_cli_command`
- `src/components/AIAgentStatusBar.tsx`:
  - Render autohand first, with non-removable styling
  - Add protocol badge rendering
- `src/components/ChatInterface.tsx`:
  - Wire `useProtocolEvents` alongside existing `useCLIEvents`

### CommanderError Extension

Add a `Protocol` variant to the existing `CommanderError` enum. Use a struct variant with named fields to match the existing enum style (`Git { operation, path, message }`, `Command { command, exit_code, message }`):

```rust
pub enum CommanderError {
    // existing variants...
    // new — flattened struct variant, consistent with existing style
    Protocol { kind: String, code: Option<i32>, message: String },
}
```

The `kind` field maps to the `ProtocolError` variant name (e.g., `"process_died"`, `"parse_error"`, `"timeout"`). This avoids a nested enum and keeps the serde shape (`#[serde(tag = "type", content = "details")]`) consistent.

Internal `ProtocolError` enum is used within executors only, and converted to `CommanderError::Protocol { .. }` at the boundary:

```rust
pub enum ProtocolError {
    ProcessDied(i32),
    ParseError(String),
    AgentError { code: i32, message: String },
    WriteFailed(String),
    Timeout(String),
}

impl From<ProtocolError> for CommanderError {
    fn from(e: ProtocolError) -> Self {
        match e {
            ProtocolError::ProcessDied(code) =>
                CommanderError::Protocol { kind: "process_died".into(), code: Some(code), message: format!("Process exited with code {code}") },
            ProtocolError::Timeout(msg) =>
                CommanderError::Protocol { kind: "timeout".into(), code: None, message: msg },
            // ... etc
        }
    }
}
```

### AllAgentSettings Backward Compatibility

Existing persisted stores (`all-agent-settings.json`) won't have an `autohand` key. The `autohand` field uses `#[serde(default)]` so deserialization of old data succeeds with default settings:

```rust
pub struct AllAgentSettings {
    #[serde(default)]
    pub autohand: AgentSettings,
    pub claude: AgentSettings,
    pub codex: AgentSettings,
    pub gemini: AgentSettings,
    pub max_concurrent_sessions: usize,
}
```

### Ollama Agent

`ollama` is retained as-is in the frontend (`agents.ts`, `useChatExecution.ts`). It is not added to `AGENT_DEFINITIONS` — it remains a frontend-only agent with its own dedicated Tauri command (`execute_ollama_command`). It does not participate in protocol probing. This is unchanged from today.

### ExecutorFactory Flag Passing

The factory passes the detected `flag_variant` to the executor constructor:

```rust
impl ExecutorFactory {
    pub fn create(
        agent: &str,
        protocol_cache: &ProtocolCache,
    ) -> Box<dyn AgentExecutor> {
        let entry = protocol_cache.get(agent);
        match entry.map(|e| &e.protocol) {
            Some(Some(ProtocolMode::Acp)) => Box::new(AcpExecutor::new(entry.unwrap().flag_variant.clone())),
            Some(Some(ProtocolMode::Rpc)) => Box::new(RpcExecutor::new(entry.unwrap().flag_variant.clone())),
            _ => Box::new(PtyExecutor::new()),
        }
    }
}
```

Executors use `flag_variant` (e.g., `Some("--acp")` or `Some("--mode acp")`) when building spawn args. If `None`, defaults to `--mode acp` / `--mode rpc`.

### Interior Mutability for Executor Stdin

Executors use interior mutability for the child process stdin handle, since `respond_permission(&self)` and `abort(&self)` need write access without `&mut self`:

```rust
pub struct AcpExecutor {
    flag_variant: Option<String>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    child: Arc<Mutex<Option<Child>>>,
}
```

This allows `respond_permission(&self)` and `abort(&self)` to acquire the lock and write without requiring `&mut self`. The `execute(&mut self)` method sets up these handles.

### Reconnect Ownership Clarification

In the fallback flow, the executor is a **local variable** (not the one stored in `SessionManager`). The flow:

1. Create executor from factory → local variable
2. Store it in `SessionManager` as `ActiveSession`
3. On failure, the local var is used for reconnect (it spawns a fresh process)
4. If reconnect fails, create a new `PtyExecutor` local var
5. Call `session_manager.replace_executor()` to update the stored reference
6. All paths end with the `SessionManager` holding the correct executor
