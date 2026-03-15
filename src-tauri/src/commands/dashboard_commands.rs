use crate::models::dashboard::DashboardStats;
use crate::services::indexer::db::IndexDb;
use crate::services::indexer::query_service;
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

#[tauri::command]
pub async fn get_dashboard_stats(
    app: AppHandle,
    db: tauri::State<'_, Arc<IndexDb>>,
    days: u32,
) -> Result<DashboardStats, String> {
    // Get project paths from store (used for memory_files_count)
    let store = app
        .store("recent-projects.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let projects_val = store.get("projects").unwrap_or(serde_json::Value::Array(vec![]));
    let project_paths: Vec<String> = match projects_val {
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|v| v.get("path").and_then(|p| p.as_str()).map(String::from))
            .collect(),
        _ => vec![],
    };

    // Query dashboard stats from SQLite index
    query_service::get_dashboard_stats_from_db(&db, days, &project_paths)
}
