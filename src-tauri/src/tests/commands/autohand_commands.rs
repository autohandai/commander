#[cfg(test)]
mod tests {
    use crate::models::autohand::*;
    use crate::services::autohand::hooks_service;
    use std::collections::HashMap;
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
        // New sections should default to None
        assert!(config.mcp.is_none());
        assert!(config.provider_details.is_none());
        assert!(config.permissions.is_none());
        assert!(config.agent.is_none());
        assert!(config.network.is_none());
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

    // -----------------------------------------------------------------------
    // New config section tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_autohand_config_roundtrip_all_sections() {
        let config = AutohandConfig {
            protocol: ProtocolMode::Acp,
            provider: "openrouter".to_string(),
            model: Some("gpt-4o".to_string()),
            permissions_mode: "auto".to_string(),
            hooks: Vec::new(),
            mcp: Some(McpConfig {
                servers: vec![McpServerConfig {
                    name: "test-server".to_string(),
                    transport: "stdio".to_string(),
                    command: Some("/usr/bin/test".to_string()),
                    args: vec!["--flag".to_string()],
                    url: None,
                    env: HashMap::from([("API_KEY".to_string(), "secret".to_string())]),
                    source: Some("manual".to_string()),
                    auto_connect: true,
                }],
            }),
            provider_details: Some(ProviderDetails {
                api_key: Some("sk-test-key".to_string()),
                model: Some("gpt-4o".to_string()),
                base_url: Some("https://api.example.com".to_string()),
            }),
            permissions: Some(PermissionsConfig {
                mode: "restricted".to_string(),
                whitelist: vec!["read_file".to_string()],
                blacklist: vec!["rm".to_string()],
                rules: vec![],
                remember_session: true,
            }),
            agent: Some(AgentBehaviorConfig {
                max_iterations: 20,
                enable_request_queue: true,
            }),
            network: Some(NetworkConfig {
                timeout: 60000,
                max_retries: 5,
                retry_delay: 2000,
            }),
        };

        // Serialize, then deserialize (hooks are skipped)
        let json = serde_json::to_value(&config).unwrap();
        let roundtripped: AutohandConfig = serde_json::from_value(json).unwrap();

        assert_eq!(roundtripped.protocol, ProtocolMode::Acp);
        assert_eq!(roundtripped.provider, "openrouter");
        assert_eq!(roundtripped.model, Some("gpt-4o".to_string()));
        assert_eq!(roundtripped.permissions_mode, "auto");

        let mcp = roundtripped.mcp.unwrap();
        assert_eq!(mcp.servers.len(), 1);
        assert_eq!(mcp.servers[0].name, "test-server");
        assert_eq!(mcp.servers[0].transport, "stdio");
        assert_eq!(mcp.servers[0].env.get("API_KEY").unwrap(), "secret");

        let pd = roundtripped.provider_details.unwrap();
        assert_eq!(pd.api_key, Some("sk-test-key".to_string()));

        let perm = roundtripped.permissions.unwrap();
        assert_eq!(perm.mode, "restricted");
        assert!(perm.remember_session);
        assert_eq!(perm.whitelist, vec!["read_file"]);

        let agent = roundtripped.agent.unwrap();
        assert_eq!(agent.max_iterations, 20);
        assert!(agent.enable_request_queue);

