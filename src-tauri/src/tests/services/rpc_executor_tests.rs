#[cfg(test)]
mod tests {
    use crate::services::executors::rpc_executor::{
        build_rpc_request, parse_rpc_line, RpcMessage,
        build_prompt_params, build_permission_response_params,
    };

    #[test]
    fn build_rpc_request_has_correct_shape() {
        let req = build_rpc_request("autohand.prompt", Some(serde_json::json!({"message": "hi"})));
        assert_eq!(req.jsonrpc, "2.0");
        assert_eq!(req.method, "autohand.prompt");
        assert!(req.id.is_some());
    }

    #[test]
    fn parse_rpc_notification() {
        let line = r#"{"jsonrpc":"2.0","method":"autohand.message_start","params":{"role":"assistant","content":"hi"}}"#;
        let msg = parse_rpc_line(line).unwrap();
        assert!(matches!(msg, RpcMessage::Notification(_)));
    }

    #[test]
    fn parse_rpc_response() {
        let line = r#"{"jsonrpc":"2.0","id":"abc-123","result":{"status":"ok"}}"#;
        let msg = parse_rpc_line(line).unwrap();
        assert!(matches!(msg, RpcMessage::Response(_)));
    }

    #[test]
    fn build_prompt_params_structure() {
        let params = build_prompt_params("hello", None);
        assert_eq!(params["message"], "hello");
    }

    #[test]
    fn build_permission_response_params_structure() {
        let params = build_permission_response_params("r1", true);
        assert_eq!(params["request_id"], "r1");
        assert_eq!(params["approved"], true);
    }

    #[test]
    fn rpc_executor_reports_rpc_protocol() {
        use crate::services::executors::AgentExecutor;
        use crate::services::executors::rpc_executor::RpcExecutor;
        use crate::models::protocol::ProtocolMode;

        let executor = RpcExecutor::new(Some("--mode rpc".into()));
        assert_eq!(executor.protocol(), Some(ProtocolMode::Rpc));
    }
}
