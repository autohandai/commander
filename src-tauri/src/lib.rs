use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::Emitter;
use tauri_plugin_store::StoreExt;

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

#[derive(Debug, Serialize, Deserialize)]
struct OpenRouterModel {
    id: String,
    name: String,
    description: Option<String>,
    context_length: Option<u32>,
    pricing: Option<OpenRouterPricing>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenRouterPricing {
    prompt: Option<String>,
    completion: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenRouterResponse {
    data: Vec<OpenRouterModel>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn start_drag(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_openrouter_models() -> Result<Vec<LLMModel>, String> {
    let client = reqwest::Client::new();
    let response = client
        .get("https://openrouter.ai/api/v1/models")
        .header("HTTP-Referer", "https://autohand.ai")
        .header("X-Title", "Commander")
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
                id: model.id.clone(),
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

#[tauri::command]
async fn check_ollama_installation() -> Result<bool, String> {
    let output = tokio::process::Command::new("ollama")
        .arg("--version")
        .output()
        .await;
    
    match output {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
async fn fetch_ollama_models() -> Result<Vec<LLMModel>, String> {
    let output = tokio::process::Command::new("ollama")
        .arg("list")
        .output()
        .await
        .map_err(|e| format!("Failed to execute ollama list: {}", e))?;

    if !output.status.success() {
        return Err("Failed to list Ollama models. Make sure Ollama is installed and running.".to_string());
    }

    let stdout = String::from_utf8(output.stdout)
        .map_err(|e| format!("Failed to parse ollama output: {}", e))?;

    let mut models = Vec::new();
    
    // Parse ollama list output
    // Skip the header line and process each model line
    for line in stdout.lines().skip(1) {
        if line.trim().is_empty() {
            continue;
        }
        
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 1 {
            let model_name = parts[0].to_string();
            models.push(LLMModel {
                id: model_name.clone(),
                name: model_name,
                description: Some("Local Ollama model".to_string()),
                context_length: None,
                input_cost: Some(0.0), // Local models are free
                output_cost: Some(0.0),
            });
        }
    }

    Ok(models)
}

#[tauri::command]
async fn open_ollama_website(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url("https://ollama.ai", None::<String>)
        .map_err(|e| format!("Failed to open URL: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn save_llm_settings(app: tauri::AppHandle, settings: LLMSettings) -> Result<(), String> {
    let store = app.store("llm-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    store.set("settings", serialized_settings);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn load_llm_settings(app: tauri::AppHandle) -> Result<Option<LLMSettings>, String> {
    let store = app.store("llm-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    match store.get("settings") {
        Some(value) => {
            let settings: LLMSettings = serde_json::from_value(value)
                .map_err(|e| format!("Failed to deserialize settings: {}", e))?;
            Ok(Some(settings))
        },
        None => Ok(None),
    }
}

#[tauri::command]
async fn get_default_llm_settings() -> Result<LLMSettings, String> {
    let mut providers = HashMap::new();
    
    // OpenAI Provider
    providers.insert("openai".to_string(), LLMProvider {
        id: "openai".to_string(),
        name: "OpenAI".to_string(),
        provider_type: "openai".to_string(),
        base_url: Some("https://api.openai.com/v1".to_string()),
        api_key: None,
        models: vec![
            LLMModel {
                id: "gpt-4".to_string(),
                name: "GPT-4".to_string(),
                description: Some("Most capable GPT-4 model".to_string()),
                context_length: Some(8192),
                input_cost: Some(0.03),
                output_cost: Some(0.06),
            },
            LLMModel {
                id: "gpt-3.5-turbo".to_string(),
                name: "GPT-3.5 Turbo".to_string(),
                description: Some("Fast and efficient model".to_string()),
                context_length: Some(4096),
                input_cost: Some(0.001),
                output_cost: Some(0.002),
            },
        ],
        selected_model: Some("gpt-4".to_string()),
    });
    
    // OpenRouter Provider
    providers.insert("openrouter".to_string(), LLMProvider {
        id: "openrouter".to_string(),
        name: "OpenRouter".to_string(),
        provider_type: "openrouter".to_string(),
        base_url: Some("https://openrouter.ai/api/v1".to_string()),
        api_key: None,
        models: vec![], // Will be populated when API key is provided
        selected_model: None,
    });
    
    // Ollama Provider
    providers.insert("ollama".to_string(), LLMProvider {
        id: "ollama".to_string(),
        name: "Ollama".to_string(),
        provider_type: "ollama".to_string(),
        base_url: Some("http://localhost:11434".to_string()),
        api_key: None,
        models: vec![], // Will be populated when Ollama is detected
        selected_model: None,
    });
    
    Ok(LLMSettings {
        active_provider: "openai".to_string(),
        providers,
        system_prompt: String::new(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            greet, 
            start_drag,
            fetch_openrouter_models,
            check_ollama_installation,
            fetch_ollama_models,
            open_ollama_website,
            save_llm_settings,
            load_llm_settings,
            get_default_llm_settings
        ])
        .setup(|app| {
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
            
            // Register Cmd+, shortcut for Settings on macOS
            let shortcut_manager = app.global_shortcut();
            let shortcut = Shortcut::new(Some(tauri_plugin_global_shortcut::Modifiers::SUPER), tauri_plugin_global_shortcut::Code::Comma);
            
            shortcut_manager.on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    // Emit an event to the frontend to open settings
                    app.emit("shortcut://open-settings", ()).unwrap();
                }
            })?;
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
