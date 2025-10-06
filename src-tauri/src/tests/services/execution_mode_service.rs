#[cfg(test)]
mod tests {
    use crate::services::execution_mode_service::{codex_flags_for_mode, ExecutionMode};

    #[test]
    fn test_codex_flags_chat_mode() {
        let flags = codex_flags_for_mode(ExecutionMode::Chat, false);
        assert_eq!(flags, vec!["--sandbox", "read-only"]);
    }

    #[test]
    fn test_codex_flags_collab_mode() {
        let flags = codex_flags_for_mode(ExecutionMode::Collab, false);
        assert_eq!(flags, vec!["--sandbox", "workspace-write"]);
    }

    #[test]
    fn test_codex_flags_full_mode() {
        let flags = codex_flags_for_mode(ExecutionMode::Full, false);
        assert_eq!(flags, vec!["--full-auto"]);
    }

    #[test]
    fn test_codex_flags_full_mode_unsafe() {
        let flags = codex_flags_for_mode(ExecutionMode::Full, true);
        assert_eq!(flags, vec!["--dangerously-bypass-approvals-and-sandbox"]);
    }
}
