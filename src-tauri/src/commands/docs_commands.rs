use crate::models::docs::{DocContent, DocSearchResult, DocsStatus, DocsSyncResult};
use crate::services::docs_service;

#[tauri::command]
pub async fn sync_autohand_docs() -> Result<DocsSyncResult, String> {
    docs_service::sync_docs().await
}

#[tauri::command]
pub async fn search_autohand_docs(query: String) -> Result<Vec<DocSearchResult>, String> {
    docs_service::search_docs(&query).await
}

#[tauri::command]
pub async fn get_autohand_doc(slug: String) -> Result<DocContent, String> {
    docs_service::get_doc(&slug).await
}

#[tauri::command]
pub async fn get_autohand_docs_status() -> Result<DocsStatus, String> {
    docs_service::get_status()
}

#[tauri::command]
pub async fn clear_autohand_docs_cache() -> Result<(), String> {
    docs_service::clear_cache()
}
