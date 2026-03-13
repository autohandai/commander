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
        let err = ProtocolError::ProcessDied(1);
        let ce: CommanderError = err.into();
        let msg = ce.to_string();
        assert!(msg.contains("process_died"));
    }

    #[test]
    fn protocol_event_serializes_with_tag() {
        let event = ProtocolEvent::Message {
            session_id: "s1".into(),
            role: "assistant".into(),
            content: "hello".into(),
        };
        let json = serde_json::to_value(&event).unwrap();
        assert_eq!(json["type"], "Message");
        assert_eq!(json["data"]["content"], "hello");
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
        let back: SessionEventKind = serde_json::from_str(&json).unwrap();
        assert_eq!(back, kind);
    }
}
