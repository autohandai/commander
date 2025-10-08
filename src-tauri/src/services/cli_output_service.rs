pub fn sanitize_cli_output_line(agent: &str, line: &str) -> Option<String> {
    let trimmed = line.trim();

    if agent.eq_ignore_ascii_case("codex") {
        let is_known_warning = trimmed
            == "(Use `node --trace-warnings ...` to show where the warning was created)"
            || (trimmed.starts_with("(node:")
                && trimmed.ends_with("inside circular dependency")
                && (trimmed.contains("Warning: Accessing non-existent property 'lineno'")
                    || trimmed.contains("Warning: Accessing non-existent property 'filename'")));

        if is_known_warning {
            return None;
        }
    }

    if agent.eq_ignore_ascii_case("claude") {
        if trimmed.starts_with('{') && trimmed.ends_with('}') {
            let has_type = trimmed.contains("\"type\"");
            let looks_like_metadata = !has_type
                && (trimmed.contains("\"mcp_commands\"")
                    || trimmed.contains("\"mcp_servers\"")
                    || trimmed.contains("\"session_id\"")
                    || trimmed.contains("\"uuid\""));
            if looks_like_metadata {
                return None;
            }
        }

        if trimmed.starts_with("\u{001b}") || trimmed.starts_with("\x1b") {
            return None;
        }

        if trimmed.is_empty() || trimmed == "[DONE]" || trimmed == "?25h" {
            return None;
        }
    }

    Some(line.to_string())
}

/// Incrementally splits Codex CLI output into discrete JSON messages.
///
/// Codex streams often emit carriage returns (\r) instead of newlines which causes
/// standard line-based readers to block until the command finishes. This accumulator
/// collects raw chunks and emits complete payloads whenever it sees `\r`, `\n` or
/// `\r\n`, while buffering partial fragments for the next chunk.
#[derive(Default)]
pub struct CodexStreamAccumulator {
    buffer: String,
}

impl CodexStreamAccumulator {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push_chunk(&mut self, chunk: &str) -> Vec<String> {
        if chunk.is_empty() {
            return Vec::new();
        }

        self.buffer.push_str(chunk);

        let mut results = Vec::new();
        let mut start = 0usize;
        let bytes = self.buffer.as_bytes();
        let mut idx = 0usize;

        while idx < bytes.len() {
            match bytes[idx] {
                b'\r' | b'\n' => {
                    if start < idx {
                        self.process_segment(&self.buffer[start..idx], &mut results);
                    }

                    // Skip consecutive separators so \r\n or multiple \r don't produce empty chunks
                    idx += 1;
                    while idx < bytes.len() && (bytes[idx] == b'\r' || bytes[idx] == b'\n') {
                        idx += 1;
                    }

                    start = idx;
                }
                _ => {
                    idx += 1;
                }
            }
        }

        if start > 0 {
            // Drop everything up to the last processed separator, keep remainder buffered
            self.buffer.drain(..start);
        }

        results
    }

    pub fn flush(&mut self) -> Option<String> {
        if self.buffer.is_empty() {
            None
        } else {
            let mut results = Vec::new();
            let remaining: String = self.buffer.drain(..).collect();
            self.process_segment(&remaining, &mut results);
            results.pop()
        }
    }

    fn process_segment(&self, segment: &str, results: &mut Vec<String>) {
        let trimmed = segment.trim();
        if trimmed.is_empty() {
            return;
        }

        if let Some(rest) = trimmed.strip_prefix("data:") {
            let data = rest.trim();
            if data.is_empty() || data.eq_ignore_ascii_case("[DONE]") {
                return;
            }
            results.push(data.to_string());
            return;
        }

        if trimmed.starts_with("event:") || trimmed.starts_with("id:") {
            return;
        }

        results.push(trimmed.to_string());
    }
}
