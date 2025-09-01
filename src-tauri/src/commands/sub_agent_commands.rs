use crate::models::sub_agent::SubAgent;
use crate::services::sub_agent_service::SubAgentService;
use std::collections::HashMap;
use std::path::PathBuf;

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

#[tauri::command]
pub async fn save_sub_agent(file_path: String, content: String) -> Result<(), String> {
    SubAgentService::save_agent_file(&PathBuf::from(file_path), &content)
}

#[tauri::command]
pub async fn create_sub_agent(
    cli_name: String,
    name: String,
    description: Option<String>,
    color: Option<String>,
    model: Option<String>,
    content: String,
) -> Result<SubAgent, String> {
    SubAgentService::create_sub_agent(&cli_name, &name, description, color, model, content).await
}

#[tauri::command]
pub async fn delete_sub_agent(file_path: String) -> Result<(), String> {
    SubAgentService::delete_agent_file(&PathBuf::from(file_path))
}
