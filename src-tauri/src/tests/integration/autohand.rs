//! Integration tests for the autohand CLI protocol and lifecycle flows.
//!
//! These tests verify the full RPC flow, ACP tool kind mapping, permission
//! flow, hooks lifecycle, and config load/save WITHOUT requiring autohand
//! to be installed.

#[cfg(test)]
mod tests {
    use crate::models::autohand::*;
    use crate::services::autohand::rpc_client::*;
    use crate::services::autohand::acp_client::*;

    #[test]
    fn test_rpc_full_prompt_flow() {
        // Build a prompt request using the correct autohand-prefixed method
        let req = build_rpc_request("autohand.prompt", Some(build_prompt_params("Fix the bug", None)));
        let line = serialize_rpc_to_line(&req);

        // Verify it's valid JSON with correct method name
        let parsed: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(parsed["jsonrpc"], "2.0");
        assert_eq!(parsed["method"], "autohand.prompt");
        assert_eq!(parsed["params"]["message"], "Fix the bug");

        // Simulate a messageUpdate notification response
        let response_line = r#"{"jsonrpc":"2.0","method":"autohand.messageUpdate","params":{"content":"I'll fix that bug."}}"#;
        let parsed = parse_rpc_line(response_line).unwrap();

        match parsed {
            RpcMessage::Notification(notif) => {
                assert_eq!(notif.method, "autohand.messageUpdate");
                let params = notif.params.unwrap();
                let content = params["content"].as_str().unwrap();
                assert_eq!(content, "I'll fix that bug.");
            }
            _ => panic!("Expected notification"),
        }
    }

    #[test]
    fn test_rpc_permission_flow() {
        // Simulate permission request notification from autohand
        let perm_line = r#"{"jsonrpc":"2.0","method":"autohand.permissionRequest","params":{"requestId":"req-1","toolName":"write_file","description":"Write to src/app.ts","filePath":"src/app.ts","isDestructive":false}}"#;
        let parsed = parse_rpc_line(perm_line).unwrap();

        match parsed {
            RpcMessage::Notification(notif) => {
                assert_eq!(notif.method, "autohand.permissionRequest");
                let params = notif.params.unwrap();
                assert_eq!(params["toolName"], "write_file");
                assert_eq!(params["requestId"], "req-1");
                assert_eq!(params["isDestructive"], false);
            }
            _ => panic!("Expected notification"),
        }

        // Build permission response (approval)
        let resp_req = build_rpc_request(
            "autohand.permissionResponse",
            Some(build_permission_response_params("req-1", true)),
        );
        let line = serialize_rpc_to_line(&resp_req);
        assert!(line.contains("autohand.permissionResponse"));
        assert!(line.contains("\"approved\":true"));
        assert!(line.contains("\"requestId\":\"req-1\""));
    }

    #[test]
    fn test_rpc_tool_lifecycle_flow() {
        // Simulate tool start
        let start_line = r#"{"jsonrpc":"2.0","method":"autohand.toolStart","params":{"toolId":"t-1","toolName":"read_file","args":{"path":"src/main.rs"},"timestamp":"2026-02-23T00:00:00Z"}}"#;
        let parsed = parse_rpc_line(start_line).unwrap();
        match &parsed {
            RpcMessage::Notification(n) => assert_eq!(n.method, "autohand.toolStart"),
            _ => panic!("Expected notification"),
        }

        // Simulate tool end
        let end_line = r#"{"jsonrpc":"2.0","method":"autohand.toolEnd","params":{"toolId":"t-1","toolName":"read_file","success":true,"duration":1200,"output":"file contents...","timestamp":"2026-02-23T00:00:01Z"}}"#;
        let parsed = parse_rpc_line(end_line).unwrap();
        match &parsed {
            RpcMessage::Notification(n) => {
                assert_eq!(n.method, "autohand.toolEnd");
                let params = n.params.as_ref().unwrap();
                assert_eq!(params["success"], true);
            }
            _ => panic!("Expected notification"),
        }
    }

    #[test]
    fn test_rpc_abort_request() {
        let req = build_rpc_request("autohand.abort", None);
        let line = serialize_rpc_to_line(&req);
        let parsed: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(parsed["method"], "autohand.abort");
        assert!(parsed["id"].is_string());
    }

    #[test]
    fn test_rpc_error_response_parsing() {
        let error_line = r#"{"jsonrpc":"2.0","error":{"code":-32003,"message":"Agent is busy processing another request"},"id":"req-5"}"#;
        let parsed = parse_rpc_line(error_line).unwrap();
        match parsed {
            RpcMessage::Response(resp) => {
                assert!(resp.error.is_some());
                let err = resp.error.unwrap();
                assert_eq!(err.code, -32003);
                assert!(err.message.contains("busy"));
            }
            _ => panic!("Expected response"),
        }
    }

