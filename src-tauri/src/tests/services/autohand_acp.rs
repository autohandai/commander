#[cfg(test)]
mod tests {
    use crate::models::autohand::*;
    use crate::services::autohand::acp_client::*;

    // -----------------------------------------------------------------------
    // build_acp_spawn_args
    // -----------------------------------------------------------------------

    #[test]
    fn test_build_acp_spawn_args() {
        let mut config = AutohandConfig::default();
        config.protocol = ProtocolMode::Acp;
        let args = build_acp_spawn_args("/project", &config, None);
        assert!(args.contains(&"--mode".to_string()));
        assert!(args.contains(&"acp".to_string()));
        assert!(args.contains(&"--path".to_string()));
        assert!(args.contains(&"/project".to_string()));
    }

    #[test]
    fn test_build_acp_spawn_args_with_model() {
        let mut config = AutohandConfig::default();
        config.protocol = ProtocolMode::Acp;
        config.model = Some("gpt-4o".to_string());
        let args = build_acp_spawn_args("/project", &config, None);
        assert!(args.contains(&"--model".to_string()));
        assert!(args.contains(&"gpt-4o".to_string()));
    }

    #[test]
    fn test_build_acp_spawn_args_without_model() {
        let mut config = AutohandConfig::default();
        config.protocol = ProtocolMode::Acp;
        config.model = None;
        let args = build_acp_spawn_args("/project", &config, None);
        assert!(!args.contains(&"--model".to_string()));
    }

    // -----------------------------------------------------------------------
    // resolve_tool_kind
    // -----------------------------------------------------------------------

    #[test]
    fn test_tool_kind_mapping() {
        assert_eq!(resolve_tool_kind("read_file"), "read");
        assert_eq!(resolve_tool_kind("write_file"), "edit");
        assert_eq!(resolve_tool_kind("run_command"), "execute");
        assert_eq!(resolve_tool_kind("grep_search"), "search");
        assert_eq!(resolve_tool_kind("unknown_tool"), "other");
    }

    #[test]
    fn test_tool_kind_mapping_comprehensive() {
        // Read operations
        assert_eq!(resolve_tool_kind("read_file"), "read");
        assert_eq!(resolve_tool_kind("read_image"), "read");
        assert_eq!(resolve_tool_kind("get_file_info"), "read");

        // Search operations
        assert_eq!(resolve_tool_kind("grep_search"), "search");
        assert_eq!(resolve_tool_kind("glob_search"), "search");
        assert_eq!(resolve_tool_kind("search_files"), "search");
        assert_eq!(resolve_tool_kind("find_definition"), "search");
        assert_eq!(resolve_tool_kind("find_references"), "search");

        // Edit operations
        assert_eq!(resolve_tool_kind("write_file"), "edit");
        assert_eq!(resolve_tool_kind("edit_file"), "edit");
        assert_eq!(resolve_tool_kind("multi_edit_file"), "edit");
        assert_eq!(resolve_tool_kind("create_file"), "edit");

        // Move operations
        assert_eq!(resolve_tool_kind("rename_file"), "move");
        assert_eq!(resolve_tool_kind("move_file"), "move");

        // Delete operations
        assert_eq!(resolve_tool_kind("delete_file"), "delete");

        // Execute operations
        assert_eq!(resolve_tool_kind("run_command"), "execute");
        assert_eq!(resolve_tool_kind("git_commit"), "execute");
        assert_eq!(resolve_tool_kind("git_checkout"), "execute");
        assert_eq!(resolve_tool_kind("git_push"), "execute");

        // Think operations
        assert_eq!(resolve_tool_kind("think"), "think");
        assert_eq!(resolve_tool_kind("plan"), "think");

        // Fetch operations
        assert_eq!(resolve_tool_kind("web_fetch"), "fetch");
        assert_eq!(resolve_tool_kind("web_search"), "fetch");

        // Unknown maps to other
        assert_eq!(resolve_tool_kind("unknown_tool"), "other");
        assert_eq!(resolve_tool_kind(""), "other");
        assert_eq!(resolve_tool_kind("some_random_tool"), "other");
    }

    // -----------------------------------------------------------------------
    // parse_acp_line
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_acp_ndjson_line() {
        let line = r#"{"type":"tool_start","data":{"name":"read_file","args":{"path":"src/main.rs"}}}"#;
        let parsed = parse_acp_line(line);
        assert!(parsed.is_ok());
        let value = parsed.unwrap();
        assert_eq!(value["type"], "tool_start");
        assert_eq!(value["data"]["name"], "read_file");
    }

    #[test]
    fn test_parse_acp_empty_line() {
        let parsed = parse_acp_line("");
        assert!(parsed.is_err());
    }

    #[test]
    fn test_parse_acp_whitespace_only() {
        let parsed = parse_acp_line("   ");
        assert!(parsed.is_err());
    }

    #[test]
    fn test_parse_acp_invalid_json() {
        let parsed = parse_acp_line("not valid json");
        assert!(parsed.is_err());
    }

    #[test]
    fn test_parse_acp_message_line() {
        let line = r#"{"type":"message","data":{"role":"assistant","content":"Hello!"}}"#;
        let parsed = parse_acp_line(line);
        assert!(parsed.is_ok());
        let value = parsed.unwrap();
        assert_eq!(value["type"], "message");
        assert_eq!(value["data"]["role"], "assistant");
    }

    #[test]
    fn test_parse_acp_state_change_line() {
        let line = r#"{"type":"state_change","data":{"status":"processing","context_percent":42.5}}"#;
        let parsed = parse_acp_line(line);
        assert!(parsed.is_ok());
        let value = parsed.unwrap();
        assert_eq!(value["type"], "state_change");
        assert_eq!(value["data"]["status"], "processing");
    }

    // -----------------------------------------------------------------------
    // AcpMessage enum
    // -----------------------------------------------------------------------

    #[test]
    fn test_classify_acp_message_tool_start() {
        let line = r#"{"type":"tool_start","data":{"name":"read_file","args":{"path":"src/main.rs"}}}"#;
        let msg = classify_acp_message(line);
        assert!(msg.is_ok());
        match msg.unwrap() {
            AcpMessage::ToolStart { name, args } => {
                assert_eq!(name, "read_file");
                assert!(args.is_some());
            }
            other => panic!("Expected ToolStart, got {:?}", other),
        }
    }

    #[test]
    fn test_classify_acp_message_message() {
        let line = r#"{"type":"message","data":{"role":"assistant","content":"Done."}}"#;
        let msg = classify_acp_message(line);
        assert!(msg.is_ok());
        match msg.unwrap() {
            AcpMessage::Message { role, content } => {
                assert_eq!(role, "assistant");
                assert_eq!(content, "Done.");
            }
            other => panic!("Expected Message, got {:?}", other),
        }
    }

    #[test]
    fn test_classify_acp_message_unknown_type() {
        let line = r#"{"type":"custom_event","data":{"foo":"bar"}}"#;
        let msg = classify_acp_message(line);
        assert!(msg.is_ok());
        match msg.unwrap() {
            AcpMessage::Unknown => {}
            other => panic!("Expected Unknown, got {:?}", other),
        }
    }
}
