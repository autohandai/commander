use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::models::protocol::ProtocolMode;

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
    pub protocol: Option<ProtocolMode>,
    pub is_default: bool,
    pub removable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub agents: Vec<AIAgent>,
}

/// An agent discovered on the system that could be added as a custom agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedAgent {
    pub binary: String,
    pub display_name: String,
    pub version: Option<String>,
    pub supports_rpc: bool,
    pub supports_acp: bool,
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
    /// Transport override: "cli-flags", "json-rpc", or "acp".
    /// When None, the built-in default is used.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub transport: Option<String>,
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
            transport: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CustomAgentDefinition {
    pub id: String,
    pub name: String,
    pub command: String,
    pub transport: String,
    pub protocol: Option<String>,
    pub prompt_mode: String,
    pub supports_model: bool,
    pub supports_output_format: bool,
    pub supports_session_timeout: bool,
    pub supports_max_tokens: bool,
    pub supports_temperature: bool,
    pub supports_sandbox_mode: bool,
    pub supports_auto_approval: bool,
    pub supports_debug_mode: bool,
    #[serde(default)]
    pub settings: AgentSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllAgentSettings {
    #[serde(default)]
    pub autohand: AgentSettings,
    #[serde(default)]
    pub claude: AgentSettings,
    #[serde(default)]
    pub codex: AgentSettings,
    #[serde(default)]
    pub gemini: AgentSettings,
    #[serde(default)]
    pub ollama: AgentSettings,
    #[serde(default)]
    pub custom_agents: Vec<CustomAgentDefinition>,
    #[serde(default = "default_max_concurrent_sessions")]
    pub max_concurrent_sessions: u32,
}

fn default_max_concurrent_sessions() -> u32 {
    10
}

impl Default for AllAgentSettings {
    fn default() -> Self {
        Self {
            claude: AgentSettings::default(),
            codex: AgentSettings::default(),
            gemini: AgentSettings::default(),
            autohand: AgentSettings::default(),
            ollama: AgentSettings::default(),
            custom_agents: Vec::new(),
            max_concurrent_sessions: default_max_concurrent_sessions(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentRegistryEntry {
    pub id: String,
    pub label: String,
    pub command: String,
    pub transport: String,
    pub protocol: Option<String>,
    pub enabled: bool,
    #[serde(default)]
    pub settings: AgentSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentRegistrySettings {
    pub version: u32,
    pub max_concurrent_sessions: u32,
    pub agents: HashMap<String, AgentRegistryEntry>,
    #[serde(default)]
    pub custom_agents: Vec<CustomAgentDefinition>,
}

#[allow(dead_code)]
pub fn normalize_legacy_agent_registry(
    enablement: &HashMap<String, bool>,
    legacy: &AllAgentSettings,
) -> AgentRegistrySettings {
    let mut agents = HashMap::new();
    let builtins = [
        ("autohand", "Autohand Code", "autohand", "json-rpc", Some("hybrid".to_string()), &legacy.autohand),
        ("claude", "Claude Code CLI", "claude", "cli-flags", None, &legacy.claude),
        ("codex", "Codex", "codex", "cli-flags", None, &legacy.codex),
        ("gemini", "Gemini", "gemini", "cli-flags", None, &legacy.gemini),
        ("ollama", "Ollama", "ollama", "cli-flags", None, &legacy.ollama),
    ];

    for (id, label, command, transport, protocol, settings) in builtins {
        agents.insert(
            id.to_string(),
            AgentRegistryEntry {
                id: id.to_string(),
                label: label.to_string(),
                command: command.to_string(),
                transport: transport.to_string(),
                protocol,
                enabled: enablement.get(id).copied().unwrap_or(true),
                settings: settings.clone(),
            },
        );
    }

    AgentRegistrySettings {
        version: 2,
        max_concurrent_sessions: legacy.max_concurrent_sessions,
        agents,
        custom_agents: legacy.custom_agents.clone(),
    }
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