    #[test]
    fn test_acp_tool_kind_coverage() {
        // Verify ALL tool kinds are represented
        assert_eq!(resolve_tool_kind("read_file"), "read");
        assert_eq!(resolve_tool_kind("read_image"), "read");
        assert_eq!(resolve_tool_kind("get_file_info"), "read");

        assert_eq!(resolve_tool_kind("grep_search"), "search");
        assert_eq!(resolve_tool_kind("glob_search"), "search");
        assert_eq!(resolve_tool_kind("search_files"), "search");
        assert_eq!(resolve_tool_kind("find_definition"), "search");
        assert_eq!(resolve_tool_kind("find_references"), "search");

        assert_eq!(resolve_tool_kind("write_file"), "edit");
        assert_eq!(resolve_tool_kind("edit_file"), "edit");
        assert_eq!(resolve_tool_kind("multi_edit_file"), "edit");
        assert_eq!(resolve_tool_kind("create_file"), "edit");

        assert_eq!(resolve_tool_kind("rename_file"), "move");
        assert_eq!(resolve_tool_kind("move_file"), "move");

        assert_eq!(resolve_tool_kind("delete_file"), "delete");

        assert_eq!(resolve_tool_kind("run_command"), "execute");
        assert_eq!(resolve_tool_kind("git_commit"), "execute");
        assert_eq!(resolve_tool_kind("git_checkout"), "execute");
        assert_eq!(resolve_tool_kind("git_push"), "execute");

        assert_eq!(resolve_tool_kind("think"), "think");
        assert_eq!(resolve_tool_kind("plan"), "think");

        assert_eq!(resolve_tool_kind("web_fetch"), "fetch");
        assert_eq!(resolve_tool_kind("web_search"), "fetch");

        // Unknown tools default to "other"
        assert_eq!(resolve_tool_kind("some_custom_mcp_tool"), "other");
    }

    #[test]
    fn test_hooks_service_integration() {
        use crate::services::autohand::hooks_service::*;
        let tmp = tempfile::TempDir::new().unwrap();

        // Full lifecycle: create -> read -> toggle -> delete
        let hook = HookDefinition {
            id: "int-hook-1".to_string(),
            event: HookEvent::PostTool,
            command: "echo formatted".to_string(),
            pattern: Some("*.rs".to_string()),
            enabled: true,
            description: Some("Format Rust files".to_string()),
        };

        // Save
        save_hook_to_config(tmp.path(), &hook).unwrap();
        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].id, "int-hook-1");
        assert!(hooks[0].enabled);

        // Toggle off
        toggle_hook_in_config(tmp.path(), "int-hook-1", false).unwrap();
        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert!(!hooks[0].enabled);

        // Toggle back on
        toggle_hook_in_config(tmp.path(), "int-hook-1", true).unwrap();
        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert!(hooks[0].enabled);

        // Add second hook
        let hook2 = HookDefinition {
            id: "int-hook-2".to_string(),
            event: HookEvent::FileModified,
            command: "cargo test".to_string(),
            pattern: Some("src/**".to_string()),
            enabled: true,
            description: None,
        };
        save_hook_to_config(tmp.path(), &hook2).unwrap();
        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert_eq!(hooks.len(), 2);

        // Delete first
        delete_hook_from_config(tmp.path(), "int-hook-1").unwrap();
        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert_eq!(hooks.len(), 1);
        assert_eq!(hooks[0].id, "int-hook-2");

        // Delete second
        delete_hook_from_config(tmp.path(), "int-hook-2").unwrap();
        let hooks = load_hooks_from_config(tmp.path()).unwrap();
        assert!(hooks.is_empty());
    }

    #[test]
    fn test_config_load_save_integration() {
        use crate::commands::autohand_commands::*;
        let tmp = tempfile::TempDir::new().unwrap();
        let wd = tmp.path().to_str().unwrap();

        // Load defaults (no config file, no global dir)
        let config = load_autohand_config_with_global(wd, None).unwrap();
        assert_eq!(config.protocol, ProtocolMode::Rpc);
        assert_eq!(config.provider, "anthropic");
        assert!(config.model.is_none());

        // Save custom config -- use the actual field names the loader reads
        let config_dir = tmp.path().join(".autohand");
        std::fs::create_dir_all(&config_dir).unwrap();
        std::fs::write(
            config_dir.join("config.json"),
            r#"{"protocol":"acp","provider":"openrouter","model":"gpt-4o","permissions_mode":"auto"}"#,
        )
        .unwrap();

        // Reload
        let config = load_autohand_config_with_global(wd, None).unwrap();
        assert_eq!(config.protocol, ProtocolMode::Acp);
        assert_eq!(config.provider, "openrouter");
        assert_eq!(config.model, Some("gpt-4o".to_string()));
        assert_eq!(config.permissions_mode, "auto");
    }
}
