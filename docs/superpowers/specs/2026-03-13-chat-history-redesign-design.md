# Chat History Redesign — Design Spec

## Goal

Replace the current sidebar-based ChatHistoryPanel with a command-palette-style session picker (default), wired to the new session-based backend. Add session actions: archive, compact (local + AI), fork, delete. Provide three configurable appearance modes via Settings.

## Architecture

Command palette overlay is the default. User can switch to sidebar panel or horizontal strip via Settings. All three modes share the same data hook and backend API.

## Trigger

`Cmd+Shift+H` (already registered as Tauri global shortcut emitting `shortcut://toggle-chat-history`).

**Behavior per mode:**
- `"palette"` — toggles the centered overlay open/closed
- `"sidebar"` — toggles the left sidebar panel visible/hidden (collapses main sidebar when open, same as current behavior)
- `"strip"` — the strip is always visible when a project is open; `Cmd+Shift+H` focuses the strip's search/filter input for quick keyboard access

## Components

### ChatSessionPalette (default)

Centered modal overlay with dark backdrop. Click outside or `Esc` closes it.

- **Search input** at top: "Search threads..." — filters sessions in real-time
- **"New Chat" row** always first — creates blank session, clears chat view
- **Session rows** — each shows:
  - Summary text (first user message, truncated)
  - Agent badge (claude, codex, etc.)
  - Relative timestamp: "<1m" / "5m ago" / "2h ago" / "yesterday" / "Mar 10" (>7 days shows date)
  - `...` icon on hover — opens context menu
- **Keyboard navigation:**
  - `Up/Down` arrows move selection (`aria-activedescendant` for screen reader support)
  - `Enter` loads selected session as active chat
  - `Esc` closes palette
  - `Tab` trapped within modal (focus trap)
  - Typing filters immediately
- **Footer hints:** `↕ navigate` `↵ select` `esc close`
- **Accessibility:** `role="dialog"`, `aria-modal="true"`, focus trap, `aria-activedescendant` on list

### ChatSessionSidebar (configurable)

Left panel (refactored from current ChatHistoryPanel).

- "Chats" header with `...` menu (bulk actions)
- Simple text list of session summaries — click to load
- Per-row `...` menu on hover
- Inherits current `SidebarAutoCollapseManager` integration: when sidebar variant is visible, main sidebar collapses. `ChatHistoryManager` passes an `isOpen` boolean that replaces the old `chatHistoryOpen` prop.

### ChatSessionStrip (configurable)

Thin horizontal bar below chat header.

- Shows 3-4 recent session titles as clickable chips
- "+" chip to create new chat
- Overflow scroll for more sessions

### SessionActionMenu (shared)

Context menu used by all three variants. Two separate groups:

**Primary actions:**
| Action | Behavior |
|--------|----------|
| Rename | Edit session display title (sets `custom_title` field). |
| Fork | Copies messages to a new session. Original untouched. |
| Archive | Hides from list, preserves on disk. Reversible via "Show archived" toggle. |
| Delete | Confirmation prompt, then removes session file + index entry. Irreversible. |

**Compact section (separator above):**
| Action | Behavior |
|--------|----------|
| Compact | Replaces session summary with local heuristic: first user message + message count + duration. |
| Summarize with AI | Sends conversation to the session's agent for a richer summary. Stores result in `ai_summary` field. |

### Chat Header Bar

When a named session is loaded, the chat header shows:
- Session title (click to rename)
- Agent badge
- `...` menu with same actions as SessionActionMenu

## Data Layer

### Shared Hook: useChatSessions

```typescript
useChatSessions(projectPath: string) → {
  sessions: ChatSession[]
  loading: boolean
  error: string | null
  search: (query: string) => void
  createNew: () => Promise<string>
  loadSession: (id: string) => Promise<ChatMessage[]>
  archive: (id: string) => Promise<void>
  unarchive: (id: string) => Promise<void>
  fork: (id: string) => Promise<string>
  compact: (id: string) => Promise<void>
  summarizeWithAI: (id: string) => Promise<string>
  rename: (id: string, title: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  showArchived: boolean
  setShowArchived: (show: boolean) => void
}
```

- `error` surfaces any backend failure. Each action sets `error` on failure, clears on next successful action.
- `summarizeWithAI` reads the session's `agent` field to determine which CLI agent to invoke. No separate agent parameter needed — the hook resolves it internally.
- `showArchived` toggles whether archived sessions appear in the `sessions` list.

### Backend Commands

**New commands:**

| Command | Args | Returns | Disk behavior |
|---------|------|---------|---------------|
| `archive_chat_session` | `session_id: String, project_path: String` | `()` | Sets `archived: true` in `sessions_index.json`. Session file untouched. |
| `unarchive_chat_session` | `session_id: String, project_path: String` | `()` | Sets `archived: false` in `sessions_index.json`. |
| `fork_chat_session` | `session_id: String, project_path: String` | `String` (new session ID) | Reads `session_{id}.json`, creates `session_{new_uuid}.json` with same messages but new timestamps. Adds new entry to `sessions_index.json` with `forked_from: Some(original_id)`. |
| `rename_chat_session` | `session_id: String, project_path: String, title: String` | `()` | Sets `custom_title: Some(title)` in `sessions_index.json`. |
| `update_session_summary` | `session_id: String, project_path: String, summary: String` | `()` | Sets `summary` field in `sessions_index.json` (used by compact). |
| `summarize_chat_session` | `session_id: String, project_path: String` | `String` (AI summary) | Reads session messages, invokes the session's `agent` CLI with a summarization prompt, stores result in `ai_summary` field in index, returns the summary text. |

