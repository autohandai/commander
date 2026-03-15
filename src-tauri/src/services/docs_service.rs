use crate::models::docs::{DocContent, DocSearchResult, DocsStatus, DocsSyncResult};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const SEARCH_INDEX_URL: &str = "https://autohand.ai/docs/search-index.json";
const DOCS_MD_BASE: &str = "https://autohand.ai/docs-md";
const META_FILE: &str = "_meta.json";
const INDEX_FILE: &str = "search-index.json";

// -- search index types --

#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
struct SearchIndexEntry {
    title: String,
    content: String,
    url: String,
    anchor: String,
}

// -- cache directory --

fn cache_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    Ok(home.join(".commander").join("docs").join("autohand"))
}

fn md_cache_dir() -> Result<PathBuf, String> {
    Ok(cache_dir()?.join("pages"))
}

// -- public API --

/// Sync: download search index + all markdown pages for offline use.
pub async fn sync_docs() -> Result<DocsSyncResult, String> {
    let dir = cache_dir()?;
    let pages_dir = md_cache_dir()?;
    std::fs::create_dir_all(&pages_dir)
        .map_err(|e| format!("Failed to create docs cache: {e}"))?;

    let client = build_client()?;

    // 1. Download search index
    let index = fetch_search_index(&client).await?;
    let index_json = serde_json::to_string_pretty(&index)
        .map_err(|e| format!("Serialize index: {e}"))?;
    std::fs::write(dir.join(INDEX_FILE), &index_json)
        .map_err(|e| format!("Write index: {e}"))?;

    // 2. Collect unique page URLs and download each markdown file
    let unique_pages = collect_unique_pages(&index);
    let mut synced: u32 = 0;
    let mut failed: Vec<String> = Vec::new();

    for (url_path, _title) in &unique_pages {
        let md_url = html_url_to_md_url(url_path);
        let file_path = url_to_cache_path(&pages_dir, url_path);

        if let Some(parent) = file_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        match fetch_text(&client, &md_url).await {
            Ok(md) => {
                let _ = std::fs::write(&file_path, &md);
                synced += 1;
            }
            Err(e) => {
                eprintln!("Failed to sync {url_path}: {e}");
                failed.push(url_path.clone());
            }
        }
    }

    // 3. Write meta
    write_meta(&dir)?;

    Ok(DocsSyncResult {
        synced_count: synced,
        failed,
    })
}

/// Search docs using the search index. Online-first, falls back to cached index.
pub async fn search_docs(query: &str) -> Result<Vec<DocSearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let index = load_search_index().await?;
    Ok(fuzzy_search(&index, query))
}

/// Get full markdown for a doc page. Online-first, falls back to cached file.
pub async fn get_doc(slug: &str) -> Result<DocContent, String> {
    // slug is the URL path portion like "getting-started/first-session"
    // or "working-with-autohand-code/cli"
    let url_path = format!("/docs/{}.html", slug);

    // Try online first
    let client = build_client().ok();
    if let Some(client) = &client {
        let md_url = html_url_to_md_url(&url_path);
        if let Ok(markdown) = fetch_text(client, &md_url).await {
            let (title, _source) = extract_frontmatter(&markdown);
            let category = category_from_slug(slug);
            let body = strip_front_matter(&markdown).to_string();
            return Ok(DocContent {
                slug: slug.to_string(),
                title: title.unwrap_or_else(|| slug.to_string()),
                category,
                markdown: body,
            });
        }
    }

    // Fallback: read from local cache
    let pages_dir = md_cache_dir()?;
    let file_path = url_to_cache_path(&pages_dir, &url_path);
    let markdown = std::fs::read_to_string(&file_path)
        .map_err(|_| "Doc not available. Check your connection or sync docs in Settings.".to_string())?;

    let (title, _source) = extract_frontmatter(&markdown);
    let category = category_from_slug(slug);
    let body = strip_front_matter(&markdown).to_string();

    Ok(DocContent {
        slug: slug.to_string(),
        title: title.unwrap_or_else(|| slug.to_string()),
        category,
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

    let pages_dir = md_cache_dir()?;
    let mut doc_count: u32 = 0;
    let mut cache_size: u64 = 0;

    count_md_files(&pages_dir, &mut doc_count, &mut cache_size);

    // Also count the index file
    if let Ok(meta) = std::fs::metadata(dir.join(INDEX_FILE)) {
        cache_size += meta.len();
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

// -- internal helpers --

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))
}

async fn fetch_text(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Fetch failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| format!("Read body: {e}"))
}

async fn fetch_search_index(client: &reqwest::Client) -> Result<Vec<SearchIndexEntry>, String> {
    let text = fetch_text(client, SEARCH_INDEX_URL).await?;
    serde_json::from_str(&text).map_err(|e| format!("Parse search index: {e}"))
}

/// Load search index: try online first, fall back to cached.
async fn load_search_index() -> Result<Vec<SearchIndexEntry>, String> {
    // Try online
    if let Ok(client) = build_client() {
        if let Ok(index) = fetch_search_index(&client).await {
            // Cache it silently
            if let Ok(dir) = cache_dir() {
                let _ = std::fs::create_dir_all(&dir);
                let _ = serde_json::to_string(&index)
                    .map(|s| std::fs::write(dir.join(INDEX_FILE), s));
            }
            return Ok(index);
        }
    }

    // Fall back to cached
    let dir = cache_dir()?;
    let path = dir.join(INDEX_FILE);
    let text = std::fs::read_to_string(&path)
        .map_err(|_| "No search index available. Check your connection or sync docs in Settings.".to_string())?;
    serde_json::from_str(&text).map_err(|e| format!("Parse cached index: {e}"))
}