        let net = roundtripped.network.unwrap();
        assert_eq!(net.timeout, 60000);
        assert_eq!(net.max_retries, 5);
    }

    #[test]
    fn test_autohand_config_load_with_mcp_servers() {
        let tmp = TempDir::new().unwrap();
        let config_dir = tmp.path().join(".autohand");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(
            config_dir.join("config.json"),
            r#"{
                "provider": "anthropic",
                "mcp": {
                    "servers": [
                        {
                            "name": "filesystem",
                            "transport": "stdio",
                            "command": "npx",
                            "args": ["-y", "@modelcontextprotocol/server-filesystem"],
                            "auto_connect": true
                        },
                        {
                            "name": "web-search",
                            "transport": "http",
                            "url": "http://localhost:3001",
                            "auto_connect": false
                        }
                    ]
                }
            }"#,
        )
        .unwrap();

        let config = crate::commands::autohand_commands::load_autohand_config_with_global(
            tmp.path().to_str().unwrap(),
            None,
        )
        .unwrap();

        let mcp = config.mcp.unwrap();
        assert_eq!(mcp.servers.len(), 2);
        assert_eq!(mcp.servers[0].name, "filesystem");
        assert_eq!(mcp.servers[0].transport, "stdio");
        assert_eq!(mcp.servers[0].command, Some("npx".to_string()));
        assert!(mcp.servers[0].auto_connect);
        assert_eq!(mcp.servers[1].name, "web-search");
        assert_eq!(mcp.servers[1].transport, "http");
        assert!(!mcp.servers[1].auto_connect);
    }

    #[test]
    fn test_autohand_config_missing_sections_load_defaults() {
        let tmp = TempDir::new().unwrap();
        let config_dir = tmp.path().join(".autohand");
        std::fs::create_dir_all(&config_dir).unwrap();
        // Config with only basic fields, no new sections
        std::fs::write(
            config_dir.join("config.json"),
            r#"{"provider": "anthropic", "protocol": "rpc"}"#,
        )
        .unwrap();

        let config = crate::commands::autohand_commands::load_autohand_config_with_global(
            tmp.path().to_str().unwrap(),
            None,
        )
        .unwrap();

        assert_eq!(config.provider, "anthropic");
        assert!(config.mcp.is_none());
        assert!(config.provider_details.is_none());
        assert!(config.permissions.is_none());
        assert!(config.agent.is_none());
        assert!(config.network.is_none());
    }

    #[test]
    fn test_autohand_config_dynamic_provider_key() {
        let tmp = TempDir::new().unwrap();
        let config_dir = tmp.path().join(".autohand");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(
            config_dir.join("config.json"),
            r#"{
                "provider": "openrouter",
                "openrouter": {
                    "api_key": "sk-or-test-123",
                    "model": "anthropic/claude-sonnet-4-20250514",
                    "base_url": "https://openrouter.ai/api/v1"
                }
            }"#,
        )
        .unwrap();

        let config = crate::commands::autohand_commands::load_autohand_config_with_global(
            tmp.path().to_str().unwrap(),
            None,
        )
        .unwrap();

        assert_eq!(config.provider, "openrouter");
        let pd = config.provider_details.unwrap();
        assert_eq!(pd.api_key, Some("sk-or-test-123".to_string()));
        assert_eq!(
            pd.model,
            Some("anthropic/claude-sonnet-4-20250514".to_string())
        );
        assert_eq!(
            pd.base_url,
            Some("https://openrouter.ai/api/v1".to_string())
        );
    }

    #[test]
    fn test_autohand_config_dynamic_provider_key_camel_case() {
        let tmp = TempDir::new().unwrap();
        let config_dir = tmp.path().join(".autohand");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(
            config_dir.join("config.json"),
            r#"{
                "provider": "openrouter",
                "openrouter": {
                    "apiKey": "sk-or-camel-123",
                    "model": "anthropic/claude-sonnet-4-20250514",
                    "baseUrl": "https://openrouter.ai/api/v1"
                }
            }"#,
        )
        .unwrap();

        let config = crate::commands::autohand_commands::load_autohand_config_with_global(
            tmp.path().to_str().unwrap(),
            None,
        )
        .unwrap();

        assert_eq!(config.provider, "openrouter");
        let pd = config.provider_details.unwrap();
        assert_eq!(pd.api_key, Some("sk-or-camel-123".to_string()));
        assert_eq!(
            pd.model,
            Some("anthropic/claude-sonnet-4-20250514".to_string())
        );
        assert_eq!(
            pd.base_url,
            Some("https://openrouter.ai/api/v1".to_string())
        );
    }

    #[test]
    fn test_autohand_config_permissions_camel_case_alias() {
        let tmp = TempDir::new().unwrap();
        let config_dir = tmp.path().join(".autohand");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(
            config_dir.join("config.json"),
            r#"{
                "provider": "anthropic",
                "permissions": {
                    "mode": "interactive",
                    "whitelist": [],
                    "blacklist": [],
                    "rules": [],
                    "rememberSession": true
                }
            }"#,
        )
        .unwrap();

        let config = crate::commands::autohand_commands::load_autohand_config_with_global(
            tmp.path().to_str().unwrap(),
            None,
        )
        .unwrap();

        let permissions = config.permissions.unwrap();
        assert!(permissions.remember_session);
    }

    #[test]
    fn test_autohand_mcp_server_crud() {
        let tmp = TempDir::new().unwrap();
        let ws_dir = tmp.path().to_str().unwrap();

        // Initially no servers
        let config = crate::commands::autohand_commands::load_autohand_config_with_global(
            ws_dir, None,
        )
        .unwrap();
        assert!(config.mcp.is_none());

        // Write a config with mcp servers via save
        let mut config_with_mcp = config.clone();
        config_with_mcp.mcp = Some(McpConfig {
            servers: vec![McpServerConfig {
                name: "test-srv".to_string(),
                transport: "stdio".to_string(),
                command: Some("echo".to_string()),
                args: vec![],
                url: None,
                env: HashMap::new(),
                source: None,
                auto_connect: true,
            }],
        });

        crate::commands::autohand_commands::save_autohand_config_internal(
            ws_dir,
            &config_with_mcp,
        )
        .unwrap();

        // Reload and verify
        let reloaded = crate::commands::autohand_commands::load_autohand_config_with_global(
            ws_dir, None,
        )
        .unwrap();
        let servers = reloaded.mcp.unwrap().servers;
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "test-srv");

        // Add a second server by saving config again
        let mut updated = crate::commands::autohand_commands::load_autohand_config_with_global(
            ws_dir, None,
        )
        .unwrap();
        let mcp = updated.mcp.get_or_insert_with(McpConfig::default);
        mcp.servers.push(McpServerConfig {
            name: "second-srv".to_string(),
            transport: "http".to_string(),
            command: None,
            args: vec![],
            url: Some("http://localhost:8080".to_string()),
            env: HashMap::new(),
            source: None,
            auto_connect: false,
        });
        crate::commands::autohand_commands::save_autohand_config_internal(ws_dir, &updated)
            .unwrap();

        let reloaded = crate::commands::autohand_commands::load_autohand_config_with_global(
            ws_dir, None,
        )
        .unwrap();
        assert_eq!(reloaded.mcp.unwrap().servers.len(), 2);

        // Delete by retaining only non-matching
        let mut to_delete = crate::commands::autohand_commands::load_autohand_config_with_global(
            ws_dir, None,
        )
        .unwrap();
        if let Some(ref mut mcp) = to_delete.mcp {
            mcp.servers.retain(|s| s.name != "test-srv");
        }
        crate::commands::autohand_commands::save_autohand_config_internal(ws_dir, &to_delete)
            .unwrap();

        let reloaded = crate::commands::autohand_commands::load_autohand_config_with_global(
            ws_dir, None,
        )
        .unwrap();
        let servers = reloaded.mcp.unwrap().servers;
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "second-srv");
    }

    #[test]
    fn test_save_autohand_config_writes_provider_specific_block() {
        let tmp = TempDir::new().unwrap();
        let ws_dir = tmp.path().to_str().unwrap();

        let config = AutohandConfig {
            protocol: ProtocolMode::Rpc,
            provider: "openrouter".to_string(),
            model: Some("anthropic/claude-sonnet-4-20250514".to_string()),
            permissions_mode: "interactive".to_string(),
            hooks: Vec::new(),
            mcp: None,
            provider_details: Some(ProviderDetails {
                api_key: Some("sk-provider-123".to_string()),
                model: Some("anthropic/claude-sonnet-4-20250514".to_string()),
                base_url: Some("https://openrouter.ai/api/v1".to_string()),
            }),
            permissions: None,
            agent: None,
            network: None,
        };

        crate::commands::autohand_commands::save_autohand_config_internal(ws_dir, &config).unwrap();

        let raw = std::fs::read_to_string(tmp.path().join(".autohand").join("config.json")).unwrap();
        let json: serde_json::Value = serde_json::from_str(&raw).unwrap();
        let provider_block = json.get("openrouter").unwrap();
        assert_eq!(
            provider_block.get("apiKey").and_then(|v| v.as_str()),
            Some("sk-provider-123")
        );
        assert_eq!(
            provider_block.get("baseUrl").and_then(|v| v.as_str()),
            Some("https://openrouter.ai/api/v1")
        );
        assert_eq!(
            provider_block.get("model").and_then(|v| v.as_str()),
            Some("anthropic/claude-sonnet-4-20250514")
        );
    }
}
