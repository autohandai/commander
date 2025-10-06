use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMProvider {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    pub models: Vec<LLMModel>,
    pub selected_model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMModel {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub context_length: Option<u32>,
    pub input_cost: Option<f64>,
    pub output_cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMSettings {
    pub active_provider: String,
    pub providers: HashMap<String, LLMProvider>,
    #[serde(default)]
    pub system_prompt: String,
}

// OpenRouter API response structs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct OpenRouterModel {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub context_length: Option<u32>,
    pub pricing: Option<OpenRouterPricing>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct OpenRouterPricing {
    pub prompt: Option<String>,
    pub completion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct OpenRouterResponse {
    pub data: Vec<OpenRouterModel>,
}

// OpenAI API response structs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct OpenAIModel {
    pub id: String,
    pub owned_by: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct OpenAIModelsResponse {
    pub data: Vec<OpenAIModel>,
}
