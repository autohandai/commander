# Offline Docs Search & In-App Viewer — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sidebar "Search the docs..." input functional — download Autohand docs for offline use, search them with a floating results panel, and render selected docs in an in-app markdown viewer.

**Architecture:** Rust backend fetches HTML pages from autohand.ai/docs, converts to markdown via `htmd` crate, caches in `~/.commander/docs/autohand/`. Frontend search debounces input and queries the backend. Results shown in a floating dropdown. Clicking a result renders the markdown content in a full-screen in-app viewer using `react-markdown` (already installed).

**Tech Stack:** Rust (`reqwest`, `htmd`, `serde`), React (`react-markdown`, `remark-gfm`), Tailwind CSS, Tauri commands

---

## Chunk 1: Backend — Models, Service, Commands

### Task 1: Add `htmd` dependency

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add htmd to Cargo.toml**

In the `[dependencies]` section, add:

```toml
htmd = "0.5"
```

- [ ] **Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors (warnings OK)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add htmd crate for HTML-to-markdown conversion"
```

---

### Task 2: Create docs model

**Files:**
- Create: `src-tauri/src/models/docs.rs`
- Modify: `src-tauri/src/models/mod.rs`

- [ ] **Step 1: Create the model file**

```rust
// src-tauri/src/models/docs.rs
use serde::{Deserialize, Serialize};

/// A single search result returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocSearchResult {
    pub slug: String,
    pub title: String,
    pub category: String,
    /// ~120 char context around the match
    pub snippet: String,
}

/// Full document content for the in-app viewer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocContent {
    pub slug: String,
    pub title: String,
    pub category: String,
    pub markdown: String,
}

/// Status of the local docs cache.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocsStatus {
    pub downloaded: bool,
    pub doc_count: u32,
    /// Epoch milliseconds of last successful sync
    pub last_synced: Option<u64>,
    pub cache_size_bytes: u64,
}

/// Result after a sync operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocsSyncResult {
    pub synced_count: u32,
    /// Slugs that failed to download
    pub failed: Vec<String>,
}
```

- [ ] **Step 2: Register in models/mod.rs**

Add to `src-tauri/src/models/mod.rs`:

```rust
pub mod docs;
```

(Add after existing module declarations. Do NOT add to the `pub use` block — these types will be used via `models::docs::*`.)

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/models/docs.rs src-tauri/src/models/mod.rs
git commit -m "feat(docs): add docs model types"
```

---

### Task 3: Create docs service

**Files:**
- Create: `src-tauri/src/services/docs_service.rs`
- Modify: `src-tauri/src/services/mod.rs`

- [ ] **Step 1: Create the service file**