**Existing commands (changes noted):**

| Command | Change |
|---------|--------|
| `load_chat_sessions` | Add `include_archived: Option<bool>` parameter (defaults to `false` when `None` — backward compatible, no existing callers break). |
| `get_session_messages` | No change. |
| `delete_chat_session` | No change. |
| `search_chat_history` | No change. |
| `migrate_legacy_chat_data` | No change. |

### Session Model Extension

Add to `ChatSession` struct in `chat_history.rs` and persisted in `sessions_index.json`:

```rust
// All new fields are Option or have defaults — existing session files
// deserialize without breaking (serde default).
pub archived: bool,                    // #[serde(default)] — false
pub custom_title: Option<String>,      // User-set title, overrides summary in UI
pub ai_summary: Option<String>,        // AI-generated summary from compact
pub forked_from: Option<String>,       // Parent session ID if forked
```

Display priority for session title: `custom_title` > `ai_summary` > `summary` (auto-generated from first user message).

All four fields are persisted in `sessions_index.json` only (not in individual session message files).

## Settings

New setting: `chat_history_style: "palette" | "sidebar" | "strip"`

| Value | Label | Default |
|-------|-------|---------|
| `"palette"` | Command Palette | Yes |
| `"sidebar"` | Sidebar Panel | No |
| `"strip"` | Recent Strip | No |

**Files to update:**
- `src/types/settings.ts` — add `chat_history_style` to `AppSettings` interface
- `src/contexts/settings-context.tsx` — add to defaults
- `src-tauri/src/models/autohand.rs` (or wherever `AppSettings` Rust struct lives) — add field with `#[serde(default)]`
- `src/components/settings/GeneralSettings.tsx` — add dropdown in "Chat History" section

Location in Settings UI: General Settings tab → "Chat History" section → dropdown.

## File Structure

```
src/components/chat-history/
  ChatHistoryManager.tsx      — reads setting, renders correct variant, owns open/close state
  ChatSessionPalette.tsx      — command palette overlay
  ChatSessionSidebar.tsx      — sidebar list variant
  ChatSessionStrip.tsx        — horizontal strip variant
  SessionActionMenu.tsx       — shared context menu (DropdownMenu)
  useChatSessions.ts          — shared data/actions hook
```

## State Ownership & Migration

### Current state (to be removed)
- `chatHistoryOpen` in `App.tsx` — boolean toggled by `Cmd+Shift+H`
- `SidebarAutoCollapseManager` reads `chatHistoryOpen` prop

### New state
- `ChatHistoryManager` owns its own `isOpen` state, listens directly to `shortcut://toggle-chat-history` event
- `ChatHistoryManager` exposes `isOpen` to parent via a callback or context so `SidebarAutoCollapseManager` can still collapse the main sidebar when the sidebar variant is showing
- For palette/strip modes, `SidebarAutoCollapseManager` is unaffected (palette is an overlay, strip doesn't conflict with sidebar)

### Migration steps
1. Build new components alongside existing `ChatHistoryPanel`
2. Add `ChatHistoryManager` to `App.tsx`, passing it the project and a `onSidebarOverride` callback
3. `ChatHistoryManager` listens to `shortcut://toggle-chat-history` internally
4. Remove `chatHistoryOpen` state, the old `useEffect` listener, and `ChatHistoryPanel` import from `App.tsx`
5. Update `SidebarAutoCollapseManager`: replace `chatHistoryOpen` prop with the new `onSidebarOverride` signal from `ChatHistoryManager`
6. Remove old `ChatHistoryPanel.tsx` file
7. Legacy data auto-migrated via existing `migrate_legacy_chat_data` command on first `load_chat_sessions` call

## Integration with ChatInterface

`ChatHistoryManager` receives a callback from `App.tsx` to load a session into the active chat:

```typescript
// App.tsx passes this to ChatHistoryManager
const handleLoadChatSession = async (messages: ChatMessage[], sessionId: string) => {
  // This function is passed down to ChatInterface which calls setMessages()
  // and updates useChatPersistence to track the new active session ID
  chatSessionLoaderRef.current?.(messages, sessionId)
}
```

`ChatInterface` exposes a `onRegisterSessionLoader` prop that provides a ref-based callback for external session loading. This avoids adding session-loading logic to `ChatInterface`'s props — it stays a registration pattern.

`useChatPersistence` gains an `activeSessionId` field. When a session is loaded externally, the persistence hook updates its internal tracking so subsequent saves go to the correct session file.

New sessions created via "New Chat" clear the messages array and set `activeSessionId` to the new session's UUID.

## Testing

- Unit tests for `useChatSessions` hook (mock backend commands, test error states)
- Unit tests for `ChatSessionPalette` (keyboard nav, search filtering, action menu, focus trap, click-outside-close)
- Unit tests for `ChatSessionSidebar` (render sessions, click to load, context menu)
- Unit tests for `ChatSessionStrip` (render chips, overflow, new chat chip)
- Integration test: open palette → select session → verify messages load in ChatInterface
- Integration test: archive → verify session hidden → toggle showArchived → verify visible → unarchive
- Integration test: fork → verify new session created with same messages, different ID
- Integration test: compact → verify summary updated; summarize with AI → verify ai_summary set
- Regression test: `Cmd+Shift+H` toggle works reliably across all three modes
- Regression test: sidebar auto-collapse still works correctly with sidebar variant
