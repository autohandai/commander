use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_messages: usize,
    pub total_sessions: usize,
    pub total_tokens: u64,
    pub agents_used: HashMap<String, usize>,
    pub daily_activity: Vec<DailyActivity>,
    pub current_streak: u32,
    pub longest_streak: u32,
    pub memory_files_count: usize,
    pub available_agents: Vec<DashboardAgentInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyActivity {
    pub date: String,
    pub message_count: usize,
    pub token_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardAgentInfo {
    pub name: String,
    pub available: bool,
    pub version: Option<String>,
}

impl Default for DashboardStats {
    fn default() -> Self {
        Self {
            total_messages: 0,
            total_sessions: 0,
            total_tokens: 0,
            agents_used: HashMap::new(),
            daily_activity: Vec::new(),
            current_streak: 0,
            longest_streak: 0,
            memory_files_count: 0,
            available_agents: Vec::new(),
        }
    }
}
