# Offline Docs Search & In-App Viewer

## Problem

The sidebar "Search the docs..." input is a non-functional placeholder. Users have no way to search or read Autohand documentation from within Commander. The docs at autohand.ai/docs/ are small (~5 pages of markdown-based content) and should be available offline with an in-app viewer.

## Solution

Download docs from autohand.ai, cache as markdown locally, provide fuzzy search with a floating results panel, and render selected docs in an in-app markdown viewer.

## Architecture

### Backend (Rust)

**Service: `docs_service.rs`**

Manifest of known doc pages (hardcoded, easily extensible):

```rust
struct DocPage {
    slug: &'static str,       // e.g. "quickstart"
    title: &'static str,      // e.g. "Quickstart Guide"
    url: &'static str,        // e.g. "https://autohand.ai/docs/quickstart.html"
    category: &'static str,   // e.g. "Getting Started"
}

const DOC_PAGES: &[DocPage] = &[
    DocPage { slug: "quickstart", title: "Quickstart Guide", url: "https://autohand.ai/docs/quickstart.html", category: "Getting Started" },
    DocPage { slug: "first-session", title: "First Session", url: "https://autohand.ai/docs/getting-started/first-session.html", category: "Getting Started" },
    DocPage { slug: "cli-reference", title: "CLI Reference", url: "https://autohand.ai/docs/working-with-autohand-code/cli-reference.html", category: "Working with Autohand Code" },
    DocPage { slug: "configuration", title: "Configuration", url: "https://autohand.ai/docs/working-with-autohand-code/configuration.html", category: "Working with Autohand Code" },
    DocPage { slug: "ai-model-providers", title: "AI Model Providers", url: "https://autohand.ai/docs/integrations/ai-model-providers.html", category: "Integrations" },
];
```

Functions:
- `download_all_docs(cache_dir)` — Fetch each URL via `reqwest`, convert HTML to markdown via `htmd` crate, write to `~/.commander/docs/autohand/{slug}.md`
- `search_docs(query, cache_dir)` — Read cached `.md` files, case-insensitive substring match on title + content. Return matches ranked: title matches first, then content matches. Each result includes slug, title, category, and a snippet (first match context, ~120 chars).
- `get_doc_content(slug, cache_dir)` — Read and return the full markdown content of a cached doc
- `get_docs_status(cache_dir)` — Return `{ downloaded: bool, doc_count: u32, last_synced: Option<u64>, cache_size_bytes: u64 }`
- `delete_docs_cache(cache_dir)` — Remove the cache directory

**Commands: `docs_commands.rs`**

```rust
#[tauri::command]
async fn sync_autohand_docs() -> Result<DocsSyncResult, String>

#[tauri::command]
async fn search_autohand_docs(query: String) -> Result<Vec<DocSearchResult>, String>

#[tauri::command]
async fn get_autohand_doc(slug: String) -> Result<DocContent, String>

#[tauri::command]
async fn get_autohand_docs_status() -> Result<DocsStatus, String>

#[tauri::command]
async fn clear_autohand_docs_cache() -> Result<(), String>
```

**Models: `docs.rs`**

```rust
#[derive(Serialize, Deserialize)]
pub struct DocSearchResult {
    pub slug: String,
    pub title: String,
    pub category: String,
    pub snippet: String,  // ~120 char context around match
}

#[derive(Serialize, Deserialize)]
pub struct DocContent {
    pub slug: String,
    pub title: String,
    pub category: String,
    pub markdown: String,
}

#[derive(Serialize, Deserialize)]
pub struct DocsStatus {
    pub downloaded: bool,
    pub doc_count: u32,
    pub last_synced: Option<u64>,  // epoch millis
    pub cache_size_bytes: u64,
}

#[derive(Serialize, Deserialize)]
pub struct DocsSyncResult {
    pub synced_count: u32,
    pub failed: Vec<String>,  // slugs that failed
}
```

**Cache location:** `~/.commander/docs/autohand/`
- One `.md` file per doc page, named by slug
- A `_meta.json` file storing last sync timestamp

