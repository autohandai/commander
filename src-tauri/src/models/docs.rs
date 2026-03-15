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
