use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::Emitter;
use tauri_plugin_store::StoreExt;
use std::path::Path;
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AIAgent {
    pub name: String,
    pub command: String,
    pub display_name: String,
    pub available: bool,
    pub enabled: bool,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentStatus {
    pub agents: Vec<AIAgent>,
}

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
pub struct AppSettings {
    #[serde(default = "default_show_console_output")]
    pub show_console_output: bool,
    #[serde(default)]
    pub projects_folder: Option<String>,
}

fn default_show_console_output() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProject {
    pub name: String,
    pub path: String,
    pub last_accessed: i64,
    pub is_git_repo: bool,
    pub git_branch: Option<String>,
    pub git_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectsData {
    pub projects: Vec<RecentProject>,
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
async fn validate_git_repository_url(url: String) -> Result<bool, String> {
    use std::process::Stdio;
    
    // Validate that git is available
    let git_check = tokio::process::Command::new("git")
        .arg("--version")
        .output()
        .await;
    
    match git_check {
        Ok(output) if !output.status.success() => {
            return Err("Git is not installed or not available in PATH".to_string());
        },
        Err(_) => {
            return Err("Git is not installed or not available in PATH".to_string());
        },
        _ => {}
    }

    // Use git ls-remote to check if repository URL is valid and accessible
    let output = tokio::process::Command::new("git")
        .args(&["ls-remote", "--heads", &url])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to validate repository: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Repository validation failed: {}", stderr));
    }

    Ok(true)
}

#[tauri::command]
async fn clone_repository(
    app: tauri::AppHandle,
    url: String, 
    destination: String
) -> Result<String, String> {
    use tokio::process::Command;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use std::process::Stdio;
    
    // Create parent directory if it doesn't exist
    if let Some(parent) = std::path::Path::new(&destination).parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            return Err(format!("Failed to create parent directory: {}", e));
        }
    }

    // Execute git clone command with progress
    let mut child = Command::new("git")
        .args(&["clone", "--progress", &url, &destination])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to execute git clone: {}", e))?;

    // Stream stderr (git outputs progress to stderr)
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        
        while let Some(line) = lines.next_line().await.unwrap_or(None) {
            // Emit progress to frontend
            let _ = app.emit("clone-progress", line.clone());
        }
    }

    // Wait for the process to complete
    let status = child.wait().await
        .map_err(|e| format!("Failed to wait for git clone: {}", e))?;

    if !status.success() {
        return Err("Git clone failed. Check the console output for details.".to_string());
    }

    Ok(format!("Repository cloned successfully to {}", destination))
}

#[tauri::command]
async fn get_user_home_directory() -> Result<String, String> {
    match dirs::home_dir() {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("Could not determine user home directory".to_string()),
    }
}

#[tauri::command]
async fn get_default_projects_folder() -> Result<String, String> {
    match dirs::home_dir() {
        Some(mut path) => {
            path.push("Projects");
            Ok(path.to_string_lossy().to_string())
        },
        None => Err("Could not determine user home directory".to_string()),
    }
}

#[tauri::command]
async fn ensure_directory_exists(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory {}: {}", path, e))?;
    Ok(())
}

#[tauri::command]
async fn save_projects_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let store = app.store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    store.set("projects_folder", serde_json::Value::String(path.clone()));
    
    store.save()
        .map_err(|e| format!("Failed to persist projects folder: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn load_projects_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let store = app.store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    match store.get("projects_folder") {
        Some(serde_json::Value::String(path)) => Ok(Some(path)),
        _ => Ok(None),
    }
}

