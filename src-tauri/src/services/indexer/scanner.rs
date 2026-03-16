use crate::models::indexer::{DailyAgentStats, IndexedSession};
use async_trait::async_trait;

/// A file discovered during a scan pass
#[derive(Debug, Clone)]
pub struct DiscoveredFile {
    pub path: String,
    pub mtime: i64,
    pub size: u64,
}

/// Result of parsing a single file
#[derive(Debug, Clone)]
pub struct ParseResult {
    pub sessions: Vec<IndexedSession>,
}

/// Trait that each agent scanner must implement
#[async_trait]
pub trait AgentScanner: Send + Sync {
    /// Unique identifier for this agent (e.g., "claude", "codex")
    fn agent_id(&self) -> &str;

    /// Human-readable display name
    fn display_name(&self) -> &str;

    /// Home directory for this agent's data
    fn home_dir(&self) -> String;

    /// Whether this agent's data directory exists on this machine
    fn is_available(&self) -> bool;

    /// Discover all files that should be scanned
    async fn discover_files(&self) -> Result<Vec<DiscoveredFile>, String>;

    /// Parse a single file into sessions
    async fn parse_file(&self, path: &str) -> Result<ParseResult, String>;

    /// Optional: return pre-aggregated daily stats (e.g., from Claude's stats-cache.json)
    async fn parse_aggregate_stats(&self) -> Option<Vec<DailyAgentStats>> {
        None
    }
}

/// Truncate a message to ~100 chars at a word boundary for use as a session summary.
pub fn truncate_summary(content: &str) -> String {
    // Take first line only, strip system/XML tags
    let first_line = content.lines().next().unwrap_or(content);
    let clean = first_line.trim();
    if clean.is_empty() {
        return String::new();
    }
    if clean.len() <= 100 {
        return clean.to_string();
    }
    let truncated = &clean[..100];
    if let Some(last_space) = truncated.rfind(' ') {
        format!("{}...", &truncated[..last_space])
    } else {
        format!("{}...", truncated)
    }
}
