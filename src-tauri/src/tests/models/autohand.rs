#[cfg(test)]
mod tests {
    use crate::models::autohand::*;
    use serde_json::{json, Value};

    #[test]
    fn test_protocol_mode_serialization() {
        // ProtocolMode::Rpc should serialize to "rpc"
        let rpc = ProtocolMode::Rpc;
        let serialized = serde_json::to_string(&rpc).unwrap();
        assert_eq!(serialized, "\"rpc\"");

        // ProtocolMode::Acp should serialize to "acp"
        let acp = ProtocolMode::Acp;
        let serialized = serde_json::to_string(&acp).unwrap();
        assert_eq!(serialized, "\"acp\"");

        // Roundtrip deserialization
        let deserialized: ProtocolMode = serde_json::from_str("\"rpc\"").unwrap();
        assert!(matches!(deserialized, ProtocolMode::Rpc));

        let deserialized: ProtocolMode = serde_json::from_str("\"acp\"").unwrap();
        assert!(matches!(deserialized, ProtocolMode::Acp));
    }

    #[test]
    fn test_autohand_status_default() {
        let state = AutohandState::default();
        assert!(matches!(state.status, AutohandStatus::Idle));
        assert!(state.session_id.is_none());
        assert_eq!(state.context_percent, 0.0);
        assert_eq!(state.message_count, 0);
    }

    #[test]
    fn test_hook_definition_serialization() {
        let hook = HookDefinition {
            id: "hook-1".to_string(),
            event: HookEvent::PreTool,
            command: "echo pre-tool".to_string(),
            pattern: Some("*.rs".to_string()),
            enabled: true,
            description: Some("Run before tool execution".to_string()),
        };

        let serialized = serde_json::to_string(&hook).unwrap();
        let deserialized: HookDefinition = serde_json::from_str(&serialized).unwrap();

        assert_eq!(deserialized.id, "hook-1");
        assert!(matches!(deserialized.event, HookEvent::PreTool));
        assert_eq!(deserialized.command, "echo pre-tool");
        assert_eq!(deserialized.pattern, Some("*.rs".to_string()));
        assert!(deserialized.enabled);
        assert_eq!(
            deserialized.description,
            Some("Run before tool execution".to_string())
        );
    }

    #[test]
    fn test_autohand_config_defaults() {
        let config = AutohandConfig::default();
        assert!(matches!(config.protocol, ProtocolMode::Rpc));
        assert_eq!(config.provider, "anthropic");
        assert_eq!(config.model, None);
        assert_eq!(config.permissions_mode, "interactive");
        assert!(config.hooks.is_empty());
    }

    #[test]
    fn test_permission_request_serialization() {
        let request = PermissionRequest {
            request_id: "req-123".to_string(),
            tool_name: "file_write".to_string(),
            description: "Write to config.toml".to_string(),
            file_path: Some("/etc/config.toml".to_string()),
            is_destructive: true,
        };

        let serialized = serde_json::to_string(&request).unwrap();
        let deserialized: PermissionRequest = serde_json::from_str(&serialized).unwrap();

        assert_eq!(deserialized.request_id, "req-123");
        assert_eq!(deserialized.tool_name, "file_write");
        assert_eq!(deserialized.description, "Write to config.toml");
        assert_eq!(deserialized.file_path, Some("/etc/config.toml".to_string()));
        assert!(deserialized.is_destructive);
    }

