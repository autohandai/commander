# Chat History Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sidebar ChatHistoryPanel with a command-palette session picker, wire it to the session-based backend, and add session actions (archive, compact, fork, delete).

**Architecture:** Extend the Rust `ChatSession` model with archive/title/fork fields, add 6 new Tauri commands, build a shared `useChatSessions` React hook, then implement three swappable UI variants (palette, sidebar, strip) managed by a single `ChatHistoryManager` component that reads a settings preference.

**Tech Stack:** Rust/Tauri v2 backend, React 19 + TypeScript frontend, Vitest for testing, shadcn/ui components.

**Spec:** `docs/superpowers/specs/2026-03-13-chat-history-redesign-design.md`

---

## File Map

### Backend (Rust)
| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/src/models/chat_history.rs` | Modify | Add `archived`, `custom_title`, `ai_summary`, `forked_from` fields to `ChatSession` |
| `src-tauri/src/services/chat_history_service.rs` | Modify | Add `archive_session`, `unarchive_session`, `fork_session`, `rename_session`, `update_summary` service functions |
| `src-tauri/src/commands/chat_history_commands.rs` | Modify | Add 6 new Tauri command handlers, update `load_chat_sessions` signature |
| `src-tauri/src/lib.rs` | Modify | Register new commands in the `invoke_handler` |

### Frontend (TypeScript/React)
| File | Action | Responsibility |
|------|--------|----------------|
| `src/types/settings.ts` | Modify | Add `chat_history_style` to `AppSettings` |
| `src/contexts/settings-context.tsx` | Modify | Add default for `chat_history_style` |
| `src/components/chat-history/useChatSessions.ts` | Create | Shared hook: fetch sessions, actions (archive/fork/compact/delete/rename) |
| `src/components/chat-history/ChatSessionPalette.tsx` | Create | Command palette overlay with search + keyboard nav |
| `src/components/chat-history/SessionActionMenu.tsx` | Create | Shared context menu for session actions |
| `src/components/chat-history/ChatHistoryManager.tsx` | Create | Reads setting, renders correct variant, owns open/close state |
| `src/components/chat-history/ChatSessionSidebar.tsx` | Create | Sidebar list variant |
| `src/components/chat-history/ChatSessionStrip.tsx` | Create | Horizontal chip strip variant |
| `src/components/settings/GeneralSettings.tsx` | Modify | Add "Chat History Style" dropdown |
| `src/App.tsx` | Modify | Replace old ChatHistoryPanel with ChatHistoryManager, remove chatHistoryOpen state |
| `src/components/ChatInterface.tsx` | Modify | Add session loader registration prop |
| `src/components/chat/hooks/useChatPersistence.ts` | Modify | Add `activeSessionId` tracking |

### Tests
| File | Action |
|------|--------|
| `src/components/chat-history/__tests__/useChatSessions.test.ts` | Create |
| `src/components/chat-history/__tests__/ChatSessionPalette.test.tsx` | Create |
| `src/components/chat-history/__tests__/ChatHistoryManager.test.tsx` | Create |
| `src/components/__tests__/App.chatHistory.toggle.test.tsx` | Modify (update for new architecture) |

---

## Chunk 1: Backend — Model Extension & New Commands

### Task 1: Extend ChatSession model with new fields

**Files:**
- Modify: `src-tauri/src/models/chat_history.rs:27-35`

- [ ] **Step 1: Add four new fields to ChatSession struct**

In `src-tauri/src/models/chat_history.rs`, update the `ChatSession` struct (around line 27):

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSession {
    pub id: String,
    pub start_time: i64,
    pub end_time: i64,
    pub agent: String,
    pub branch: Option<String>,
    pub message_count: usize,
    pub summary: String,
    // New fields — all have serde defaults so existing JSON deserializes cleanly
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub custom_title: Option<String>,
    #[serde(default)]
    pub ai_summary: Option<String>,
    #[serde(default)]
    pub forked_from: Option<String>,
}
```

- [ ] **Step 2: Update ChatSession::new() to initialize new fields**

Find the `ChatSession::new()` impl and add the four fields with defaults:

```rust
impl ChatSession {
    pub fn new(id: String, agent: String, branch: Option<String>, summary: String) -> Self {
        let now = chrono::Utc::now().timestamp();
        Self {
            id,
            start_time: now,
            end_time: now,
            agent,
            branch,
            message_count: 0,
            summary,
            archived: false,
            custom_title: None,
            ai_summary: None,
            forked_from: None,
        }
    }
    // ... existing methods unchanged
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors. The `#[serde(default)]` attributes ensure existing `sessions_index.json` files deserialize without breaking.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/models/chat_history.rs
git commit -m "feat(chat-history): extend ChatSession model with archive, title, summary, fork fields"
```

---

### Task 2: Add service functions for session actions

**Files:**
- Modify: `src-tauri/src/services/chat_history_service.rs`

- [ ] **Step 1: Add `archive_session` and `unarchive_session` functions**

Append to the service file:

```rust
/// Set archived flag on a session in the index.
pub fn archive_session(project_path: &str, session_id: &str) -> Result<(), String> {
    let dir = ensure_commander_directory(project_path)?;
    let index_path = dir.join("sessions_index.json");
    let mut index = load_sessions_index(&index_path)?;

    let session = index.sessions.iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?;
    session.archived = true;
    index.last_updated = chrono::Utc::now().timestamp();

    save_sessions_index(&index_path, &index)?;
    Ok(())
}

