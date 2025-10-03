use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CLISession {
    pub id: String,
    pub agent: String,
    pub command: String,
    pub working_dir: Option<String>,
    pub is_active: bool,
    pub created_at: i64,
    pub last_activity: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatus {
    pub active_sessions: Vec<CLISession>,
    pub total_sessions: usize,
}