```rust
// src-tauri/src/services/docs_service.rs
use crate::models::docs::{DocContent, DocSearchResult, DocsStatus, DocsSyncResult};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

struct DocPage {
    slug: &'static str,
    title: &'static str,
    url: &'static str,
    category: &'static str,
}

const DOC_PAGES: &[DocPage] = &[
    DocPage {
        slug: "quickstart",
        title: "Quickstart Guide",
        url: "https://autohand.ai/docs/quickstart.html",
        category: "Getting Started",
    },
    DocPage {
        slug: "first-session",
        title: "First Session",
        url: "https://autohand.ai/docs/getting-started/first-session.html",
        category: "Getting Started",
    },
    DocPage {
        slug: "cli-reference",
        title: "CLI Reference",
        url: "https://autohand.ai/docs/working-with-autohand-code/cli-reference.html",
        category: "Working with Autohand Code",
    },
    DocPage {
        slug: "configuration",
        title: "Configuration",
        url: "https://autohand.ai/docs/working-with-autohand-code/configuration.html",
        category: "Working with Autohand Code",
    },
    DocPage {
        slug: "ai-model-providers",
        title: "AI Model Providers",
        url: "https://autohand.ai/docs/integrations/ai-model-providers.html",
        category: "Integrations",
    },
];

const META_FILE: &str = "_meta.json";

/// Resolve the docs cache directory: ~/.commander/docs/autohand/
fn cache_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    Ok(home.join(".commander").join("docs").join("autohand"))
}

/// Download all docs from autohand.ai, convert HTML→markdown, cache locally.
pub async fn sync_docs() -> Result<DocsSyncResult, String> {
    let dir = cache_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create docs cache: {e}"))?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let mut synced: u32 = 0;
    let mut failed: Vec<String> = Vec::new();

    for page in DOC_PAGES {
        match download_page(&client, page, &dir).await {
            Ok(()) => synced += 1,
            Err(e) => {
                eprintln!("Failed to sync {}: {e}", page.slug);
                failed.push(page.slug.to_string());
            }
        }
    }

    // Write meta with timestamp
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let meta = serde_json::json!({ "last_synced": now });
    let _ = std::fs::write(dir.join(META_FILE), meta.to_string());

    Ok(DocsSyncResult { synced_count: synced, failed })
}

async fn download_page(
    client: &reqwest::Client,
    page: &DocPage,
    dir: &PathBuf,
) -> Result<(), String> {
    let resp = client
        .get(page.url)
        .send()
        .await
        .map_err(|e| format!("Fetch failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let html = resp.text().await.map_err(|e| format!("Read body: {e}"))?;
    let markdown = htmd::convert(&html).map_err(|e| format!("HTML→MD: {e}"))?;

    // Prepend a YAML-ish header for search metadata
    let content = format!("---\ntitle: {}\ncategory: {}\n---\n\n{}", page.title, page.category, markdown);
    std::fs::write(dir.join(format!("{}.md", page.slug)), content)
        .map_err(|e| format!("Write file: {e}"))?;

    Ok(())
}

/// Search cached docs. Returns matches ranked by title first, then content.
pub fn search_docs(query: &str) -> Result<Vec<DocSearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let dir = cache_dir()?;
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let query_lower = query.to_lowercase();
    let mut title_matches: Vec<DocSearchResult> = Vec::new();
    let mut content_matches: Vec<DocSearchResult> = Vec::new();

    for page in DOC_PAGES {
        let file_path = dir.join(format!("{}.md", page.slug));
        let content = match std::fs::read_to_string(&file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Strip front-matter for search
        let body = strip_front_matter(&content);
        let title_lower = page.title.to_lowercase();

        if title_lower.contains(&query_lower) {
            title_matches.push(DocSearchResult {
                slug: page.slug.to_string(),
                title: page.title.to_string(),
                category: page.category.to_string(),
                snippet: make_snippet(body, &query_lower),
            });
        } else if body.to_lowercase().contains(&query_lower) {
            content_matches.push(DocSearchResult {
                slug: page.slug.to_string(),
                title: page.title.to_string(),
                category: page.category.to_string(),
                snippet: make_snippet(body, &query_lower),
            });
        }
    }

    title_matches.append(&mut content_matches);
    Ok(title_matches)
}

/// Get full content of a single doc.
pub fn get_doc(slug: &str) -> Result<DocContent, String> {
    let page = DOC_PAGES
        .iter()
        .find(|p| p.slug == slug)
        .ok_or_else(|| format!("Unknown doc: {slug}"))?;

    let dir = cache_dir()?;
    let file_path = dir.join(format!("{slug}.md"));
    let content = std::fs::read_to_string(&file_path)
        .map_err(|_| "Doc not downloaded yet. Sync docs first in Settings.".to_string())?;

    let body = strip_front_matter(&content).to_string();

    Ok(DocContent {
        slug: slug.to_string(),
        title: page.title.to_string(),
        category: page.category.to_string(),
        markdown: body,
    })
}

/// Get cache status.
pub fn get_status() -> Result<DocsStatus, String> {
    let dir = cache_dir()?;

    if !dir.exists() {
        return Ok(DocsStatus {
            downloaded: false,
            doc_count: 0,
            last_synced: None,
            cache_size_bytes: 0,
        });
    }

    let mut doc_count: u32 = 0;
    let mut cache_size: u64 = 0;

    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".md") {
                doc_count += 1;
                cache_size += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }

    let last_synced = std::fs::read_to_string(dir.join(META_FILE))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v["last_synced"].as_u64());

    Ok(DocsStatus {
        downloaded: doc_count > 0,
        doc_count,
        last_synced,
        cache_size_bytes: cache_size,
    })
}

/// Clear the docs cache.
pub fn clear_cache() -> Result<(), String> {
    let dir = cache_dir()?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to clear cache: {e}"))?;
    }
    Ok(())
}

// ── helpers ──

fn strip_front_matter(content: &str) -> &str {
    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let after = end + 6; // skip both "---" delimiters
            return content.get(after..).unwrap_or(content).trim_start();
        }
    }
    content
}

fn make_snippet(body: &str, query: &str) -> String {
    let body_lower = body.to_lowercase();
    if let Some(pos) = body_lower.find(query) {
        let start = pos.saturating_sub(40);
        let end = (pos + query.len() + 80).min(body.len());
        // Ensure we're on char boundaries
        let start = body.floor_char_boundary(start);
        let end = body.ceil_char_boundary(end);
        let mut snippet = body[start..end].to_string();
        if start > 0 {
            snippet = format!("...{snippet}");
        }
        if end < body.len() {
            snippet = format!("{snippet}...");
        }
        snippet.replace('\n', " ")
    } else {
        body.chars().take(120).collect::<String>().replace('\n', " ")
    }
}
```

