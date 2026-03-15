use crate::models::indexer::IndexerStatus;
use crate::services::indexer::db::IndexDb;
use crate::services::indexer::indexer_service;
use std::sync::Arc;

#[tauri::command]
pub async fn get_indexer_status(db: tauri::State<'_, Arc<IndexDb>>) -> Result<IndexerStatus, String> {
    let total_sessions = db.get_total_sessions()?;
    let agents_indexed = db.get_indexed_agents()?;

    Ok(IndexerStatus {
        is_running: indexer_service::is_indexer_running(),
        last_scan_at: None, // Could track this if needed
        total_sessions_indexed: total_sessions,
        agents_indexed,
        last_error: indexer_service::last_indexer_error(),
    })
}

#[tauri::command]
pub async fn trigger_reindex(db: tauri::State<'_, Arc<IndexDb>>) -> Result<String, String> {
    let db_clone = Arc::clone(&db);
    tokio::spawn(async move {
        if let Err(e) = indexer_service::trigger_reindex(db_clone).await {
            eprintln!("[indexer] Reindex error: {}", e);
        }
    });
    Ok("Reindex triggered".to_string())
}
