use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIAgent {
    pub name: String,
    pub command: String,
    pub display_name: String,
    pub available: bool,
    pub enabled: bool,
    pub error_message: Option<String>,
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub upgrade_available: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub agents: Vec<AIAgent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSettings {
    pub enabled: bool,
    pub model: Option<String>,
    pub sandbox_mode: bool,
    pub auto_approval: bool,
    pub session_timeout_minutes: u32,
    pub output_format: String,
    pub debug_mode: bool,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            model: None,
            sandbox_mode: false,
            auto_approval: false,
            session_timeout_minutes: 30,
            output_format: "markdown".to_string(),
            debug_mode: false,
            max_tokens: None,
            temperature: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllAgentSettings {
    pub claude: AgentSettings,
    pub codex: AgentSettings,
    pub gemini: AgentSettings,
    pub max_concurrent_sessions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub content: String,
    pub role: String, // "user" or "assistant"
    pub timestamp: i64,
    pub agent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub session_id: String,
    pub content: String,
    pub finished: bool,
}
