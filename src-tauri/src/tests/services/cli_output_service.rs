use crate::services::cli_output_service::sanitize_cli_output_line;

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
