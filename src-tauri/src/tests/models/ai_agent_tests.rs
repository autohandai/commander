#[cfg(test)]
mod tests {
    use crate::models::ai_agent::{AIAgent, AllAgentSettings};
    use crate::models::protocol::ProtocolMode;

    #[test]
    fn ai_agent_has_protocol_field() {
        let agent = AIAgent {
            name: "autohand".into(),
            command: "autohand".into(),
            display_name: "Autohand".into(),
            available: true,
            enabled: true,
            error_message: None,
            installed_version: Some("1.0.0".into()),
            latest_version: Some("1.0.0".into()),
            upgrade_available: false,
            protocol: Some(ProtocolMode::Acp),
            is_default: true,
            removable: false,
        };
        assert_eq!(agent.protocol, Some(ProtocolMode::Acp));
        assert!(agent.is_default);
        assert!(!agent.removable);
    }

    #[test]
    fn all_agent_settings_deserializes_without_autohand() {
        let json = r#"{
            "claude": { "enabled": true, "model": null, "sandbox_mode": false, "auto_approval": false, "session_timeout_minutes": 30, "output_format": "text", "debug_mode": false, "max_tokens": null, "temperature": null },
            "codex": { "enabled": true, "model": null, "sandbox_mode": false, "auto_approval": false, "session_timeout_minutes": 30, "output_format": "text", "debug_mode": false, "max_tokens": null, "temperature": null },
            "gemini": { "enabled": true, "model": null, "sandbox_mode": false, "auto_approval": false, "session_timeout_minutes": 30, "output_format": "text", "debug_mode": false, "max_tokens": null, "temperature": null },
            "max_concurrent_sessions": 3
        }"#;
        let settings: AllAgentSettings = serde_json::from_str(json).unwrap();
        assert!(settings.autohand.enabled);  // default value
    }
}
