# Autohand CLI First-Class Integration Design

**Date**: 2026-02-23
**Status**: Approved
**Approach**: Dual-Protocol Native Integration (JSON-RPC 2.0 + ACP)

## Overview

Integrate the autohand code CLI as a first-class citizen in Commander, supporting both JSON-RPC 2.0 and ACP (Agent Communication Protocol) for structured bidirectional communication. This replaces the text-streaming approach used by other agents with typed message protocols, enabling permission dialogs, tool event visibility, hook management, and rich state awareness.

Autohand coexists as the primary (default) agent alongside claude, codex, gemini, and ollama which retain their current text-streaming integration.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Communication protocol | Both JSON-RPC 2.0 + ACP | Maximum flexibility for different editor integrations |
| Hooks integration | Full hooks UI | Users can create/edit/toggle hooks from Commander |
| Agent positioning | Coexist as primary | Default agent with richest integration; others remain available |
| Permission handling | Native dialog | Clear approval UX with tool name, file path, and destructive flag |

## Architecture

### Protocol Layer

A shared `AutohandProtocol` trait abstracts communication:

```rust
#[async_trait]
pub trait AutohandProtocol: Send + Sync {
    async fn start(&mut self, working_dir: &str, config: &AutohandConfig) -> Result<(), CommanderError>;
    async fn send_prompt(&self, message: &str, images: Option<Vec<String>>) -> Result<(), CommanderError>;
    async fn abort(&self) -> Result<(), CommanderError>;
    async fn reset(&self) -> Result<(), CommanderError>;
    async fn get_state(&self) -> Result<AutohandState, CommanderError>;
    async fn respond_permission(&self, request_id: &str, approved: bool) -> Result<(), CommanderError>;
    async fn shutdown(&self) -> Result<(), CommanderError>;
}
```

Two implementations:
- `AutohandRpcClient` - Spawns `autohand --mode rpc`, JSON-RPC 2.0 over stdin/stdout
- `AutohandAcpClient` - Spawns `autohand --mode acp`, ndJSON over stdio

Both dispatch incoming messages as typed Tauri events:
- `autohand:message` - LLM streaming output
- `autohand:tool-start`, `autohand:tool-update`, `autohand:tool-end` - Tool lifecycle
- `autohand:permission-request` - Approval needed
- `autohand:hook-event` - Hook fired
- `autohand:state-change` - Agent state changed (idle/processing/waiting)

### New Backend Files

```
src-tauri/src/
├── services/autohand/
│   ├── mod.rs                    # Module exports
│   ├── protocol.rs               # AutohandProtocol trait
│   ├── rpc_client.rs             # JSON-RPC 2.0 implementation
│   ├── acp_client.rs             # ACP implementation
│   ├── types.rs                  # Shared types
│   └── hooks_service.rs          # Hook CRUD on autohand config
├── commands/
│   └── autohand_commands.rs      # Tauri command handlers
├── models/
│   └── autohand.rs               # AutohandConfig, AutohandState, HookDefinition, etc.
└── tests/
    ├── commands/autohand_commands.rs
    ├── services/autohand_protocol.rs
    └── services/hooks_service.rs
```

### Tauri Commands

```rust
// Session lifecycle
execute_autohand_command(session_id, message, working_dir, protocol, config)
terminate_autohand_session(session_id)
get_autohand_state(session_id)

// Permission handling
respond_autohand_permission(session_id, request_id, approved)

// Hook management
get_autohand_hooks(config_path)
save_autohand_hook(config_path, hook)
delete_autohand_hook(config_path, hook_id)
toggle_autohand_hook(config_path, hook_id, enabled)

// Configuration
get_autohand_config(working_dir)
save_autohand_config(working_dir, config)

// Skills
get_autohand_skills(session_id)
```

### Session Management

Autohand sessions stored separately from existing text-streaming sessions:

```rust
struct AutohandSession {
    id: String,
    protocol: Box<dyn AutohandProtocol>,
    working_dir: String,
    state: AutohandState,
    created_at: DateTime<Utc>,
}
```

### Models

```rust
pub struct AutohandConfig {
    pub protocol: ProtocolMode,     // Rpc | Acp
    pub provider: String,
    pub model: Option<String>,
    pub permissions_mode: String,
    pub hooks: Vec<HookDefinition>,
}

pub struct AutohandState {
    pub status: AutohandStatus,     // Idle | Processing | WaitingPermission
    pub session_id: Option<String>,
    pub model: String,
    pub context_percent: f32,
    pub message_count: u32,
}

pub struct HookDefinition {
    pub id: String,
    pub event: HookEvent,
    pub command: String,
    pub pattern: Option<String>,
    pub enabled: bool,
    pub description: Option<String>,
}

pub struct PermissionRequest {
    pub request_id: String,
    pub tool_name: String,
    pub description: String,
    pub file_path: Option<String>,
    pub is_destructive: bool,
}
```