- [ ] **Step 2: Register in services/mod.rs**

Add to `src-tauri/src/services/mod.rs`:

```rust
pub mod docs_service;
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles (may have warnings about unused, that's fine — commands aren't wired yet)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/docs_service.rs src-tauri/src/services/mod.rs
git commit -m "feat(docs): add docs service — download, search, cache"
```

---

### Task 4: Create docs commands + register in lib.rs

**Files:**
- Create: `src-tauri/src/commands/docs_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create commands file**

```rust
// src-tauri/src/commands/docs_commands.rs
use crate::models::docs::{DocContent, DocSearchResult, DocsStatus, DocsSyncResult};
use crate::services::docs_service;

#[tauri::command]
pub async fn sync_autohand_docs() -> Result<DocsSyncResult, String> {
    docs_service::sync_docs().await
}

#[tauri::command]
pub async fn search_autohand_docs(query: String) -> Result<Vec<DocSearchResult>, String> {
    docs_service::search_docs(&query)
}

#[tauri::command]
pub async fn get_autohand_doc(slug: String) -> Result<DocContent, String> {
    docs_service::get_doc(&slug)
}

#[tauri::command]
pub async fn get_autohand_docs_status() -> Result<DocsStatus, String> {
    docs_service::get_status()
}

#[tauri::command]
pub async fn clear_autohand_docs_cache() -> Result<(), String> {
    docs_service::clear_cache()
}
```

- [ ] **Step 2: Register in commands/mod.rs**

Add after the existing module declarations:

```rust
pub mod docs_commands;
```

And in the `pub use` block:

```rust
pub use docs_commands::*;
```

- [ ] **Step 3: Register commands in lib.rs**

In `src-tauri/src/lib.rs`, find the `.invoke_handler(tauri::generate_handler![` block. Add before the closing `])`:

```rust
            sync_autohand_docs,
            search_autohand_docs,
            get_autohand_doc,
            get_autohand_docs_status,
            clear_autohand_docs_cache,
```

Add them right before `trigger_reindex` (the last existing entry).

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with zero errors

- [ ] **Step 5: Run all Rust tests**

Run: `cd src-tauri && cargo test`
Expected: All existing tests pass, no regressions

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/docs_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(docs): add Tauri commands for docs sync, search, view"
```

---

## Chunk 2: Frontend — Search, Viewer, Settings

### Task 5: Rewrite SearchForm with functional search + floating results

**Files:**
- Modify: `src/components/search-form.tsx`
- Modify: `src/components/app-sidebar.tsx` (pass `onDocSelect` callback)

- [ ] **Step 1: Rewrite search-form.tsx**

Replace the entire file with a functional search component:

```tsx
// src/components/search-form.tsx
import { useState, useRef, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Search, FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
} from "@/components/ui/sidebar"

interface DocSearchResult {
  slug: string
  title: string
  category: string
  snippet: string
}

interface SearchFormProps extends React.ComponentProps<"form"> {
  onDocSelect?: (slug: string) => void
}

export function SearchForm({ onDocSelect, ...props }: SearchFormProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DocSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [docsAvailable, setDocsAvailable] = useState<boolean | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Check if docs are downloaded
  useEffect(() => {
    invoke<{ downloaded: boolean }>("get_autohand_docs_status")
      .then((s) => setDocsAvailable(s.downloaded))
      .catch(() => setDocsAvailable(false))
  }, [])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setOpen(false)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const hits = await invoke<DocSearchResult[]>("search_autohand_docs", { query: query.trim() })
        setResults(hits)
        setSelectedIndex(0)
        setOpen(hits.length > 0 || !docsAvailable)
      } catch {
        setResults([])
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query, docsAvailable])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleSelect = useCallback((slug: string) => {
    setOpen(false)
    setQuery("")
    onDocSelect?.(slug)
  }, [onDocSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex].slug)
      }
    } else if (e.key === "Escape") {
      setOpen(false)
      inputRef.current?.blur()
    }
  }, [open, results, selectedIndex, handleSelect])

  return (
    <div ref={containerRef} className="relative">
      <form {...props} onSubmit={(e) => e.preventDefault()}>
        <SidebarGroup className="py-0">
          <SidebarGroupContent className="relative">
            <Label htmlFor="search" className="sr-only">Search</Label>
            <SidebarInput
              ref={inputRef}
              id="search"
              placeholder="Search the docs..."
              className="pl-8 pr-7"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (query.trim() && (results.length > 0 || !docsAvailable)) setOpen(true) }}
            />
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 select-none opacity-50" />
            {query && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 opacity-50 hover:opacity-100"
                onClick={() => { setQuery(""); setResults([]); setOpen(false) }}
              >
                <X className="size-3" />
              </button>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </form>

      {/* Floating results panel */}
      {open && (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 max-h-[320px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {results.length > 0 ? (
            results.slice(0, 8).map((result, i) => (
              <button
                key={result.slug}
                type="button"
                className={cn(
                  "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                  i === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
                onClick={() => handleSelect(result.slug)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="flex items-center gap-2">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{result.title}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {result.category}
                  </span>
                </div>
                <p className="pl-5.5 text-xs text-muted-foreground line-clamp-1">{result.snippet}</p>
              </button>
            ))
          ) : !docsAvailable ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              <p>Docs not downloaded yet.</p>
              <p className="text-xs mt-1">Go to Settings → Docs to sync.</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update app-sidebar.tsx — pass onDocSelect**

In `src/components/app-sidebar.tsx`, add `onDocSelect` to the `AppSidebarProps` interface:

```typescript
onDocSelect?: (slug: string) => void
```

Destructure it in the component function and pass to SearchForm:

```tsx
<SearchForm onDocSelect={onDocSelect} />
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "search-form|app-sidebar" | grep -v __tests__`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/components/search-form.tsx src/components/app-sidebar.tsx
git commit -m "feat(docs): functional search with floating results panel"
```

---

### Task 6: Create DocsViewer component

**Files:**
- Create: `src/components/DocsViewer.tsx`

- [ ] **Step 1: Check if rehype-highlight is installed, install if needed**

Run: `grep rehype-highlight package.json`

If not found: `bun add rehype-highlight`

- [ ] **Step 2: Create DocsViewer.tsx**

```tsx
// src/components/DocsViewer.tsx
import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowLeft, Loader2, ExternalLink } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

interface DocContent {
  slug: string
  title: string
  category: string
  markdown: string
}

interface DocsViewerProps {
  slug: string
  onBack: () => void
}

export function DocsViewer({ slug, onBack }: DocsViewerProps) {
  const [doc, setDoc] = useState<DocContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    invoke<DocContent>("get_autohand_doc", { slug })
      .then(setDoc)
      .catch((e) => setError(typeof e === "string" ? e : "Failed to load doc"))
      .finally(() => setLoading(false))
  }, [slug])

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        {doc && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-muted-foreground">{doc.category}</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-sm font-medium truncate">{doc.title}</span>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center p-4">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={onBack}>Go back</Button>
        </div>
      ) : doc ? (
        <ScrollArea className="flex-1">
          <article className="prose prose-sm dark:prose-invert max-w-3xl mx-auto px-6 py-8">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...rest }) => {
                  // Internal doc links stay in-app (future enhancement)
                  // External links open in system browser
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1"
                      {...rest}
                    >
                      {children}
                      <ExternalLink className="inline size-3 opacity-50" />
                    </a>
                  )
                },
              }}
            >
              {doc.markdown}
            </ReactMarkdown>
          </article>
        </ScrollArea>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep DocsViewer`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/DocsViewer.tsx
git commit -m "feat(docs): in-app markdown docs viewer"
```

---

### Task 7: Wire DocsViewer into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add state and rendering logic**

In `AppContent`, add state:

```typescript
const [activeDocSlug, setActiveDocSlug] = useState<string | null>(null)
```

Import DocsViewer:

```typescript
import { DocsViewer } from "@/components/DocsViewer"
```

Pass `onDocSelect` to the sidebar:

```tsx
<AppSidebar
  ...existing props...
  onDocSelect={(slug) => setActiveDocSlug(slug)}