**Dependencies:**
- `reqwest` (already in Cargo.toml for HTTP)
- `htmd` crate for HTML-to-markdown conversion

### Frontend

**1. SearchForm rewrite (`search-form.tsx`)**

Transform from placeholder to functional component:
- Controlled input with `value` + `onChange`
- Debounced search (300ms) — calls `invoke('search_autohand_docs', { query })`
- Floating results panel (absolute positioned below input, max 6 results)
- Each result shows: title, category badge, snippet
- Click result → calls `onDocSelect(slug)` callback
- Escape or click outside → close results
- Empty query → close results
- If no docs cached, show "Download docs in Settings" hint instead of results

**Results panel styling:**
- `absolute top-full left-0 right-0 z-50`
- `rounded-lg border border-border bg-popover shadow-lg`
- Each item: title (font-medium), category (text-xs muted badge), snippet (text-xs text-muted-foreground truncate)
- Keyboard navigation: arrow up/down, Enter to select

**2. DocsViewer component (`DocsViewer.tsx`)**

Renders when a doc is selected from search. Replaces the main content area.

Structure:
```
┌─────────────────────────────────────┐
│ ← Back   │ Category > Title        │
├─────────────────────────────────────┤
│                                     │
│  [Rendered Markdown]                │
│  - Headings styled                  │
│  - Code blocks with highlighting    │
│  - Links open in browser            │
│  - Tables, lists, etc.              │
│                                     │
└─────────────────────────────────────┘
```

- Uses `react-markdown` + `rehype-highlight` (or `rehype-prism`) for code syntax highlighting
- Wrapped in a ScrollArea for long docs
- Back button returns to previous view (chat/welcome)
- Links within docs that point to other autohand docs → navigate in-app
- External links → open in system browser via Tauri opener

**3. DocsSettings component (`settings/DocsSettings.tsx`)**

New "Docs" tab in Settings modal.

Content:
- **Header:** "Autohand Documentation"
- **Description:** "Keep a local copy of the Autohand docs for instant search and offline reading."
- **Sync button:** "Sync Documentation" / "Syncing..." with spinner
- **Status line:** "5 docs synced, last updated 2 hours ago" or "Not yet synced"
- **Cache info:** "Cache size: 42 KB"
- **Clear button:** "Clear Cache" (destructive style, with confirmation)
- **Auto-sync toggle:** "Sync on app launch" — auto-downloads docs when Commander starts

### State Flow

```
User types in search → debounce 300ms → invoke('search_autohand_docs') → results
User clicks result → App sets activeDoc = { slug } → DocsViewer renders
DocsViewer calls invoke('get_autohand_doc', { slug }) → renders markdown
User clicks Back → App clears activeDoc → returns to previous view
```

### Settings Data Model

Add to `AppSettings`:
```typescript
docs_auto_sync?: boolean;  // sync on app launch
```

Add to `SettingsTab` union:
```typescript
export type SettingsTab = ... | 'docs';
```

### App.tsx Integration

- New state: `activeDoc: { slug: string } | null`
- SearchForm gets `onDocSelect` prop
- When `activeDoc` is set, render `DocsViewer` instead of ProjectView/Welcome
- DocsViewer's back button sets `activeDoc = null`

### Auto-sync on Launch

If `docs_auto_sync` is enabled in settings, App.tsx fires `invoke('sync_autohand_docs')` on mount (non-blocking, silent — no toast unless it fails).

## Testing

- **Backend:** Unit tests for `search_docs` (substring matching, ranking, empty query)
- **Backend:** Integration test for `download_all_docs` with mock HTTP responses
- **Frontend:** Test SearchForm renders results, keyboard navigation, doc selection
- **Frontend:** Test DocsViewer renders markdown content, back navigation

## Dependencies to Add

**Rust (Cargo.toml):**
- `htmd = "0.4"` — HTML to markdown conversion

**Frontend (package.json):**
- `react-markdown` — Markdown renderer
- `rehype-highlight` — Code syntax highlighting in markdown
- `remark-gfm` — GitHub Flavored Markdown (tables, strikethrough)