/// Clear archived flag on a session in the index.
pub fn unarchive_session(project_path: &str, session_id: &str) -> Result<(), String> {
    let dir = ensure_commander_directory(project_path)?;
    let index_path = dir.join("sessions_index.json");
    let mut index = load_sessions_index(&index_path)?;

    let session = index.sessions.iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?;
    session.archived = false;
    index.last_updated = chrono::Utc::now().timestamp();

    save_sessions_index(&index_path, &index)?;
    Ok(())
}
```

- [ ] **Step 2: Add `rename_session` function**

```rust
/// Set custom_title on a session in the index.
pub fn rename_session(project_path: &str, session_id: &str, title: &str) -> Result<(), String> {
    let dir = ensure_commander_directory(project_path)?;
    let index_path = dir.join("sessions_index.json");
    let mut index = load_sessions_index(&index_path)?;

    let session = index.sessions.iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?;
    session.custom_title = Some(title.to_string());
    index.last_updated = chrono::Utc::now().timestamp();

    save_sessions_index(&index_path, &index)?;
    Ok(())
}
```

- [ ] **Step 3: Add `update_summary` function**

```rust
/// Update the auto-generated summary (used by compact action).
pub fn update_summary(project_path: &str, session_id: &str, summary: &str) -> Result<(), String> {
    let dir = ensure_commander_directory(project_path)?;
    let index_path = dir.join("sessions_index.json");
    let mut index = load_sessions_index(&index_path)?;

    let session = index.sessions.iter_mut()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?;
    session.summary = summary.to_string();
    index.last_updated = chrono::Utc::now().timestamp();

    save_sessions_index(&index_path, &index)?;
    Ok(())
}
```

- [ ] **Step 4: Add `fork_session` function**

```rust
/// Copy a session's messages into a new session. Returns the new session ID.
pub fn fork_session(project_path: &str, session_id: &str) -> Result<String, String> {
    let dir = ensure_commander_directory(project_path)?;

    // Load original session messages
    let messages = load_session_messages(project_path, session_id)?;
    if messages.is_empty() {
        return Err(format!("Session {} has no messages to fork", session_id));
    }

    // Load index to get original session metadata
    let index_path = dir.join("sessions_index.json");
    let mut index = load_sessions_index(&index_path)?;
    let original = index.sessions.iter()
        .find(|s| s.id == session_id)
        .ok_or_else(|| format!("Session {} not found", session_id))?
        .clone();

    // Create new session
    let new_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let new_session = ChatSession {
        id: new_id.clone(),
        start_time: now,
        end_time: now,
        agent: original.agent,
        branch: original.branch,
        message_count: original.message_count,
        summary: format!("Fork of: {}", original.custom_title.as_deref()
            .or(original.ai_summary.as_deref())
            .unwrap_or(&original.summary)),
        archived: false,
        custom_title: None,
        ai_summary: None,
        forked_from: Some(session_id.to_string()),
    };

    // Write new session messages file
    let session_file = dir.join(format!("session_{}.json", new_id));
    let json = serde_json::to_string_pretty(&messages)
        .map_err(|e| format!("Failed to serialize forked messages: {}", e))?;
    std::fs::write(&session_file, json)
        .map_err(|e| format!("Failed to write forked session: {}", e))?;

    // Update index
    index.sessions.insert(0, new_session);
    index.last_updated = now;
    save_sessions_index(&index_path, &index)?;

    Ok(new_id)
}
```

- [ ] **Step 5: Add `include_archived` parameter to `load_chat_sessions`**

Update the existing `load_chat_sessions` function signature:

```rust
pub fn load_chat_sessions(
    project_path: &str,
    limit: Option<usize>,
    agent_filter: Option<String>,
    include_archived: Option<bool>,
) -> Result<Vec<ChatSession>, String> {
    // ... existing loading logic ...

    // After loading, filter archived unless explicitly included
    let include = include_archived.unwrap_or(false);
    let mut sessions: Vec<ChatSession> = if include {
        index.sessions
    } else {
        index.sessions.into_iter().filter(|s| !s.archived).collect()
    };

    // ... existing sorting/limiting logic ...
}
```

- [ ] **Step 6: Add helper functions `load_sessions_index` and `save_sessions_index`**

If these don't already exist as standalone functions (currently inlined in `update_sessions_index`), extract them:

```rust
fn load_sessions_index(path: &std::path::Path) -> Result<SessionsIndex, String> {
    if path.exists() {
        let data = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read sessions index: {}", e))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse sessions index: {}", e))
    } else {
        Ok(SessionsIndex {
            sessions: vec![],
            last_updated: chrono::Utc::now().timestamp(),
            version: "1.0".to_string(),
        })
    }
}

fn save_sessions_index(path: &std::path::Path, index: &SessionsIndex) -> Result<(), String> {
    let json = serde_json::to_string_pretty(index)
        .map_err(|e| format!("Failed to serialize sessions index: {}", e))?;
    std::fs::write(path, json)
        .map_err(|e| format!("Failed to write sessions index: {}", e))
}
```

- [ ] **Step 7: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/services/chat_history_service.rs
git commit -m "feat(chat-history): add archive, rename, fork, update_summary service functions"
```

