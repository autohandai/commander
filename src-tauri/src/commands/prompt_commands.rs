use crate::models::*;
use crate::services::prompt_service;

#[tauri::command]
pub async fn load_prompts(app: tauri::AppHandle) -> Result<PromptsConfig, String> {
    prompt_service::load_prompts(&app).await
}

#[tauri::command]
pub async fn save_prompts(app: tauri::AppHandle, prompts: PromptsConfig) -> Result<(), String> {
    prompt_service::save_prompts(&app, &prompts).await
}

#[tauri::command]
pub async fn get_default_prompts() -> Result<PromptsConfig, String> {
    Ok(prompt_service::get_default_prompts())
}

#[tauri::command]
pub async fn update_prompt(
    app: tauri::AppHandle,
    category: String,
    key: String,
    prompt: PromptTemplate,
) -> Result<(), String> {
    prompt_service::update_prompt(&app, &category, &key, &prompt).await
}

#[tauri::command]
pub async fn delete_prompt(
    app: tauri::AppHandle,
    category: String,
    key: String,
) -> Result<(), String> {
    prompt_service::delete_prompt(&app, &category, &key).await
}

#[tauri::command]
pub async fn create_prompt_category(
    app: tauri::AppHandle,
    category: String,
    description: String,
) -> Result<(), String> {
    prompt_service::create_category(&app, &category, &description).await
}