#[tauri::command]
async fn save_app_settings(app: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let store = app.store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    store.set("app_settings", serialized_settings);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn load_app_settings(app: tauri::AppHandle) -> Result<AppSettings, String> {
    let store = app.store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    match store.get("app_settings") {
        Some(value) => {
            let settings: AppSettings = serde_json::from_value(value)
                .map_err(|e| format!("Failed to deserialize settings: {}", e))?;
            Ok(settings)
        },
        None => {
            // Return default settings
            Ok(AppSettings {
                show_console_output: true,
                projects_folder: None,
            })
        },
    }
}

#[tauri::command]
async fn save_agent_settings(app: tauri::AppHandle, settings: HashMap<String, bool>) -> Result<(), String> {
    let store = app.store("agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    store.set("agent_settings", serialized_settings);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn load_agent_settings(app: tauri::AppHandle) -> Result<HashMap<String, bool>, String> {
    let store = app.store("agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    match store.get("agent_settings") {
        Some(value) => {
            let settings: HashMap<String, bool> = serde_json::from_value(value)
                .map_err(|e| format!("Failed to deserialize settings: {}", e))?;
            Ok(settings)
        },
        None => {
            // Return default settings (all agents enabled)
            let mut default = HashMap::new();
            default.insert("claude".to_string(), true);
            default.insert("codex".to_string(), true);
            default.insert("gemini".to_string(), true);
            Ok(default)
        },
    }
}

#[tauri::command]
async fn check_ai_agents(app: tauri::AppHandle) -> Result<AgentStatus, String> {
    let agents = vec![
        ("claude", "Claude Code CLI"),
        ("codex", "Codex"),
        ("gemini", "Gemini"),
    ];

    // Load agent settings to see which ones are enabled
    let enabled_agents = load_agent_settings(app).await.unwrap_or_else(|_| {
        let mut default = HashMap::new();
        default.insert("claude".to_string(), true);
        default.insert("codex".to_string(), true);
        default.insert("gemini".to_string(), true);
        default
    });

    let mut checked_agents = Vec::new();
    
    for (command, display_name) in agents {
        let enabled = enabled_agents.get(command).unwrap_or(&true) == &true;
        let mut error_message: Option<String> = None;
        
        // Check availability for all agents (enabled and disabled)
        let available = if enabled {
            // For enabled agents, check if command exists and try to get more detailed status
            let check_result = tokio::process::Command::new("which")
                .arg(command)
                .output()
                .await;
            
            match check_result {
                Ok(output) => {
                    if output.status.success() {
                        // Command exists, now try to run it to get more detailed error info
                        let version_check = tokio::process::Command::new(command)
                            .arg("--version")
                            .output()
                            .await;
                            
                        match version_check {
                            Ok(version_output) => {
                                if !version_output.status.success() {
                                    let stderr = String::from_utf8_lossy(&version_output.stderr);
                                    // Check for common error patterns like "limit" or "credits"
                                    if stderr.to_lowercase().contains("limit") || 
                                       stderr.to_lowercase().contains("credit") ||
                                       stderr.to_lowercase().contains("quota") {
                                        error_message = Some(format!("Rate limit or quota reached: {}", stderr.trim()));
                                        false
                                    } else if !stderr.trim().is_empty() {
                                        error_message = Some(stderr.trim().to_string());
                                        false
                                    } else {
                                        true
                                    }
                                } else {
                                    true
                                }
                            }
                            Err(e) => {
                                error_message = Some(format!("Failed to execute {}: {}", command, e));
                                false
                            }
                        }
                    } else {
                        error_message = Some(format!("{} command not found in PATH", command));
                        false
                    }
                }
                Err(e) => {
                    error_message = Some(format!("Failed to check {}: {}", command, e));
                    false
                }
            }
        } else {
            // For disabled agents, don't check availability but mark as unavailable
            false
        };
        
        checked_agents.push(AIAgent {
            name: command.to_string(),
            command: command.to_string(),
            display_name: display_name.to_string(),
            available,
            enabled,
            error_message,
        });
    }
    
    Ok(AgentStatus {
        agents: checked_agents,
    })
}

#[tauri::command]
async fn monitor_ai_agents(app: tauri::AppHandle) -> Result<(), String> {
    // Start a background task to monitor agent status
    let app_clone = app.clone();
    tokio::spawn(async move {
        loop {
            if let Ok(status) = check_ai_agents(app_clone.clone()).await {
                // Emit the status update to the frontend
                let _ = app_clone.emit("ai-agent-status", status);
            }
            // Check every 10 seconds
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        }
    });
    
    Ok(())
}

async fn scan_projects_folder(projects_folder: &str) -> Result<Vec<RecentProject>, String> {
    let path = Path::new(projects_folder);
    
    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut projects = Vec::new();
    
    match fs::read_dir(path) {
        Ok(entries) => {
            for entry in entries {
                if let Ok(entry) = entry {
                    let entry_path = entry.path();
                    
                    // Only consider directories
                    if entry_path.is_dir() {
                        if let Some(name) = entry_path.file_name() {
                            if let Some(name_str) = name.to_str() {
                                // Skip hidden directories
                                if name_str.starts_with('.') {
                                    continue;
                                }
                                
                                let path_str = entry_path.to_string_lossy().to_string();
                                
                                // Check if it's a git repository
                                let git_dir = entry_path.join(".git");
                                let is_git_repo = git_dir.exists();
                                
                                let mut git_branch = None;
                                let mut git_status = None;
                                
                                if is_git_repo {
                                    // Get current git branch
                                    if let Ok(output) = std::process::Command::new("git")
                                        .args(&["-C", &path_str, "branch", "--show-current"])
                                        .output()
                                    {
                                        if output.status.success() {
                                            if let Ok(branch) = String::from_utf8(output.stdout) {
                                                let branch = branch.trim();
                                                if !branch.is_empty() {
                                                    git_branch = Some(branch.to_string());
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Get git status (clean/dirty)
                                    if let Ok(output) = std::process::Command::new("git")
                                        .args(&["-C", &path_str, "status", "--porcelain"])
                                        .output()
                                    {
                                        if output.status.success() {
                                            let status_output = String::from_utf8_lossy(&output.stdout);
                                            git_status = Some(if status_output.trim().is_empty() {
                                                "clean".to_string()
                                            } else {
                                                "dirty".to_string()
                                            });
                                        }
                                    }
                                }
                                
                                // Use file modification time as last accessed
                                let last_accessed = entry_path
                                    .metadata()
                                    .and_then(|m| m.modified())
                                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
                                    .unwrap_or(0);
                                
                                projects.push(RecentProject {
                                    name: name_str.to_string(),
                                    path: path_str,
                                    last_accessed,
                                    is_git_repo,
                                    git_branch,
                                    git_status,
                                });
                            }
                        }
                    }
                }
            }
        }
        Err(e) => {
            return Err(format!("Failed to read projects directory: {}", e));
        }
    }
    
    // Sort by last accessed time (most recent first)
    projects.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));
    
    // Limit to most recent 10 projects
    projects.truncate(10);
    
    Ok(projects)
}

#[tauri::command]
async fn list_recent_projects(app: tauri::AppHandle) -> Result<Vec<RecentProject>, String> {
    // Get projects folder from settings
    let projects_folder = match load_projects_folder(app.clone()).await? {
        Some(folder) => folder,
        None => get_default_projects_folder().await?,
    };
    
    scan_projects_folder(&projects_folder).await
}

#[tauri::command]
async fn add_project_to_recent(
    _app: tauri::AppHandle,
    project_path: String,
) -> Result<(), String> {
    // Update the last accessed time for this project
    // This will be handled by refreshing the projects list since we scan the folder
    // and use file modification time as the last accessed time
    
    // Update the modification time of the project directory
    use std::time::SystemTime;
    
    let path = Path::new(&project_path);
    if path.exists() && path.is_dir() {
        // Use filetime crate to set modification time on directories
        let now = SystemTime::now();
        let filetime = filetime::FileTime::from_system_time(now);
        let _ = filetime::set_file_mtime(path, filetime);
    }
    
    Ok(())
}

#[tauri::command]
async fn refresh_recent_projects(app: tauri::AppHandle) -> Result<Vec<RecentProject>, String> {
    // This is the same as list_recent_projects - we always scan fresh
    list_recent_projects(app).await
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
            validate_git_repository_url,
            clone_repository,
            get_user_home_directory,
            get_default_projects_folder,
            ensure_directory_exists,
            save_projects_folder,
            load_projects_folder,
            save_app_settings,
            load_app_settings,
            fetch_openrouter_models,
            check_ollama_installation,
            fetch_ollama_models,
            open_ollama_website,
            save_llm_settings,
            load_llm_settings,
            get_default_llm_settings,
            check_ai_agents,
            monitor_ai_agents,
            save_agent_settings,
            load_agent_settings,
            list_recent_projects,
            add_project_to_recent,
            refresh_recent_projects
        ])
        .setup(|app| {
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
            
            // Start monitoring AI agents on app startup
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = monitor_ai_agents(app_handle).await;
            });

            
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