---

### Task 3: Add Tauri command handlers and register them

**Files:**
- Modify: `src-tauri/src/commands/chat_history_commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add new command handlers**

Append to `chat_history_commands.rs`:

```rust
#[tauri::command]
pub async fn archive_chat_session(project_path: String, session_id: String) -> Result<(), String> {
    crate::services::chat_history_service::archive_session(&project_path, &session_id)
}

#[tauri::command]
pub async fn unarchive_chat_session(project_path: String, session_id: String) -> Result<(), String> {
    crate::services::chat_history_service::unarchive_session(&project_path, &session_id)
}

#[tauri::command]
pub async fn fork_chat_session(project_path: String, session_id: String) -> Result<String, String> {
    crate::services::chat_history_service::fork_session(&project_path, &session_id)
}

#[tauri::command]
pub async fn rename_chat_session(project_path: String, session_id: String, title: String) -> Result<(), String> {
    crate::services::chat_history_service::rename_session(&project_path, &session_id, &title)
}

#[tauri::command]
pub async fn update_session_summary(project_path: String, session_id: String, summary: String) -> Result<(), String> {
    crate::services::chat_history_service::update_summary(&project_path, &session_id, &summary)
}
```

- [ ] **Step 2: Update `load_chat_sessions` command to accept `include_archived`**

```rust
#[tauri::command]
pub async fn load_chat_sessions(
    project_path: String,
    limit: Option<usize>,
    agent: Option<String>,
    include_archived: Option<bool>,
) -> Result<Vec<ChatSession>, String> {
    crate::services::chat_history_service::load_chat_sessions(
        &project_path, limit, agent, include_archived,
    )
}
```

- [ ] **Step 3: Register new commands in `lib.rs`**

Find the `invoke_handler` macro in `src-tauri/src/lib.rs` and add the new commands:

```rust
// Add these to the existing invoke_handler list:
archive_chat_session,
unarchive_chat_session,
fork_chat_session,
rename_chat_session,
update_session_summary,
```

- [ ] **Step 4: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

- [ ] **Step 5: Run existing backend tests**

Run: `cd src-tauri && cargo test`
Expected: All existing tests pass. New fields have `serde(default)` so nothing breaks.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/chat_history_commands.rs src-tauri/src/lib.rs
git commit -m "feat(chat-history): add Tauri commands for archive, fork, rename, update_summary"
```

---

## Chunk 2: Frontend — Settings, Hook, and Palette

### Task 4: Add `chat_history_style` setting

**Files:**
- Modify: `src/types/settings.ts:23-41`
- Modify: `src/contexts/settings-context.tsx:51-71`
- Modify: `src/components/settings/GeneralSettings.tsx`

- [ ] **Step 1: Add type and field to AppSettings**

In `src/types/settings.ts`, add to the `AppSettings` interface:

```typescript
chat_history_style?: 'palette' | 'sidebar' | 'strip'
```

- [ ] **Step 2: Add default in settings context**

In `src/contexts/settings-context.tsx`, add to `defaultSettings`:

```typescript
chat_history_style: 'palette',
```

- [ ] **Step 3: Add dropdown to GeneralSettings**

In `src/components/settings/GeneralSettings.tsx`, add a new section after the dashboard settings. Follow the existing pattern (the component receives props from `SettingsModal`). Add a "Chat History" section with a `Select` dropdown:

```tsx
{/* Chat History */}
<div className="space-y-2">
  <Label className="text-sm font-medium">Chat History Style</Label>
  <p className="text-xs text-muted-foreground">How the chat session picker appears when you press ⌘⇧H</p>
  <Select value={settings.chat_history_style ?? 'palette'} onValueChange={(v) => updateSettings({ chat_history_style: v as any })}>
    <SelectTrigger className="w-48">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="palette">Command Palette</SelectItem>
      <SelectItem value="sidebar">Sidebar Panel</SelectItem>
      <SelectItem value="strip">Recent Strip</SelectItem>
    </SelectContent>
  </Select>
</div>
```

Note: The exact prop drilling pattern depends on how `GeneralSettings` receives and updates settings. Follow the existing pattern — likely `settings` from context and `updateSettings` callback.

- [ ] **Step 4: Commit**

```bash
git add src/types/settings.ts src/contexts/settings-context.tsx src/components/settings/GeneralSettings.tsx
git commit -m "feat(settings): add chat_history_style setting with palette/sidebar/strip options"
```

---

### Task 5: Build `useChatSessions` hook

