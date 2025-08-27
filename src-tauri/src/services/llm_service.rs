use crate::models::*;
use std::collections::HashMap;
use tauri_plugin_store::StoreExt;

/// Get default LLM settings
pub fn get_default_llm_settings() -> LLMSettings {
    let mut providers = HashMap::new();
    
    // Default OpenRouter provider
    let openrouter_provider = LLMProvider {
        id: "openrouter".to_string(),
        name: "OpenRouter".to_string(),
        provider_type: "openrouter".to_string(),
        base_url: Some("https://openrouter.ai/api/v1".to_string()),
        api_key: None,
        models: vec![],
        selected_model: None,
    };
    
    providers.insert("openrouter".to_string(), openrouter_provider);
    
    LLMSettings {
        active_provider: "openrouter".to_string(),
        providers,
        system_prompt: "You are a helpful AI assistant.".to_string(),
    }
}

/// Fetch available models from OpenRouter API
pub async fn fetch_openrouter_models(api_key: &str) -> Result<Vec<LLMModel>, String> {
    let client = reqwest::Client::new();
    
    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch models: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("API request failed: {}", response.status()));
    }

    let openrouter_response: OpenRouterResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let models = openrouter_response.data
        .into_iter()
        .map(|model| {
            let (input_cost, output_cost) = model.pricing
                .as_ref()
                .map(|p| {
                    let input = p.prompt.as_ref().and_then(|s| s.parse::<f64>().ok());
                    let output = p.completion.as_ref().and_then(|s| s.parse::<f64>().ok());
                    (input, output)
                })
                .unwrap_or((None, None));

            LLMModel {
                id: model.id,
                name: model.name,
                description: model.description,
                context_length: model.context_length,
                input_cost,
                output_cost,
            }
        })
        .collect();

    Ok(models)
}

/// Save LLM settings to store
pub async fn save_llm_settings(app: &tauri::AppHandle, settings: &LLMSettings) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| format!("Failed to access store: {}", e))?;
    
    let serialized = serde_json::to_value(settings)
        .map_err(|e| format!("Failed to serialize LLM settings: {}", e))?;
    
    store.set("llm_settings", serialized);
    store.save().map_err(|e| format!("Failed to save store: {}", e))?;

    Ok(())
}

/// Load LLM settings from store
pub async fn load_llm_settings(app: &tauri::AppHandle) -> Result<LLMSettings, String> {
    let store = app.store("settings.json").map_err(|e| format!("Failed to access store: {}", e))?;
    
    let settings = store
        .get("llm_settings")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(|| get_default_llm_settings());

    Ok(settings)
}

