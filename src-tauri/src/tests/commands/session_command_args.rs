use crate::commands::cli_commands::{terminate_session_by_id};
use crate::commands::session_commands::send_quit_command_to_session;

#[tokio::test]
async fn terminate_session_accepts_session_id_and_succeeds_when_missing() {
    // Test the underlying function directly (the Tauri command wrapper adds
    // SessionManager state that can't be constructed outside Tauri runtime).
    let res = terminate_session_by_id("nonexistent-session").await;
    assert!(
        res.is_ok(),
        "terminate_session_by_id should succeed even if session is missing"
    );
}

#[tokio::test]
async fn send_quit_command_uses_session_id_and_errors_when_missing() {
    // This ensures the command parameter is correctly named `session_id` and
    // that the underlying implementation returns a clear error when not found.
    let res = send_quit_command_to_session("nonexistent-session".to_string()).await;
    assert!(
        res.is_err(),
        "send_quit_command_to_session should error for missing session"
    );
    let msg = res.unwrap_err();
    assert!(
        msg.contains("Session not found"),
        "Unexpected error message: {}",
        msg
    );
}