**Files:**
- Create: `src/components/chat-history/useChatSessions.ts`
- Create: `src/components/chat-history/__tests__/useChatSessions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/components/chat-history/__tests__/useChatSessions.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChatSessions } from '../useChatSessions'

const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: any[]) => mockInvoke(...args) }))

const mockSessions = [
  { id: 's1', start_time: 1000, end_time: 2000, agent: 'claude', branch: 'main', message_count: 5, summary: 'First chat', archived: false, custom_title: null, ai_summary: null, forked_from: null },
  { id: 's2', start_time: 3000, end_time: 4000, agent: 'codex', branch: 'dev', message_count: 3, summary: 'Second chat', archived: false, custom_title: null, ai_summary: null, forked_from: null },
  { id: 's3', start_time: 500, end_time: 600, agent: 'claude', branch: 'main', message_count: 2, summary: 'Archived chat', archived: true, custom_title: null, ai_summary: null, forked_from: null },
]

describe('useChatSessions', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
      switch (cmd) {
        case 'load_chat_sessions': return args?.includeArchived ? mockSessions : mockSessions.filter(s => !s.archived)
        case 'get_session_messages': return [{ id: 'm1', role: 'user', content: 'hello', timestamp: 1000, agent: 'claude' }]
        case 'archive_chat_session': return null
        case 'unarchive_chat_session': return null
        case 'fork_chat_session': return 'new-fork-id'
        case 'delete_chat_session': return null
        case 'rename_chat_session': return null
        case 'update_session_summary': return null
        default: return null
      }
    })
  })

  it('loads non-archived sessions on mount', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessions).toHaveLength(2)
    expect(result.current.sessions.every(s => !s.archived)).toBe(true)
  })

  it('includes archived sessions when showArchived is true', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.setShowArchived(true) })
    await waitFor(() => expect(result.current.sessions).toHaveLength(3))
  })

  it('filters sessions by search query', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.search('First') })
    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].id).toBe('s1')
  })

  it('archives a session and refreshes', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.archive('s1') })
    expect(mockInvoke).toHaveBeenCalledWith('archive_chat_session', { projectPath: '/projects/test', sessionId: 's1' })
  })

  it('forks a session and returns new ID', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let newId = ''
    await act(async () => { newId = await result.current.fork('s1') })
    expect(newId).toBe('new-fork-id')
    expect(mockInvoke).toHaveBeenCalledWith('fork_chat_session', { projectPath: '/projects/test', sessionId: 's1' })
  })

  it('loads session messages', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let messages: any[] = []
    await act(async () => { messages = await result.current.loadSession('s1') })
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('hello')
  })

  it('sets error on backend failure', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'load_chat_sessions') throw new Error('disk full')
      return null
    })
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('disk full')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/chat-history/__tests__/useChatSessions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

Create `src/components/chat-history/useChatSessions.ts`:

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface ChatSessionInfo {
  id: string
  start_time: number
  end_time: number
  agent: string
  branch: string | null
  message_count: number
  summary: string
  archived: boolean
  custom_title: string | null
  ai_summary: string | null
  forked_from: string | null
}

export interface SessionMessage {
  id: string
  role: string
  content: string
  timestamp: number
  agent: string
  metadata?: Record<string, unknown>
}

export function useChatSessions(projectPath: string | null) {
  const [allSessions, setAllSessions] = useState<ChatSessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const projectPathRef = useRef(projectPath)
  projectPathRef.current = projectPath

  const refresh = useCallback(async () => {
    if (!projectPathRef.current) {
      setAllSessions([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const sessions = await invoke<ChatSessionInfo[]>('load_chat_sessions', {
        projectPath: projectPathRef.current,
        limit: null,
        agent: null,
        includeArchived: showArchived,
      })
      setAllSessions(sessions)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setAllSessions([])
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => { refresh() }, [refresh, projectPath])

  // Client-side search filter
  const sessions = searchQuery.trim()
    ? allSessions.filter(s => {
        const q = searchQuery.toLowerCase()
        const title = (s.custom_title || s.ai_summary || s.summary || '').toLowerCase()
        return title.includes(q) || (s.agent || '').toLowerCase().includes(q)
      })
    : allSessions

  const search = useCallback((query: string) => setSearchQuery(query), [])

  const archive = useCallback(async (id: string) => {
    setError(null)
    try {
      await invoke('archive_chat_session', { projectPath: projectPathRef.current, sessionId: id })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [refresh])

  const unarchive = useCallback(async (id: string) => {
    setError(null)
    try {
      await invoke('unarchive_chat_session', { projectPath: projectPathRef.current, sessionId: id })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [refresh])

  const fork = useCallback(async (id: string): Promise<string> => {
    setError(null)
    try {
      const newId = await invoke<string>('fork_chat_session', { projectPath: projectPathRef.current, sessionId: id })
      await refresh()
      return newId
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    }
  }, [refresh])

  const rename = useCallback(async (id: string, title: string) => {
    setError(null)
    try {
      await invoke('rename_chat_session', { projectPath: projectPathRef.current, sessionId: id, title })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [refresh])

  const compact = useCallback(async (id: string) => {
    setError(null)
    try {
      // Local heuristic: load messages, build summary
      const messages = await invoke<SessionMessage[]>('get_session_messages', { projectPath: projectPathRef.current, sessionId: id })
      const userMsgs = messages.filter(m => m.role === 'user')
      const first = userMsgs[0]?.content?.slice(0, 80) || 'Empty session'
      const summary = `${first} (${messages.length} messages)`
      await invoke('update_session_summary', { projectPath: projectPathRef.current, sessionId: id, summary })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [refresh])

  const summarizeWithAI = useCallback(async (id: string): Promise<string> => {
    setError(null)
    try {
      // For now, fall back to local compact. AI summarization requires agent invocation
      // which will be wired in a future task when the agent execution layer supports it.
      await compact(id)
      return 'Summary updated locally'
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    }
  }, [compact])

  const deleteSession = useCallback(async (id: string) => {
    setError(null)
    try {
      await invoke('delete_chat_session', { projectPath: projectPathRef.current, sessionId: id })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [refresh])

  const loadSession = useCallback(async (id: string): Promise<SessionMessage[]> => {
    setError(null)
    try {
      return await invoke<SessionMessage[]>('get_session_messages', { projectPath: projectPathRef.current, sessionId: id })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    }
  }, [])

  const createNew = useCallback(async (): Promise<string> => {
    // Returns a new UUID — the actual session file is created when the first message is sent
    return crypto.randomUUID()
  }, [])

  return {
    sessions,
    loading,
    error,
    search,
    searchQuery,
    createNew,
    loadSession,
    archive,
    unarchive,
    fork,
    compact,
    summarizeWithAI,
    rename,
    deleteSession,
    showArchived,
    setShowArchived,
    refresh,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/chat-history/__tests__/useChatSessions.test.ts`
