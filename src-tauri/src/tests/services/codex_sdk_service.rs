use crate::services::codex_sdk_service::build_codex_thread_prefs;
use crate::services::execution_mode_service::ExecutionMode;

#[test]
fn chat_mode_maps_to_read_only_sandbox() {
    let prefs = build_codex_thread_prefs(Some(ExecutionMode::Chat), false);
    assert_eq!(prefs.sandbox_mode.as_deref(), Some("read-only"));
    assert!(prefs.skip_git_repo_check);
}

#[test]
fn collab_mode_maps_to_workspace_write() {
    let prefs = build_codex_thread_prefs(Some(ExecutionMode::Collab), false);
    assert_eq!(prefs.sandbox_mode.as_deref(), Some("workspace-write"));
}

#[test]
fn full_mode_uses_workspace_write_by_default() {
    let prefs = build_codex_thread_prefs(Some(ExecutionMode::Full), false);
    assert_eq!(prefs.sandbox_mode.as_deref(), Some("workspace-write"));
}

#[test]
fn full_mode_with_bypass_disables_sandbox() {
    let prefs = build_codex_thread_prefs(Some(ExecutionMode::Full), true);
    assert_eq!(prefs.sandbox_mode.as_deref(), Some("danger-full-access"));
}

#[test]
fn none_defaults_to_workspace_write() {
    let prefs = build_codex_thread_prefs(None, false);
    assert_eq!(prefs.sandbox_mode.as_deref(), Some("workspace-write"));
}