/>
```

In the main content area, add a priority check ABOVE the `currentProject ? ... : ...` ternary. When `activeDocSlug` is set, render DocsViewer instead of ProjectView or Welcome:

```tsx
<div className="flex-1 flex flex-col min-h-0">
  {activeDocSlug ? (
    <DocsViewer slug={activeDocSlug} onBack={() => setActiveDocSlug(null)} />
  ) : currentProject ? (
    <ProjectView ... />
  ) : (
    <ScrollArea ...>
      {/* welcome screen */}
    </ScrollArea>
  )}
</div>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep App.tsx | grep -v __tests__`
Expected: Only the pre-existing `projectPath` unused warning

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(docs): wire DocsViewer into main app layout"
```

---

### Task 8: Create DocsSettings component

**Files:**
- Create: `src/components/settings/DocsSettings.tsx`

- [ ] **Step 1: Create the settings component**

```tsx
// src/components/settings/DocsSettings.tsx
import { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { BookOpen, Download, Loader2, Trash2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

interface DocsStatus {
  downloaded: boolean
  doc_count: number
  last_synced: number | null
  cache_size_bytes: number
}

interface DocsSettingsProps {
  autoSync: boolean
  onAutoSyncChange: (enabled: boolean) => void
}

export function DocsSettings({ autoSync, onAutoSyncChange }: DocsSettingsProps) {
  const [status, setStatus] = useState<DocsStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [clearing, setClearing] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const s = await invoke<DocsStatus>("get_autohand_docs_status")
      setStatus(s)
    } catch (e) {
      console.error("Failed to load docs status:", e)
    }
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await invoke("sync_autohand_docs")
      await loadStatus()
    } catch (e) {
      console.error("Sync failed:", e)
    } finally {
      setSyncing(false)
    }
  }

  const handleClear = async () => {
    setClearing(true)
    try {
      await invoke("clear_autohand_docs_cache")
      await loadStatus()
    } catch (e) {
      console.error("Clear failed:", e)
    } finally {
      setClearing(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  const formatTime = (epoch: number) => {
    const d = new Date(epoch)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="size-5" />
          Autohand Documentation
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Keep a local copy of the Autohand docs for instant search and offline reading.
        </p>
      </div>

      {/* Sync button + status */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button onClick={handleSync} disabled={syncing} size="sm" className="gap-2">
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {syncing ? "Syncing..." : "Sync Documentation"}
          </Button>
          {status?.downloaded && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={clearing}
              className="gap-2 text-muted-foreground"
            >
              {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Clear Cache
            </Button>
          )}
        </div>

        {status && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {status.downloaded ? (
              <>
                <p>{status.doc_count} docs cached ({formatBytes(status.cache_size_bytes)})</p>
                {status.last_synced && <p>Last synced {formatTime(status.last_synced)}</p>}
              </>
            ) : (
              <p>No docs downloaded yet. Click Sync to get started.</p>
            )}
          </div>
        )}
      </div>

      {/* Auto-sync toggle */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
        <div className="space-y-0.5">
          <Label htmlFor="docs-auto-sync" className="text-sm font-medium">Sync on launch</Label>
          <p className="text-xs text-muted-foreground">Automatically update docs when Commander starts.</p>
        </div>
        <Switch
          id="docs-auto-sync"
          checked={autoSync}
          onCheckedChange={onAutoSyncChange}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep DocsSettings`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/DocsSettings.tsx
