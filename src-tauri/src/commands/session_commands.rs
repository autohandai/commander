use crate::commands::cli_commands::{
    cleanup_cli_sessions, get_sessions_status, send_quit_to_session, terminate_all_active_sessions,
    terminate_session_by_id,
};
use crate::models::*;

#[tauri::command]
pub async fn get_active_sessions() -> Result<SessionStatus, String> {
    get_sessions_status().await
}

#[tauri::command]
pub async fn terminate_session(session_id: String) -> Result<(), String> {
    terminate_session_by_id(&session_id).await
}

#[tauri::command]
pub async fn terminate_all_sessions() -> Result<(), String> {
    terminate_all_active_sessions().await
}

#[tauri::command]
pub async fn send_quit_command_to_session(session_id: String) -> Result<(), String> {
    send_quit_to_session(&session_id).await
}

#[tauri::command]
pub async fn cleanup_sessions() -> Result<(), String> {
    cleanup_cli_sessions().await
}
