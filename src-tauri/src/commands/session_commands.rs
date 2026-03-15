use std::sync::Arc;
use crate::commands::cli_commands::{
    cleanup_cli_sessions, get_sessions_status, send_quit_to_session, terminate_all_active_sessions,
    terminate_session_by_id,
};
use crate::models::*;
use crate::services::session_manager::SessionManager;
use tokio::sync::Mutex as TokioMutex;

#[tauri::command]
pub async fn get_active_sessions() -> Result<SessionStatus, String> {
    get_sessions_status().await
}

#[tauri::command]
pub async fn terminate_session(
    session_id: String,
    session_manager: tauri::State<'_, Arc<TokioMutex<SessionManager>>>,
) -> Result<(), String> {
    // Close via SessionManager (sends abort signal to protocol executor)
    {
        let mut mgr = session_manager.lock().await;
        mgr.close_session(&session_id);
    }
    // Also clean up legacy SESSIONS map
    terminate_session_by_id(&session_id).await
}

#[tauri::command]
pub async fn terminate_all_sessions(
    session_manager: tauri::State<'_, Arc<TokioMutex<SessionManager>>>,
) -> Result<(), String> {
    // Close all sessions in SessionManager
    {
        let mut mgr = session_manager.lock().await;
        mgr.close_all();
    }
    // Also clean up legacy SESSIONS map
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
