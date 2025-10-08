use crate::services::cli_output_service::{sanitize_cli_output_line, CodexStreamAccumulator};

#[test]
fn filters_node_circular_dependency_warnings_for_codex() {
    let warning = "(node:47953) Warning: Accessing non-existent property 'lineno' of module exports inside circular dependency";
    assert!(sanitize_cli_output_line("codex", warning).is_none());

    let filename_warning = "(node:47953) Warning: Accessing non-existent property 'filename' of module exports inside circular dependency";
    assert!(sanitize_cli_output_line("codex", filename_warning).is_none());
}

#[test]
fn filters_trace_warnings_hint_for_codex() {
    let hint = "(Use `node --trace-warnings ...` to show where the warning was created)";
    assert!(sanitize_cli_output_line("codex", hint).is_none());
}

#[test]
fn keeps_legitimate_error_output() {
    let err_line = "npm ERR! missing script: start";
    assert_eq!(
        sanitize_cli_output_line("codex", err_line),
        Some(err_line.to_string())
    );
}

#[test]
fn leaves_other_agents_output_untouched() {
    let warning = "(node:47953) Warning: Accessing non-existent property 'lineno' of module exports inside circular dependency";
    assert_eq!(
        sanitize_cli_output_line("claude", warning),
        Some(warning.to_string())
    );
}

#[test]
fn claude_json_events_are_preserved() {
    let event = r#"{"type":"message_start","session_id":"s1","message":{"id":"msg","type":"message","role":"assistant","content":[]}}"#;
    assert_eq!(
        sanitize_cli_output_line("claude", event),
        Some(event.to_string())
    );
}

#[test]
fn codex_stream_accumulator_emits_on_carriage_return() {
    let mut acc = CodexStreamAccumulator::new();

    let chunks = acc.push_chunk("{\"type\":\"item.started\"}\r");
    assert_eq!(chunks, vec!["{\"type\":\"item.started\"}".to_string()]);

    let chunks = acc.push_chunk("{\"type\":\"item.completed\"}\r\n");
    assert_eq!(chunks, vec!["{\"type\":\"item.completed\"}".to_string()]);
}

#[test]
fn codex_stream_accumulator_buffers_partial_chunks() {
    let mut acc = CodexStreamAccumulator::new();

    let chunks = acc.push_chunk("{\"type\":\"item");
    assert!(chunks.is_empty(), "incomplete JSON should be buffered");

    let chunks = acc.push_chunk(".started\"}\r");
    assert_eq!(chunks, vec!["{\"type\":\"item.started\"}".to_string()]);

    assert!(acc.flush().is_none(), "buffer should be empty after flush");
}

#[test]
fn codex_stream_accumulator_flushes_trailing_content() {
    let mut acc = CodexStreamAccumulator::new();

    acc.push_chunk("{\"type\":\"item.started\"}");
    assert_eq!(acc.flush(), Some("{\"type\":\"item.started\"}".to_string()));
}

#[test]
fn codex_stream_accumulator_strips_sse_envelope() {
    let mut acc = CodexStreamAccumulator::new();

    // event/id lines should be ignored entirely
    let chunks = acc.push_chunk("event: thread.started\r\n");
    assert!(chunks.is_empty());

    let payload = "data: {\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"hello\"}}\r\n";
    let chunks = acc.push_chunk(payload);
    assert_eq!(
        chunks,
        vec![
            "{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"hello\"}}"
                .to_string()
        ]
    );

    // [DONE] should be swallowed without producing output
    let chunks = acc.push_chunk("data: [DONE]\r\n");
    assert!(chunks.is_empty());
}
