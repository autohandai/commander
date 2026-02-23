#[cfg(test)]
mod tests {
    use crate::models::autohand::*;
    use crate::services::autohand::hooks_service;
    use tempfile::TempDir;

    #[test]
    fn test_autohand_config_load_defaults() {
        let tmp = TempDir::new().unwrap();
        let config = crate::commands::autohand_commands::load_autohand_config_internal(
            tmp.path().to_str().unwrap(),
        );
        assert!(config.is_ok());
        let config = config.unwrap();
        assert_eq!(config.protocol, ProtocolMode::Rpc);
        assert_eq!(config.provider, "anthropic");
        assert_eq!(config.permissions_mode, "interactive");
    }

    #[test]
    fn test_autohand_config_load_from_file() {
        let tmp = TempDir::new().unwrap();
        let config_dir = tmp.path().join(".autohand");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(
            config_dir.join("config.json"),
            r#"{"protocol": "acp", "provider": "openrouter", "model": "gpt-4o"}"#,
        )
        .unwrap();

        let config = crate::commands::autohand_commands::load_autohand_config_internal(
            tmp.path().to_str().unwrap(),
        );
        assert!(config.is_ok());
        let config = config.unwrap();
        assert_eq!(config.protocol, ProtocolMode::Acp);
        assert_eq!(config.provider, "openrouter");
        assert_eq!(config.model, Some("gpt-4o".to_string()));
    }

    #[test]
    fn test_autohand_hooks_roundtrip() {
        let tmp = TempDir::new().unwrap();

        // Initially empty
        let hooks = hooks_service::load_hooks_from_config(tmp.path()).unwrap();
        assert!(hooks.is_empty());

        // Add a hook
        let hook = HookDefinition {
            id: "test-hook".to_string(),
            event: HookEvent::PreTool,
            command: "echo test".to_string(),
            pattern: None,
            enabled: true,
            description: None,
        };
        hooks_service::save_hook_to_config(tmp.path(), &hook).unwrap();

        let hooks = hooks_service::load_hooks_from_config(tmp.path()).unwrap();
        assert_eq!(hooks.len(), 1);

        // Toggle
        hooks_service::toggle_hook_in_config(tmp.path(), "test-hook", false).unwrap();
        let hooks = hooks_service::load_hooks_from_config(tmp.path()).unwrap();
        assert!(!hooks[0].enabled);

        // Delete
        hooks_service::delete_hook_from_config(tmp.path(), "test-hook").unwrap();
        let hooks = hooks_service::load_hooks_from_config(tmp.path()).unwrap();
        assert!(hooks.is_empty());
    }
}
