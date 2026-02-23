#[cfg(test)]
mod tests {
    use crate::models::autohand::*;
    use crate::services::autohand::hooks_service::*;
    use std::path::Path;
    use tempfile::TempDir;

    fn sample_hook() -> HookDefinition {
        HookDefinition {
            id: "hook-1".to_string(),
            event: HookEvent::PostTool,
            command: "/path/to/format.sh".to_string(),
            pattern: Some("*.ts".to_string()),
            enabled: true,
            description: Some("Format TS files".to_string()),
        }
    }

    fn write_config_with_hooks(dir: &Path, hooks: &[HookDefinition]) {
        let config = serde_json::json!({
            "hooks": {
                "definitions": hooks,
            }
        });
        let config_dir = dir.join(".autohand");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(
            config_dir.join("config.json"),
            serde_json::to_string_pretty(&config).unwrap(),
        )
        .unwrap();
    }

    #[test]
    fn test_load_hooks_from_config() {
        let tmp = TempDir::new().unwrap();
        let hook = sample_hook();
        write_config_with_hooks(tmp.path(), &[hook.clone()]);

        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].id, "hook-1");
        assert_eq!(hooks[0].event, HookEvent::PostTool);
    }

    #[test]
    fn test_load_hooks_no_config_returns_empty() {
        let tmp = TempDir::new().unwrap();
        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert!(hooks.is_empty());
    }

    #[test]
    fn test_save_hook_to_config() {
        let tmp = TempDir::new().unwrap();
        write_config_with_hooks(tmp.path(), &[]);

        let hook = sample_hook();
        save_hook_to_config(tmp.path(), &hook).unwrap();

        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].id, "hook-1");
    }

    #[test]
    fn test_save_hook_upserts_existing() {
        let tmp = TempDir::new().unwrap();
        let hook = sample_hook();
        write_config_with_hooks(tmp.path(), &[hook]);

        let updated = HookDefinition {
            id: "hook-1".to_string(),
            event: HookEvent::PreTool,
            command: "/path/to/lint.sh".to_string(),
            pattern: None,
            enabled: false,
            description: Some("Lint before tool".to_string()),
        };
        save_hook_to_config(tmp.path(), &updated).unwrap();

        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert_eq!(hooks.len(), 1, "upsert should not duplicate");
        assert_eq!(hooks[0].event, HookEvent::PreTool);
        assert_eq!(hooks[0].command, "/path/to/lint.sh");
        assert!(!hooks[0].enabled);
    }

    #[test]
    fn test_delete_hook_from_config() {
        let tmp = TempDir::new().unwrap();
        let hook = sample_hook();
        write_config_with_hooks(tmp.path(), &[hook]);

        delete_hook_from_config(tmp.path(), "hook-1").unwrap();

        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert!(hooks.is_empty());
    }

    #[test]
    fn test_toggle_hook_in_config() {
        let tmp = TempDir::new().unwrap();
        let hook = sample_hook();
        write_config_with_hooks(tmp.path(), &[hook]);

        toggle_hook_in_config(tmp.path(), "hook-1", false).unwrap();

        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert!(!hooks[0].enabled);
    }

    #[test]
    fn test_delete_nonexistent_hook_is_ok() {
        let tmp = TempDir::new().unwrap();
        write_config_with_hooks(tmp.path(), &[sample_hook()]);

        let result = delete_hook_from_config(tmp.path(), "nonexistent");
        assert!(result.is_ok());
    }

    #[test]
    fn test_toggle_nonexistent_hook_returns_error() {
        let tmp = TempDir::new().unwrap();
        write_config_with_hooks(tmp.path(), &[sample_hook()]);

        let result = toggle_hook_in_config(tmp.path(), "nonexistent", false);
        assert!(result.is_err());
    }

    #[test]
    fn test_save_hook_preserves_other_config_fields() {
        let tmp = TempDir::new().unwrap();
        // Write config with extra fields beyond hooks
        let config = serde_json::json!({
            "provider": "anthropic",
            "model": "claude-opus-4",
            "hooks": {
                "definitions": [],
            }
        });
        let config_dir = tmp.path().join(".autohand");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(
            config_dir.join("config.json"),
            serde_json::to_string_pretty(&config).unwrap(),
        )
        .unwrap();

        let hook = sample_hook();
        save_hook_to_config(tmp.path(), &hook).unwrap();

        // Re-read the raw JSON and verify other fields survived
        let raw = std::fs::read_to_string(config_dir.join("config.json")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed["provider"], "anthropic");
        assert_eq!(parsed["model"], "claude-opus-4");
        assert_eq!(
            parsed["hooks"]["definitions"].as_array().unwrap().len(),
            1
        );
    }

    #[test]
    fn test_save_hook_creates_config_dir_if_missing() {
        let tmp = TempDir::new().unwrap();
        // No .autohand dir exists yet

        let hook = sample_hook();
        save_hook_to_config(tmp.path(), &hook).unwrap();

        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].id, "hook-1");
    }
}
