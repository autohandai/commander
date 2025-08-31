use crate::models::sub_agent::SubAgent;
use crate::services::sub_agent_service::SubAgentService;
use std::collections::HashMap;

#[tauri::command]
pub async fn load_all_sub_agents() -> Result<Vec<SubAgent>, String> {
    SubAgentService::load_all_sub_agents().await
}

#[tauri::command]
pub async fn load_sub_agents_for_cli(cli_name: String) -> Result<Vec<SubAgent>, String> {
    SubAgentService::load_agents_for_cli(&cli_name).await
}

#[tauri::command]
pub async fn load_sub_agents_grouped() -> Result<HashMap<String, Vec<SubAgent>>, String> {
    SubAgentService::get_agents_by_cli().await
}