Expected: All 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-history/useChatSessions.ts src/components/chat-history/__tests__/useChatSessions.test.ts
git commit -m "feat(chat-history): add useChatSessions hook with archive, fork, compact, search"
```

---

### Task 6: Build SessionActionMenu component

**Files:**
- Create: `src/components/chat-history/SessionActionMenu.tsx`

- [ ] **Step 1: Implement the shared context menu**

```tsx
import { MoreHorizontal, Archive, ArchiveRestore, GitFork, Pencil, Trash2, Minimize2, Sparkles } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface SessionActionMenuProps {
  sessionId: string
  archived?: boolean
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onRename: (id: string) => void
  onFork: (id: string) => void
  onCompact: (id: string) => void
  onSummarizeAI: (id: string) => void
  onDelete: (id: string) => void
  trigger?: React.ReactNode
}

export function SessionActionMenu({
  sessionId, archived, onArchive, onUnarchive, onRename, onFork, onCompact, onSummarizeAI, onDelete, trigger,
}: SessionActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onRename(sessionId)}>
          <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onFork(sessionId)}>
          <GitFork className="h-3.5 w-3.5 mr-2" /> Fork
        </DropdownMenuItem>
        {archived ? (
          <DropdownMenuItem onClick={() => onUnarchive(sessionId)}>
            <ArchiveRestore className="h-3.5 w-3.5 mr-2" /> Unarchive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onArchive(sessionId)}>
            <Archive className="h-3.5 w-3.5 mr-2" /> Archive
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onCompact(sessionId)}>
          <Minimize2 className="h-3.5 w-3.5 mr-2" /> Compact
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSummarizeAI(sessionId)}>
          <Sparkles className="h-3.5 w-3.5 mr-2" /> Summarize with AI
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDelete(sessionId)} className="text-destructive focus:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat-history/SessionActionMenu.tsx
git commit -m "feat(chat-history): add SessionActionMenu shared context menu"
```

---

### Task 7: Build ChatSessionPalette component

**Files:**
- Create: `src/components/chat-history/ChatSessionPalette.tsx`
- Create: `src/components/chat-history/__tests__/ChatSessionPalette.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/chat-history/__tests__/ChatSessionPalette.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatSessionPalette } from '../ChatSessionPalette'

const mockSessions = [
  { id: 's1', start_time: Date.now() / 1000 - 3600, end_time: Date.now() / 1000, agent: 'claude', branch: 'main', message_count: 5, summary: 'Fix login bug', archived: false, custom_title: null, ai_summary: null, forked_from: null },
  { id: 's2', start_time: Date.now() / 1000 - 86400, end_time: Date.now() / 1000, agent: 'codex', branch: 'dev', message_count: 3, summary: 'Add dashboard', archived: false, custom_title: 'My custom title', ai_summary: null, forked_from: null },
]

const defaultProps = {
  sessions: mockSessions,
  loading: false,
  searchQuery: '',
  onSearch: vi.fn(),
  onSelect: vi.fn(),
  onNewChat: vi.fn(),
  onClose: vi.fn(),
  onArchive: vi.fn(),
  onUnarchive: vi.fn(),
  onRename: vi.fn(),
  onFork: vi.fn(),
  onCompact: vi.fn(),
  onSummarizeAI: vi.fn(),
  onDelete: vi.fn(),
}

