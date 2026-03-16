use serde::{Deserialize, Serialize};

/// A single indexed session from any agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexedSession {
    pub id: i64,
    pub agent_id: String,
    pub original_id: String,
    /// If this session was imported (e.g., autohand from claude), tracks the source
    pub source_agent: Option<String>,
    pub session_start: i64,
    pub session_end: Option<i64>,
    pub project_path: Option<String>,
    pub model: Option<String>,
    pub message_count: u32,
    pub source_file: String,
    pub source_file_mtime: i64,
    /// First user message summary (truncated)
    pub summary: Option<String>,
}

/// Pre-aggregated daily stats per agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyAgentStats {
    pub date: String,
    pub agent_id: String,
    pub message_count: u32,
    pub session_count: u32,
    pub total_tokens: u64,
}

/// Per-file scan tracking for incremental indexing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanRecord {
    pub source_file: String,
    pub agent_id: String,
    pub file_mtime: i64,
    pub file_size: u64,
}

/// Agent registry entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRecord {
    pub id: String,
    pub display_name: String,
    pub home_dir: String,
    pub enabled: bool,
}

/// Current indexer status for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexerStatus {
    pub is_running: bool,
    pub last_scan_at: Option<i64>,
    pub total_sessions_indexed: u64,
    pub agents_indexed: Vec<String>,
    pub last_error: Option<String>,
}
