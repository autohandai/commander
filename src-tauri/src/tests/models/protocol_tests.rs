#[cfg(test)]
mod tests {
    use crate::models::protocol::{ProtocolMode, ProtocolError, ProtocolEvent, SessionEventKind, ToolKind};

    #[test]
    fn protocol_mode_serializes_to_lowercase() {
        let acp = ProtocolMode::Acp;
        let json = serde_json::to_string(&acp).unwrap();
        assert_eq!(json, "\"acp\"");
        let rpc = ProtocolMode::Rpc;
        let json = serde_json::to_string(&rpc).unwrap();
        assert_eq!(json, "\"rpc\"");
    }

    #[test]
    fn protocol_mode_deserializes_from_lowercase() {
        let acp: ProtocolMode = serde_json::from_str("\"acp\"").unwrap();
        assert_eq!(acp, ProtocolMode::Acp);
    }

    #[test]
    fn protocol_error_converts_to_commander_error() {
        use crate::error::CommanderError;
        // Test ProcessDied still works
        let err = ProtocolError::ProcessDied(1);
        let ce: CommanderError = err.into();
        let msg = ce.to_string();
        assert!(msg.contains("process_died"));

        // Test AgentError struct variant carries code through
        let err = ProtocolError::AgentError { code: 42, message: "bad".into() };
        let ce: CommanderError = err.into();
        match &ce {
            CommanderError::Protocol { kind, code, .. } => {
                assert_eq!(kind, "agent_error");
                assert_eq!(*code, Some(42));
            }
            _ => panic!("expected Protocol variant"),
        }
        let msg = ce.to_string();
        assert!(msg.contains("agent_error"));
    }

    #[test]
    fn protocol_event_serializes_with_tag() {
        // Test Message variant (unchanged)
        let event = ProtocolEvent::Message {
            session_id: "s1".into(),
            role: "assistant".into(),
            content: "hello".into(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "Message");
        assert_eq!(json["data"]["content"], "hello");

        // Test ToolStart with corrected field names
        let event = ProtocolEvent::ToolStart {
            session_id: "s2".into(),
            tool_id: "t1".into(),
            tool_name: "bash".into(),
            tool_kind: ToolKind::Execute,
            args: Some(serde_json::json!({"cmd": "ls"})),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "ToolStart");
        assert_eq!(json["data"]["tool_name"], "bash");
        assert_eq!(json["data"]["tool_kind"], "execute");
        assert_eq!(json["data"]["args"]["cmd"], "ls");
    }

    #[test]
    fn tool_kind_serializes_to_snake_case() {
        let kind = ToolKind::Read;
        let json = serde_json::to_string(&kind).unwrap();
        assert_eq!(json, "\"read\"");
    }

    #[test]
    fn session_event_kind_roundtrips() {
        let kind = SessionEventKind::FallbackToPty;
        let json = serde_json::to_string(&kind).unwrap();
        assert_eq!(json, "\"fallback_to_pty\"");
        let back: SessionEventKind = serde_json::from_str(&json).unwrap();
        assert_eq!(back, kind);
    }

    #[test]
    fn state_change_serializes_status_and_context_percent() {
        let event = ProtocolEvent::StateChange {
            session_id: "s3".into(),
            status: "running".into(),
            context_percent: Some(42.5),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "StateChange");
        assert_eq!(json["data"]["status"], "running");
        assert!((json["data"]["context_percent"].as_f64().unwrap() - 42.5).abs() < f64::EPSILON);

        // Also verify null context_percent when None
        let event_no_pct = ProtocolEvent::StateChange {
            session_id: "s4".into(),
            status: "idle".into(),
            context_percent: None,
        };
        let json2 = serde_json::to_value(&event_no_pct).unwrap();
        assert_eq!(json2["data"]["status"], "idle");
        assert!(json2["data"]["context_percent"].is_null());
    }

    #[test]
    fn permission_request_has_request_id_and_tool_name() {
        let event = ProtocolEvent::PermissionRequest {
            session_id: "s5".into(),
            request_id: "req-001".into(),
            tool_name: "write_file".into(),
            description: "Write to /etc/hosts".into(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "PermissionRequest");
        assert_eq!(json["data"]["request_id"], "req-001");
        assert_eq!(json["data"]["tool_name"], "write_file");
        assert_eq!(json["data"]["description"], "Write to /etc/hosts");
    }
}