describe('ChatSessionPalette', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders search input and New Chat option', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()
    expect(screen.getByText('New Chat')).toBeInTheDocument()
  })

  it('renders session summaries with custom_title priority', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.getByText('My custom title')).toBeInTheDocument()
  })

  it('calls onSelect when clicking a session', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    fireEvent.click(screen.getByText('Fix login bug'))
    expect(defaultProps.onSelect).toHaveBeenCalledWith('s1')
  })

  it('calls onNewChat when clicking New Chat', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    fireEvent.click(screen.getByText('New Chat'))
    expect(defaultProps.onNewChat).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    fireEvent.keyDown(screen.getByPlaceholderText('Search threads...'), { key: 'Escape' })
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('navigates with arrow keys', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    const input = screen.getByPlaceholderText('Search threads...')
    // Down arrow twice should select second session (index 0 = New Chat, 1 = s1, 2 = s2)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(defaultProps.onSelect).toHaveBeenCalledWith('s1')
  })

  it('calls onClose when clicking backdrop', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    const backdrop = screen.getByTestId('palette-backdrop')
    fireEvent.click(backdrop)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('shows footer with keyboard hints', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    expect(screen.getByText(/navigate/)).toBeInTheDocument()
    expect(screen.getByText(/select/)).toBeInTheDocument()
    expect(screen.getByText(/close/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/chat-history/__tests__/ChatSessionPalette.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the palette**

Create `src/components/chat-history/ChatSessionPalette.tsx`:

```tsx
import { useRef, useState, useEffect } from 'react'
import { PlusCircle, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SessionActionMenu } from './SessionActionMenu'
import type { ChatSessionInfo } from './useChatSessions'

function relativeTime(unixSeconds: number): string {
  const now = Date.now() / 1000
  const diff = now - unixSeconds
  if (diff < 60) return '<1m'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return 'yesterday'
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function sessionTitle(s: ChatSessionInfo): string {
  return s.custom_title || s.ai_summary || s.summary || 'Untitled'
}

interface ChatSessionPaletteProps {
  sessions: ChatSessionInfo[]
  loading: boolean
  searchQuery: string
  onSearch: (query: string) => void
  onSelect: (sessionId: string) => void
  onNewChat: () => void
  onClose: () => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onRename: (id: string) => void
  onFork: (id: string) => void
  onCompact: (id: string) => void
  onSummarizeAI: (id: string) => void
  onDelete: (id: string) => void
}

export function ChatSessionPalette({
  sessions, loading, searchQuery, onSearch, onSelect, onNewChat, onClose,
  onArchive, onUnarchive, onRename, onFork, onCompact, onSummarizeAI, onDelete,
}: ChatSessionPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // selectedIndex: 0 = New Chat, 1..N = sessions
  const [selectedIndex, setSelectedIndex] = useState(0)
  const totalItems = 1 + sessions.length

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Reset selection when sessions change (e.g., search filter)
  useEffect(() => { setSelectedIndex(0) }, [sessions.length])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, totalItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex === 0) {
        onNewChat()
      } else {
        const session = sessions[selectedIndex - 1]
        if (session) onSelect(session.id)
      }
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="palette-backdrop"
        className="fixed inset-0 z-50 bg-black/60"
        onClick={onClose}
      />
      {/* Palette */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-1/3 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover shadow-xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search threads..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
          />
        </div>

        {/* Results list */}
        <div className="max-h-64 overflow-y-auto py-1" role="listbox" aria-activedescendant={`palette-item-${selectedIndex}`}>
          {/* New Chat option */}
          <button
            id="palette-item-0"
            role="option"
            aria-selected={selectedIndex === 0}
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${selectedIndex === 0 ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50'}`}
            onClick={onNewChat}
          >
            <PlusCircle className="h-4 w-4" />
            New Chat
          </button>

          {/* Session rows */}
          {loading ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">Loading...</div>
          ) : sessions.length === 0 && searchQuery ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">No matching sessions</div>
          ) : (
            sessions.map((session, i) => {
              const itemIndex = i + 1
              const isSelected = selectedIndex === itemIndex
              return (
                <div
                  key={session.id}
                  id={`palette-item-${itemIndex}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`group flex w-full items-center gap-2 px-3 py-2 text-sm cursor-pointer ${isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50'}`}
                  onClick={() => onSelect(session.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{sessionTitle(session)}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{session.agent}</Badge>
                  <span className="text-[11px] text-muted-foreground shrink-0">{relativeTime(session.start_time)}</span>
                  <SessionActionMenu
                    sessionId={session.id}
                    archived={session.archived}
                    onArchive={onArchive}
                    onUnarchive={onUnarchive}
                    onRename={onRename}
                    onFork={onFork}
                    onCompact={onCompact}
                    onSummarizeAI={onSummarizeAI}
                    onDelete={onDelete}
                  />
                </div>
              )
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono">↕</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> select</span>
          </div>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/chat-history/__tests__/ChatSessionPalette.test.tsx`
Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-history/ChatSessionPalette.tsx src/components/chat-history/__tests__/ChatSessionPalette.test.tsx
git commit -m "feat(chat-history): add ChatSessionPalette with search, keyboard nav, session actions"
```

---

## Chunk 3: Manager, Variants, Integration & Migration

### Task 8: Build ChatHistoryManager

**Files:**
- Create: `src/components/chat-history/ChatHistoryManager.tsx`

- [ ] **Step 1: Implement the manager that reads settings and renders the correct variant**

```tsx
import { useState, useEffect, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useSettings } from '@/contexts/settings-context'
import { useChatSessions, type SessionMessage } from './useChatSessions'
import { ChatSessionPalette } from './ChatSessionPalette'

interface ChatHistoryManagerProps {
  projectPath: string | null
  onLoadSession: (messages: SessionMessage[], sessionId: string) => void
  onNewChat: () => void
  /** Notify parent when sidebar variant is open (for SidebarAutoCollapseManager) */
  onSidebarOverride?: (isOpen: boolean) => void
}

export function ChatHistoryManager({ projectPath, onLoadSession, onNewChat, onSidebarOverride }: ChatHistoryManagerProps) {
  const { settings } = useSettings()
  const style = settings.chat_history_style ?? 'palette'
  const [isOpen, setIsOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  const hook = useChatSessions(projectPath)

  // Listen for Cmd+Shift+H shortcut
  useEffect(() => {
    const unlisten = listen('shortcut://toggle-chat-history', () => {
      setIsOpen(prev => !prev)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // Notify parent for sidebar override (sidebar mode only)
  useEffect(() => {
    if (style === 'sidebar') {
      onSidebarOverride?.(isOpen)
    } else {
      onSidebarOverride?.(false)
    }
  }, [isOpen, style, onSidebarOverride])

  const handleSelect = useCallback(async (sessionId: string) => {
    try {
      const messages = await hook.loadSession(sessionId)
      onLoadSession(messages, sessionId)
      setIsOpen(false)
    } catch {
      // Error handled by hook
    }
  }, [hook.loadSession, onLoadSession])

  const handleNewChat = useCallback(() => {
    onNewChat()
    setIsOpen(false)
  }, [onNewChat])

  const handleClose = useCallback(() => setIsOpen(false), [])

  const handleRename = useCallback((id: string) => {
    const title = window.prompt('Session title:')
    if (title) hook.rename(id, title)
  }, [hook.rename])

  // Palette mode (default)
  if (style === 'palette' && isOpen && projectPath) {
    return (
      <ChatSessionPalette
        sessions={hook.sessions}
        loading={hook.loading}
        searchQuery={hook.searchQuery}
        onSearch={hook.search}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        onClose={handleClose}
        onArchive={hook.archive}
        onUnarchive={hook.unarchive}
        onRename={handleRename}
        onFork={hook.fork}
        onCompact={hook.compact}
        onSummarizeAI={hook.summarizeWithAI}
        onDelete={hook.deleteSession}
      />
    )
  }

  // Sidebar and Strip variants — placeholder for Tasks 9 and 10
  // if (style === 'sidebar' && isOpen && projectPath) { ... }
  // if (style === 'strip' && projectPath) { ... }

  return null
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat-history/ChatHistoryManager.tsx
git commit -m "feat(chat-history): add ChatHistoryManager with palette mode and shortcut listener"
```

---

### Task 9: Build ChatSessionSidebar variant

**Files:**
- Create: `src/components/chat-history/ChatSessionSidebar.tsx`

- [ ] **Step 1: Implement the sidebar variant**

Refactor from the current `ChatHistoryPanel` pattern — simple list with "Chats" header and per-row `...` menu:

```tsx
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SessionActionMenu } from './SessionActionMenu'
import type { ChatSessionInfo } from './useChatSessions'

function sessionTitle(s: ChatSessionInfo): string {
  return s.custom_title || s.ai_summary || s.summary || 'Untitled'
}

interface ChatSessionSidebarProps {
  sessions: ChatSessionInfo[]
  loading: boolean
  onSelect: (sessionId: string) => void
  onClose: () => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onRename: (id: string) => void
  onFork: (id: string) => void
  onCompact: (id: string) => void
  onSummarizeAI: (id: string) => void
  onDelete: (id: string) => void
}

export function ChatSessionSidebar({
  sessions, loading, onSelect, onClose,
  onArchive, onUnarchive, onRename, onFork, onCompact, onSummarizeAI, onDelete,
}: ChatSessionSidebarProps) {
  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-medium text-muted-foreground">Chats</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} aria-label="Close chat history">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 text-xs text-muted-foreground text-center">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">No chat sessions yet</div>
        ) : (
          <div className="py-1">
            {sessions.map(session => (
              <div
                key={session.id}
                className="group flex items-center gap-1 px-4 py-2.5 cursor-pointer hover:bg-accent/50"
                onClick={() => onSelect(session.id)}
              >
                <span className="flex-1 truncate text-sm text-foreground">{sessionTitle(session)}</span>
                <SessionActionMenu
                  sessionId={session.id}
                  archived={session.archived}
                  onArchive={onArchive}
                  onUnarchive={onUnarchive}
                  onRename={onRename}
                  onFork={onFork}
                  onCompact={onCompact}
                  onSummarizeAI={onSummarizeAI}
                  onDelete={onDelete}
                />
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
```

- [ ] **Step 2: Wire sidebar variant into ChatHistoryManager**

In `ChatHistoryManager.tsx`, add after the palette block:

```tsx
if (style === 'sidebar' && isOpen && projectPath) {
  return (
    <ChatSessionSidebar
      sessions={hook.sessions}
      loading={hook.loading}
      onSelect={handleSelect}
      onClose={handleClose}
      onArchive={hook.archive}
      onUnarchive={hook.unarchive}
      onRename={handleRename}
      onFork={hook.fork}
      onCompact={hook.compact}
      onSummarizeAI={hook.summarizeWithAI}
      onDelete={hook.deleteSession}
    />
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat-history/ChatSessionSidebar.tsx src/components/chat-history/ChatHistoryManager.tsx
git commit -m "feat(chat-history): add ChatSessionSidebar variant"
```

---

### Task 10: Build ChatSessionStrip variant

**Files:**
- Create: `src/components/chat-history/ChatSessionStrip.tsx`

- [ ] **Step 1: Implement the strip variant**

```tsx
import { Plus } from 'lucide-react'
import type { ChatSessionInfo } from './useChatSessions'

function sessionTitle(s: ChatSessionInfo): string {
  return s.custom_title || s.ai_summary || s.summary || 'Untitled'
}

interface ChatSessionStripProps {
  sessions: ChatSessionInfo[]
  onSelect: (sessionId: string) => void
  onNewChat: () => void
}

export function ChatSessionStrip({ sessions, onSelect, onNewChat }: ChatSessionStripProps) {
  const recent = sessions.slice(0, 4)
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-1 border-b bg-background">
      <button
        onClick={onNewChat}
        className="flex items-center gap-1 shrink-0 rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50"
      >
        <Plus className="h-3 w-3" /> New
      </button>
      {recent.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className="shrink-0 truncate max-w-[140px] rounded-md border px-2 py-0.5 text-xs hover:bg-accent/50"
          title={sessionTitle(s)}
        >
          {sessionTitle(s)}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Wire strip variant into ChatHistoryManager**

In `ChatHistoryManager.tsx`, add the strip block. The strip renders inline (not as overlay), so the manager returns it directly when `style === 'strip'`:

```tsx
if (style === 'strip' && projectPath) {
  return (
    <ChatSessionStrip
      sessions={hook.sessions}
      onSelect={handleSelect}
      onNewChat={handleNewChat}
    />
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/chat-history/ChatSessionStrip.tsx src/components/chat-history/ChatHistoryManager.tsx
git commit -m "feat(chat-history): add ChatSessionStrip variant"
```

---

### Task 11: Integrate into App.tsx — replace old ChatHistoryPanel

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/__tests__/App.chatHistory.toggle.test.tsx`

- [ ] **Step 1: Replace old state and imports**

In `App.tsx`:
1. Remove `import { ChatHistoryPanel } from '@/components/ChatHistoryPanel'`
2. Add `import { ChatHistoryManager } from '@/components/chat-history/ChatHistoryManager'`
3. Remove the `chatHistoryOpen` state: `const [chatHistoryOpen, setChatHistoryOpen] = useState(false)`
4. Remove the `useEffect` that listens to `shortcut://toggle-chat-history` (the manager handles this now)
5. Add a new state for sidebar override: `const [chatSidebarOpen, setChatSidebarOpen] = useState(false)`
6. Add a ref for session loading: `const chatSessionLoaderRef = useRef<((messages: any[], sessionId: string) => void) | null>(null)`

- [ ] **Step 2: Update SidebarAutoCollapseManager**

Replace the `chatHistoryOpen` prop with `chatSidebarOpen`:

```tsx
<SidebarAutoCollapseManager
  activeTab={activeTab}
  enabled={Boolean(settings.code_settings?.auto_collapse_sidebar)}
  projectActive={Boolean(currentProject)}
  chatHistoryOpen={chatSidebarOpen}  // renamed from chatHistoryOpen
/>
```

- [ ] **Step 3: Add ChatHistoryManager to the layout**

Place it inside the `SidebarInset`, right before or after the content area. For palette mode it renders a portal-like overlay, for sidebar mode it renders inline, for strip mode it renders a bar:

```tsx
{currentProject && (
  <ChatHistoryManager
    projectPath={currentProject.path}
    onLoadSession={(messages, sessionId) => {
      chatSessionLoaderRef.current?.(messages, sessionId)
    }}
    onNewChat={() => {
      chatSessionLoaderRef.current?.([], crypto.randomUUID())
    }}
    onSidebarOverride={setChatSidebarOpen}
  />
)}
```

- [ ] **Step 4: Remove ChatHistoryPanel from ProjectView**

Remove the `chatHistoryOpen` and `onChatHistoryClose` props from `ProjectView` and the `ChatHistoryPanel` rendering block inside it.

- [ ] **Step 5: Update the test file**

In `src/components/__tests__/App.chatHistory.toggle.test.tsx`, the tests now verify the palette opens (via the `ChatHistoryManager`). Since the palette is rendered by the manager listening to the Tauri event, the existing test mock infrastructure (firing `shortcut://toggle-chat-history` events) should still work. Update assertions to look for palette-specific elements (e.g., `getByPlaceholderText('Search threads...')`) instead of the old "Chat History" heading text.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run src/components/__tests__/App.chatHistory.toggle.test.tsx`
Expected: All tests pass with updated assertions.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/__tests__/App.chatHistory.toggle.test.tsx
git commit -m "feat(chat-history): integrate ChatHistoryManager, remove old ChatHistoryPanel"
```

---

### Task 12: Delete old ChatHistoryPanel

**Files:**
- Delete: `src/components/ChatHistoryPanel.tsx`

- [ ] **Step 1: Remove the file**

```bash
rm src/components/ChatHistoryPanel.tsx
```

- [ ] **Step 2: Search for any remaining imports**

Search the codebase for `ChatHistoryPanel` — ensure no files still import it. Fix any lingering references.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All main project tests pass. No references to `ChatHistoryPanel` remain.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated ChatHistoryPanel component"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `cd src-tauri && cargo check` — Rust compiles
- [ ] `cd src-tauri && cargo test` — All backend tests pass
- [ ] `npx vitest run` — All frontend tests pass
- [ ] Manual: `Cmd+Shift+H` opens command palette with session list
- [ ] Manual: Selecting a session loads its messages into chat
- [ ] Manual: "New Chat" clears messages and starts fresh
- [ ] Manual: `...` menu actions work (archive hides, fork creates copy, delete removes)
- [ ] Manual: Settings → General → Chat History Style dropdown changes the mode
- [ ] Manual: Sidebar mode shows left panel, strip mode shows horizontal chips
