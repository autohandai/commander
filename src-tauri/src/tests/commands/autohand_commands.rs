#[cfg(test)]
mod tests {
    use crate::models::autohand::*;
    use crate::services::autohand::hooks_service;
    use tempfile::TempDir;

    #[test]
    fn test_autohand_config_load_defaults() {
        let tmp = TempDir::new().unwrap();
        // Pass None for global dir so real ~/.autohand doesn't interfere
        let config = crate::commands::autohand_commands::load_autohand_config_with_global(
            tmp.path().to_str().unwrap(),
            None,
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

        let config = crate::commands::autohand_commands::load_autohand_config_with_global(
            tmp.path().to_str().unwrap(),
            None,
        );
        assert!(config.is_ok());
        let config = config.unwrap();
        assert_eq!(config.protocol, ProtocolMode::Acp);
        assert_eq!(config.provider, "openrouter");
        assert_eq!(config.model, Some("gpt-4o".to_string()));
    }

    #[test]
    fn test_autohand_config_merges_global_and_workspace() {
        let global_tmp = TempDir::new().unwrap();
        let ws_tmp = TempDir::new().unwrap();

        // Global sets provider and model
        let global_dir = global_tmp.path();
        std::fs::write(
            global_dir.join("config.json"),
            r#"{"provider": "openrouter", "model": "gpt-4o", "permissions_mode": "auto"}"#,
        )
        .unwrap();

        // Workspace overrides only model
        let ws_config_dir = ws_tmp.path().join(".autohand");
        std::fs::create_dir_all(&ws_config_dir).unwrap();
        std::fs::write(
            ws_config_dir.join("config.json"),
            r#"{"model": "claude-3"}"#,
        )
        .unwrap();

        let config = crate::commands::autohand_commands::load_autohand_config_with_global(
            ws_tmp.path().to_str().unwrap(),
            Some(global_dir),
        )
        .unwrap();

        // provider comes from global
        assert_eq!(config.provider, "openrouter");
        // model overridden by workspace
        assert_eq!(config.model, Some("claude-3".to_string()));
        // permissions_mode from global (not overridden)
        assert_eq!(config.permissions_mode, "auto");
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