    #[test]
    fn test_hook_event_covers_all_lifecycle() {
        // Verify all lifecycle events serialize to expected kebab-case strings
        let events = vec![
            (HookEvent::SessionStart, "session-start"),
            (HookEvent::SessionEnd, "session-end"),
            (HookEvent::PreTool, "pre-tool"),
            (HookEvent::PostTool, "post-tool"),
            (HookEvent::FileModified, "file-modified"),
            (HookEvent::PrePrompt, "pre-prompt"),
            (HookEvent::PostResponse, "post-response"),
            (HookEvent::SubagentStop, "subagent-stop"),
            (HookEvent::PermissionRequest, "permission-request"),
            (HookEvent::Notification, "notification"),
            (HookEvent::SessionError, "session-error"),
            (HookEvent::AutomodeStart, "automode-start"),
            (HookEvent::AutomodeStop, "automode-stop"),
            (HookEvent::AutomodeError, "automode-error"),
        ];

        for (event, expected_str) in events {
            let serialized = serde_json::to_string(&event).unwrap();
            let expected_json = format!("\"{}\"", expected_str);
            assert_eq!(
                serialized, expected_json,
                "HookEvent::{:?} should serialize to {}",
                event, expected_str
            );

            // Roundtrip
            let deserialized: HookEvent = serde_json::from_str(&serialized).unwrap();
            let re_serialized = serde_json::to_string(&deserialized).unwrap();
            assert_eq!(serialized, re_serialized);
        }
    }

    #[test]
    fn test_rpc_request_serialization() {
        let request = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "tools/execute".to_string(),
            params: Some(json!({"tool": "file_read", "path": "/tmp/test.txt"})),
            id: Some(JsonRpcId::Num(1)),
        };

        let serialized = serde_json::to_string(&request).unwrap();
        let parsed: Value = serde_json::from_str(&serialized).unwrap();

        assert_eq!(parsed["jsonrpc"], "2.0");
        assert_eq!(parsed["method"], "tools/execute");
        assert_eq!(parsed["id"], 1);
        assert!(parsed["params"].is_object());

        // Also test with string id
        let request_str_id = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "session/status".to_string(),
            params: None,
            id: Some(JsonRpcId::Str("abc-123".to_string())),
        };

        let serialized = serde_json::to_string(&request_str_id).unwrap();
        let parsed: Value = serde_json::from_str(&serialized).unwrap();

        assert_eq!(parsed["id"], "abc-123");
        // params should not be present when None (skip_serializing_if)
        assert!(parsed.get("params").is_none());
    }

    #[test]
    fn test_rpc_notification_has_no_id() {
        let notification = JsonRpcRequest {
            jsonrpc: "2.0".to_string(),
            method: "notifications/message".to_string(),
            params: Some(json!({"text": "Hello"})),
            id: None,
        };

        let serialized = serde_json::to_string(&notification).unwrap();
        let parsed: Value = serde_json::from_str(&serialized).unwrap();

        assert_eq!(parsed["jsonrpc"], "2.0");
        assert_eq!(parsed["method"], "notifications/message");
        // id should not be present when None (skip_serializing_if)
        assert!(parsed.get("id").is_none());
    }

    #[test]
    fn test_tool_event_serialization() {
        // Test ToolPhase serializes to lowercase
        let start = ToolPhase::Start;
        assert_eq!(serde_json::to_string(&start).unwrap(), "\"start\"");

        let update = ToolPhase::Update;
        assert_eq!(serde_json::to_string(&update).unwrap(), "\"update\"");

        let end = ToolPhase::End;
        assert_eq!(serde_json::to_string(&end).unwrap(), "\"end\"");

        // Full ToolEvent roundtrip
        let event = ToolEvent {
            tool_id: "tool-42".to_string(),
            tool_name: "file_read".to_string(),
            phase: ToolPhase::End,
            args: Some(json!({"path": "/tmp/test.txt"})),
            output: Some("file contents here".to_string()),
            success: Some(true),
            duration_ms: Some(150),
        };

        let serialized = serde_json::to_string(&event).unwrap();
        let deserialized: ToolEvent = serde_json::from_str(&serialized).unwrap();

        assert_eq!(deserialized.tool_id, "tool-42");
        assert_eq!(deserialized.tool_name, "file_read");
        assert!(matches!(deserialized.phase, ToolPhase::End));
        assert_eq!(deserialized.success, Some(true));
        assert_eq!(deserialized.duration_ms, Some(150));
    }
}
