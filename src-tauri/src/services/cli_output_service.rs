pub fn sanitize_cli_output_line(agent: &str, line: &str) -> Option<String> {
    if !agent.eq_ignore_ascii_case("codex") {
        return Some(line.to_string());
    }

    let trimmed = line.trim();

    // Known Node.js warnings emitted by @openai/codex when using older dependencies.
    // Only drop lines that match the warning text exactly so we don't swallow
    // legitimate agent output that happens to include similar words.
    let is_known_warning = trimmed == "(Use `node --trace-warnings ...` to show where the warning was created)"
        || (trimmed.starts_with("(node:")
            && trimmed.ends_with("inside circular dependency")
            && (trimmed.contains("Warning: Accessing non-existent property 'lineno'")
                || trimmed.contains("Warning: Accessing non-existent property 'filename'")));

    if is_known_warning {
        return None;
    }

    Some(line.to_string())
}
