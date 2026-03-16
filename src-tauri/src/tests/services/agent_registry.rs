#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use crate::models::ai_agent::{
        normalize_legacy_agent_registry, AgentRegistrySettings, AgentSettings, AllAgentSettings,
        CustomAgentDefinition,
    };

    fn base_settings(model: Option<&str>) -> AgentSettings {
        AgentSettings {
            enabled: true,
            model: model.map(|value| value.to_string()),
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

    #[test]
    fn test_normalize_legacy_agent_registry_preserves_builtins_and_concurrency() {
        let mut enablement = HashMap::new();
        enablement.insert("claude".to_string(), true);
        enablement.insert("codex".to_string(), false);
        enablement.insert("gemini".to_string(), true);

        let legacy = AllAgentSettings {
            claude: base_settings(Some("claude-sonnet")),
            codex: base_settings(Some("gpt-5-codex")),
            gemini: base_settings(Some("gemini-2.5-pro")),
            autohand: base_settings(None),
            ollama: base_settings(Some("llama3.2")),
            custom_agents: vec![],
            max_concurrent_sessions: 12,
        };

        let registry = normalize_legacy_agent_registry(&enablement, &legacy);

        assert_eq!(registry.max_concurrent_sessions, 12);
        assert_eq!(registry.agents["claude"].settings.model.as_deref(), Some("claude-sonnet"));
        assert_eq!(registry.agents["codex"].enabled, false);
        assert_eq!(registry.agents["ollama"].settings.model.as_deref(), Some("llama3.2"));
        assert!(registry.agents.contains_key("autohand"));
    }

    #[test]
    fn test_agent_registry_round_trips_custom_agents() {
        let registry = AgentRegistrySettings {
            version: 2,
            max_concurrent_sessions: 10,
            agents: HashMap::new(),
            custom_agents: vec![CustomAgentDefinition {
                id: "dev-rpc".to_string(),
                name: "Dev RPC".to_string(),
                command: "dev-rpc-cli".to_string(),
                transport: "json-rpc".to_string(),
                protocol: Some("rpc".to_string()),
                prompt_mode: "protocol".to_string(),
                supports_model: true,
                supports_output_format: false,
                supports_session_timeout: false,
                supports_max_tokens: false,
                supports_temperature: false,
                supports_sandbox_mode: false,
                supports_auto_approval: false,
                supports_debug_mode: true,
                settings: base_settings(Some("dev-model")),
            }],
        };

        let serialized = serde_json::to_string(&registry).expect("serialize registry");
        let parsed: AgentRegistrySettings =
            serde_json::from_str(&serialized).expect("deserialize registry");

        assert_eq!(parsed.custom_agents.len(), 1);
        assert_eq!(parsed.custom_agents[0].id, "dev-rpc");
        assert_eq!(parsed.custom_agents[0].transport, "json-rpc");
        assert_eq!(parsed.custom_agents[0].protocol.as_deref(), Some("rpc"));
        assert_eq!(parsed.custom_agents[0].settings.model.as_deref(), Some("dev-model"));
    }
}
