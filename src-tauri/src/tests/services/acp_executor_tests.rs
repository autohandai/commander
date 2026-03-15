#[cfg(test)]
mod tests {
    use crate::services::executors::acp_executor::{
        classify_acp_message, resolve_tool_kind, AcpMessage, AcpExecutor,
    };
    use crate::services::executors::AgentExecutor;
    use crate::models::protocol::{ProtocolMode, ToolKind};

    #[test]
    fn classify_message_event() {
        let line = r#"{"type":"message","data":{"role":"assistant","content":"Hello!"}}"#;
        let msg = classify_acp_message(line).expect("should parse");
        match msg {
            AcpMessage::Message { role, content } => {
                assert_eq!(role, "assistant");
                assert_eq!(content, "Hello!");
            }
            other => panic!("expected Message, got {:?}", other),
        }
    }

    #[test]
    fn classify_tool_start_event() {
        let line = r#"{"type":"tool_start","data":{"name":"read_file","args":{"path":"/tmp/foo"}}}"#;
        let msg = classify_acp_message(line).expect("should parse");
        match msg {
            AcpMessage::ToolStart { name, args } => {
                assert_eq!(name, "read_file");
                assert!(args.is_some());
            }
            other => panic!("expected ToolStart, got {:?}", other),
        }
    }

    #[test]
    fn classify_tool_end_event() {
        let line = r#"{"type":"tool_end","data":{"name":"write_file","success":true,"duration_ms":42}}"#;
        let msg = classify_acp_message(line).expect("should parse");
        match msg {
            AcpMessage::ToolEnd { name, success, duration_ms, .. } => {
                assert_eq!(name, "write_file");
                assert!(success);
                assert_eq!(duration_ms, Some(42));
            }
            other => panic!("expected ToolEnd, got {:?}", other),
        }
    }

    #[test]
    fn classify_permission_request() {
        let line = r#"{"type":"permission_request","data":{"request_id":"req-1","tool_name":"delete_file","description":"Delete /tmp/foo"}}"#;
        let msg = classify_acp_message(line).expect("should parse");
        match msg {
            AcpMessage::PermissionRequest { request_id, tool_name, description } => {
                assert_eq!(request_id, "req-1");
                assert_eq!(tool_name, "delete_file");
                assert_eq!(description, "Delete /tmp/foo");
            }
            other => panic!("expected PermissionRequest, got {:?}", other),
        }
    }

    #[test]
    fn classify_state_change() {
        let line = r#"{"type":"state_change","data":{"status":"thinking","context_percent":42.5}}"#;
        let msg = classify_acp_message(line).expect("should parse");
        match msg {
            AcpMessage::StateChange { status, context_percent } => {
                assert_eq!(status, "thinking");
                assert_eq!(context_percent, Some(42.5));
            }
            other => panic!("expected StateChange, got {:?}", other),
        }
    }

    #[test]
    fn classify_unknown_type() {
        let line = r#"{"type":"something_new","data":{"foo":"bar"}}"#;
        let msg = classify_acp_message(line).expect("should parse");
        match msg {
            AcpMessage::Unknown(_) => {}
            other => panic!("expected Unknown, got {:?}", other),
        }
    }

    #[test]
    fn resolve_tool_kind_maps_correctly() {
        assert_eq!(resolve_tool_kind("read_file"), ToolKind::Read);
        assert_eq!(resolve_tool_kind("grep_search"), ToolKind::Search);
        assert_eq!(resolve_tool_kind("grep"), ToolKind::Search);
        assert_eq!(resolve_tool_kind("write_file"), ToolKind::Write);
        assert_eq!(resolve_tool_kind("edit_file"), ToolKind::Edit);
        assert_eq!(resolve_tool_kind("delete_file"), ToolKind::Delete);
        assert_eq!(resolve_tool_kind("bash"), ToolKind::Execute);
        assert_eq!(resolve_tool_kind("think"), ToolKind::Think);
        assert_eq!(resolve_tool_kind("web_fetch"), ToolKind::Fetch);
        assert_eq!(resolve_tool_kind("unknown_tool"), ToolKind::Other);
    }

    #[test]
    fn acp_executor_reports_acp_protocol() {
        let executor = AcpExecutor::new(Some("--mode acp".to_string()));
        assert_eq!(executor.protocol(), Some(ProtocolMode::Acp));
    }
}