### Frontend Components

**New components:**
- `PermissionDialog.tsx` - Native-style approval dialog with Allow/Deny + "remember" checkbox
- `ToolEventBadge.tsx` - Inline tool event display in chat stream
- `AutohandSettingsTab.tsx` - Protocol selection, provider config, hook management
- `HooksPanel.tsx` - Hook list with add/edit/delete/toggle

**New hooks:**
- `useAutohandSession.ts` - Manages autohand protocol session lifecycle
- `useAutohandPermission.ts` - Permission dialog state and response
- `useAutohandHooks.ts` - Hook CRUD operations

**Modified components:**
- `ChatInterface` - Render tool events and hook indicators inline
- `SettingsModal` - Add "Autohand" settings tab
- `AIAgentStatusBar` - Show autohand status (idle/processing/context %)
- `useChatExecution` - Route to useAutohandSession when agent is "autohand"

### New Frontend Files

```
src/components/
├── chat/
│   ├── PermissionDialog.tsx
│   ├── ToolEventBadge.tsx
│   └── hooks/
│       ├── useAutohandSession.ts
│       └── useAutohandPermission.ts
├── settings/
│   ├── AutohandSettingsTab.tsx
│   └── HooksPanel.tsx
└── hooks/
    └── useAutohandHooks.ts
```

## Data Flow

```
User types message in ChatInterface
  -> useChatExecution detects agent="autohand"
  -> useAutohandSession.sendPrompt(message)
  -> invoke("execute_autohand_command", {session_id, message, working_dir, protocol})
  -> AutohandSession.protocol.send_prompt(message)
  -> JSON-RPC request written to autohand stdin

autohand responds with notifications:
  -> Background reader parses JSON from stdout
  -> app.emit("autohand:message", content)           -> ChatInterface renders streaming text
  -> app.emit("autohand:tool-start", event)           -> ToolEventBadge appears inline
  -> app.emit("autohand:permission-request", req)     -> PermissionDialog opens
  -> app.emit("autohand:hook-event", hook)            -> Hook indicator shown

User clicks [Allow] on PermissionDialog:
  -> useAutohandPermission.respond(request_id, true)
  -> invoke("respond_autohand_permission", {session_id, request_id, approved: true})
  -> AutohandSession.protocol.respond_permission(request_id, true)
  -> JSON-RPC response written to autohand stdin
```

## Error Handling

| Error | CommanderError Variant | User Message |
|-------|----------------------|--------------|
| autohand not in PATH | AutohandNotInstalled | "Autohand CLI not found. Install it with: npm i -g autohand-cli" |
| Process spawn fails | AutohandConnectionFailed | "Failed to start autohand. Check that the CLI is installed correctly." |
| No response in timeout | AutohandTimeout | "Autohand is not responding. Try restarting the session." |
| JSON-RPC error | AutohandProtocolError(code, msg) | Mapped from error code to user message |
| Permission denied for critical op | AutohandPermissionDenied | "Operation cancelled: permission denied." |
| Hook script fails | AutohandHookFailed(id, err) | "Hook '{id}' failed: {err}. The agent will continue." |

Graceful degradation:
- If autohand not installed: clear message with install instructions
- If protocol connection drops: attempt one reconnect, then show error with restart option
- If a hook fails: log error and continue (non-blocking)

## Testing Strategy

All tests written BEFORE implementation (TDD per CLAUDE.md).

**Backend tests:**
- Protocol: request serialization, notification parsing, tool kind mapping, trait dispatch
- Commands: arg building, hook CRUD, permission response, config read/write
- Models: serialization, defaults, state transitions
- Services: hooks file operations, config merging

**Frontend tests (Vitest):**
- `useAutohandSession.test.ts` - Session lifecycle
- `useAutohandPermission.test.ts` - Dialog show/hide/respond
- `PermissionDialog.test.tsx` - Component rendering
- `HooksPanel.test.tsx` - Hook list/add/edit/delete

**Existing tests must continue to pass.** Zero regressions.

## Implementation Order

1. Models (autohand.rs) - Data structures first
2. Protocol trait + RPC client - Core communication
3. ACP client - Second protocol
4. Hooks service - Config CRUD
5. Tauri commands - Wire backend to frontend
6. Frontend hooks (useAutohandSession, useAutohandPermission, useAutohandHooks)
7. Frontend components (PermissionDialog, ToolEventBadge, HooksPanel, AutohandSettingsTab)
8. Modified components (ChatInterface, SettingsModal, AIAgentStatusBar, useChatExecution)
9. Integration testing - End-to-end flows