/// Convert an HTML URL path to the corresponding docs-md URL.
/// e.g. "/docs/getting-started/first-session.html" -> "https://autohand.ai/docs-md/getting-started/first-session.md"
fn html_url_to_md_url(url_path: &str) -> String {
    let stripped = url_path
        .strip_prefix("/docs/")
        .unwrap_or(url_path)
        .strip_suffix(".html")
        .unwrap_or(url_path);
    format!("{DOCS_MD_BASE}/{stripped}.md")
}

/// Convert a URL path to a local cache file path.
/// e.g. "/docs/getting-started/first-session.html" -> pages_dir/getting-started/first-session.md
fn url_to_cache_path(pages_dir: &PathBuf, url_path: &str) -> PathBuf {
    let stripped = url_path
        .strip_prefix("/docs/")
        .unwrap_or(url_path)
        .strip_suffix(".html")
        .unwrap_or(url_path);
    pages_dir.join(format!("{stripped}.md"))
}

/// Convert a URL path to a slug for the frontend.
/// e.g. "/docs/getting-started/first-session.html" -> "getting-started/first-session"
fn url_to_slug(url_path: &str) -> String {
    url_path
        .strip_prefix("/docs/")
        .unwrap_or(url_path)
        .strip_suffix(".html")
        .unwrap_or(url_path)
        .to_string()
}

/// Collect unique page URLs from the search index (dedup by URL).
fn collect_unique_pages(index: &[SearchIndexEntry]) -> Vec<(String, String)> {
    let mut seen = std::collections::HashSet::new();
    let mut pages = Vec::new();
    for entry in index {
        if seen.insert(entry.url.clone()) {
            pages.push((entry.url.clone(), entry.title.clone()));
        }
    }
    pages
}

/// Derive a human-readable category from the slug path.
fn category_from_slug(slug: &str) -> String {
    let parts: Vec<&str> = slug.split('/').collect();
    match parts.first().copied() {
        Some("getting-started") => "Getting Started".to_string(),
        Some("guides") => {
            if parts.len() > 1 && parts[1] == "beginners" {
                "Beginner Guides".to_string()
            } else {
                "Guides".to_string()
            }
        }
        Some("integrations") => "Integrations".to_string(),
        Some("use-cases") => "Use Cases".to_string(),
        Some("working-with-autohand-code") => "Working with Autohand".to_string(),
        Some("index") => "Overview".to_string(),
        _ => "Docs".to_string(),
    }
}

/// Fuzzy search over the search index. Supports multi-word queries.
/// Scoring: title match > content match, exact > contains > word overlap.
fn fuzzy_search(index: &[SearchIndexEntry], query: &str) -> Vec<DocSearchResult> {
    let query_lower = query.to_lowercase();
    let query_words: Vec<&str> = query_lower.split_whitespace().collect();

    if query_words.is_empty() {
        return Vec::new();
    }

    let mut scored: Vec<(f64, &SearchIndexEntry)> = Vec::new();

    for entry in index {
        let title_lower = entry.title.to_lowercase();
        let content_lower = entry.content.to_lowercase();

        let mut score: f64 = 0.0;

        // Exact phrase match in title (highest)
        if title_lower.contains(&query_lower) {
            score += 10.0;
        }
        // Exact phrase match in content
        if content_lower.contains(&query_lower) {
            score += 5.0;
        }

        // Individual word matching
        for word in &query_words {
            if word.len() < 2 {
                continue;
            }
            if title_lower.contains(word) {
                score += 3.0;
            }
            if content_lower.contains(word) {
                score += 1.0;
            }
        }

        if score > 0.0 {
            scored.push((score, entry));
        }
    }

    // Sort by score descending, then by title
    scored.sort_by(|a, b| {
        b.0.partial_cmp(&a.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.1.title.cmp(&b.1.title))
    });

    // Dedup by slug (keep highest-scored entry per page)
    let mut seen_slugs = std::collections::HashSet::new();
    scored
        .into_iter()
        .filter_map(|(_, entry)| {
            let slug = url_to_slug(&entry.url);
            if seen_slugs.insert(slug.clone()) {
                let category = category_from_slug(&slug);
                let snippet = if entry.content.len() > 140 {
                    format!("{}...", &entry.content[..140])
                } else {
                    entry.content.clone()
                };
                Some(DocSearchResult {
                    slug,
                    title: entry.title.clone(),
                    category,
                    snippet,
                })
            } else {
                None
            }
        })
        .take(12)
        .collect()
}

fn extract_frontmatter(content: &str) -> (Option<String>, Option<String>) {
    if !content.starts_with("---") {
        return (None, None);
    }
    if let Some(end) = content[3..].find("---") {
        let fm = &content[3..3 + end];
        let mut title = None;
        let mut source = None;
        for line in fm.lines() {
            if let Some(val) = line.strip_prefix("title:") {
                title = Some(val.trim().trim_matches('"').to_string());
            }
            if let Some(val) = line.strip_prefix("source:") {
                source = Some(val.trim().to_string());
            }
        }
        return (title, source);
    }
    (None, None)
}

fn strip_front_matter(content: &str) -> &str {
    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let after = end + 6;
            return content.get(after..).unwrap_or(content).trim_start();
        }
    }
    content
}

fn write_meta(dir: &PathBuf) -> Result<(), String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let meta = serde_json::json!({ "last_synced": now });
    std::fs::write(dir.join(META_FILE), meta.to_string())
        .map_err(|e| format!("Write meta: {e}"))
}

fn count_md_files(dir: &PathBuf, count: &mut u32, size: &mut u64) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                count_md_files(&path, count, size);
            } else if path.extension().and_then(|e| e.to_str()) == Some("md") {
                *count += 1;
                *size += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }
    }
}
