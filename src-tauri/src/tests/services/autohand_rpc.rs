#[cfg(test)]
mod tests {
    use crate::models::autohand::*;
    use crate::services::autohand::rpc_client::*;

    #[test]
    fn test_build_rpc_request_with_id() {
        let req = build_rpc_request("prompt", Some(serde_json::json!({"message": "hello"})));
        assert_eq!(req.jsonrpc, "2.0");
        assert_eq!(req.method, "prompt");
        assert!(req.id.is_some());
        assert!(req.params.is_some());
    }

    #[test]
    fn test_build_rpc_notification_without_id() {
        let notif = build_rpc_notification("agent/start", Some(serde_json::json!({})));
        assert_eq!(notif.jsonrpc, "2.0");
        assert!(notif.id.is_none());
    }

    #[test]
    fn test_serialize_rpc_request_to_line() {
        let req = build_rpc_request("getState", None);
        let line = serialize_rpc_to_line(&req);
        assert!(line.ends_with('\n'));
        let parsed: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(parsed["jsonrpc"], "2.0");
    }

    #[test]
    fn test_parse_rpc_line_response() {
        let line = r#"{"jsonrpc":"2.0","result":{"status":"idle"},"id":"1"}"#;
        let parsed = parse_rpc_line(line);
        assert!(parsed.is_ok());
        match parsed.unwrap() {
            RpcMessage::Response(resp) => {
                assert!(resp.result.is_some());
                assert!(resp.error.is_none());
            }
            _ => panic!("Expected Response"),
        }
    }

    #[test]
    fn test_parse_rpc_line_notification() {
        let line = r#"{"jsonrpc":"2.0","method":"agent/messageUpdate","params":{"content":"hello"}}"#;
        let parsed = parse_rpc_line(line);
        assert!(parsed.is_ok());
        match parsed.unwrap() {
            RpcMessage::Notification(req) => {
                assert_eq!(req.method, "agent/messageUpdate");
                assert!(req.id.is_none());
            }
            _ => panic!("Expected Notification"),
        }
    }

    #[test]
    fn test_parse_rpc_line_invalid_json() {
        let line = "not json at all";
        let parsed = parse_rpc_line(line);
        assert!(parsed.is_err());
    }

    #[test]
    fn test_build_prompt_params() {
        let params = build_prompt_params("Fix the bug", None);
        assert_eq!(params["message"], "Fix the bug");
    }

    #[test]
    fn test_build_prompt_params_with_images() {
        let images = vec!["base64data".to_string()];
        let params = build_prompt_params("Describe this", Some(images));
        assert_eq!(params["message"], "Describe this");
        assert!(params["images"].is_array());
    }

    #[test]
    fn test_build_permission_response_params() {
        let params = build_permission_response_params("req-123", true);
        assert_eq!(params["requestId"], "req-123");
        assert_eq!(params["approved"], true);
    }

    #[test]
    fn test_build_autohand_spawn_args_rpc() {
        let config = AutohandConfig::default();
        let args = build_spawn_args("/home/user/project", &config, None);
        assert!(args.contains(&"--mode".to_string()));
        assert!(args.contains(&"rpc".to_string()));
        assert!(args.contains(&"--path".to_string()));
        assert!(args.contains(&"/home/user/project".to_string()));
    }

    #[test]
    fn test_build_autohand_spawn_args_with_model() {
        let mut config = AutohandConfig::default();
        config.model = Some("claude-opus-4-20250514".to_string());
        let args = build_spawn_args("/project", &config, None);
        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"claude-opus-4-20250514".to_string()));
    }
}