git commit -m "feat(docs): DocsSettings component for Settings modal"
```

---

### Task 9: Wire DocsSettings into SettingsModal + settings context

**Files:**
- Modify: `src/types/settings.ts` — Add `'docs'` to SettingsTab
- Modify: `src/contexts/settings-context.tsx` — Add `docs_auto_sync` field
- Modify: `src/components/SettingsModal.tsx` — Add Docs tab to menu + render DocsSettings

- [ ] **Step 1: Update SettingsTab type**

In `src/types/settings.ts`, change the SettingsTab union:

```typescript
export type SettingsTab = 'general' | 'code' | 'git' | 'chat' | 'prompts' | 'agents' | 'llms' | 'shortcuts' | 'subagents' | 'autohand' | 'docs';
```

Add to `AppSettings` interface:

```typescript
docs_auto_sync?: boolean;
```

- [ ] **Step 2: Update settings context**

In `src/contexts/settings-context.tsx`, add `docs_auto_sync` to the default settings object:

```typescript
docs_auto_sync: false,
```

And in the settings merge logic, add:

```typescript
docs_auto_sync: appSettings.docs_auto_sync ?? false,
```

- [ ] **Step 3: Add Docs tab to SettingsModal**

In `src/components/SettingsModal.tsx`:

1. Import DocsSettings:
   ```typescript
   import { DocsSettings } from "@/components/settings/DocsSettings"
   ```

2. Import the BookOpen icon:
   ```typescript
   import { BookOpen } from "lucide-react"
   ```
   (Add to existing lucide-react import)

3. Add to `menuItems` array (after the `shortcuts` entry, before closing):
   ```typescript
   { id: 'docs' as SettingsTab, label: 'Docs', icon: BookOpen },
   ```

4. Add temp state for docs_auto_sync near the other temp state vars:
   ```typescript
   const [tempDocsAutoSync, setTempDocsAutoSync] = useState(false)
   ```

5. Initialize it from loaded settings (in the useEffect that loads settings):
   ```typescript
   setTempDocsAutoSync(loaded.docs_auto_sync ?? false)
   ```

6. Add rendering in the right panel (after the last `activeTab === '...'` block):
   ```tsx
   {activeTab === 'docs' && (
     <DocsSettings
       autoSync={tempDocsAutoSync}
       onAutoSyncChange={(enabled) => {
         setTempDocsAutoSync(enabled)
         // Auto-save immediately like theme
         void invoke('save_app_settings', {
           settings: { ...currentSettingsRef(), docs_auto_sync: enabled }
         })
       }}
     />
   )}
   ```

   Where `currentSettingsRef()` is the function that builds the current settings object. Look for the existing `save_app_settings` pattern used by the theme auto-save for reference.

- [ ] **Step 4: Add auto-sync on launch in App.tsx**

In `src/App.tsx`, add a useEffect that syncs docs on launch if the setting is enabled:

```typescript
// Auto-sync docs on launch
useEffect(() => {
  if (settings.docs_auto_sync) {
    invoke('sync_autohand_docs').catch(() => {})
  }
}, []) // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -E "SettingsModal|settings-context|settings\.ts" | grep -v __tests__`
Expected: No new errors

- [ ] **Step 6: Verify frontend tests pass**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: No regressions

- [ ] **Step 7: Commit**

```bash
git add src/types/settings.ts src/contexts/settings-context.tsx src/components/SettingsModal.tsx src/App.tsx
git commit -m "feat(docs): wire Docs tab into Settings, add auto-sync on launch"
```

---

## Chunk 3: Prose styling + final polish

### Task 10: Add prose styling for markdown viewer

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Add tailwind prose styles**

Check if `@tailwindcss/typography` is installed:

Run: `grep typography package.json`

If not installed: `bun add -D @tailwindcss/typography`

Then in `src/index.css`, ensure the typography plugin is imported (for Tailwind v4):

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```

If already using v3-style config, add `require('@tailwindcss/typography')` to plugins in tailwind config.

- [ ] **Step 2: Verify the DocsViewer prose classes render properly**

Run: `bun run dev` and open the app, navigate to a doc.
Expected: Headings, paragraphs, code blocks, lists render with proper typography.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb src/index.css
git commit -m "feat(docs): add typography plugin for markdown rendering"
```

---

### Task 11: Full integration test

- [ ] **Step 1: Verify Rust compiles clean**

Run: `cd src-tauri && cargo check 2>&1 | grep warning`
Expected: Zero warnings from docs-related code

- [ ] **Step 2: Verify Rust tests pass**

Run: `cd src-tauri && cargo test`
Expected: All tests pass

- [ ] **Step 3: Verify frontend tests pass**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 4: Manual test — full flow**

1. Open Commander
2. Go to Settings → Docs tab
3. Click "Sync Documentation" → should download docs, show "5 docs cached"
4. Type in sidebar search → floating results appear
5. Click a result → DocsViewer opens with rendered markdown
6. Click Back → returns to previous view
7. Enable "Sync on launch" → restart app → docs sync silently on start

- [ ] **Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(docs): complete offline docs search and in-app viewer"
```
