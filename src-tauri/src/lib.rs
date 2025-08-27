use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::Emitter;
use tauri_plugin_store::StoreExt;
use std::path::{Path, PathBuf};
use std::fs;
use std::env;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Command, Child};
use std::process::Stdio;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use once_cell::sync::Lazy;

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSettings {
    pub enabled: bool,
    pub model: Option<String>,
    pub sandbox_mode: bool,
    pub auto_approval: bool,
    pub session_timeout_minutes: u32,
    pub output_format: String,
    pub debug_mode: bool,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

impl Default for AgentSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            model: None,
            sandbox_mode: false,
            auto_approval: false,
            session_timeout_minutes: 30,
            output_format: "markdown".to_string(),
            debug_mode: false,
            max_tokens: None,
            temperature: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllAgentSettings {
    pub claude: AgentSettings,
    pub codex: AgentSettings,
    pub gemini: AgentSettings,
    pub max_concurrent_sessions: u32,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub is_directory: bool,
    pub extension: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryListing {
    pub current_directory: String,
    pub files: Vec<FileInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub content: String,
    pub role: String, // "user" or "assistant"
    pub timestamp: i64,
    pub agent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChunk {
    pub session_id: String,
    pub content: String,
    pub finished: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CLISession {
    pub id: String,
    pub agent: String,
    pub command: String,
    pub working_dir: Option<String>,
    pub is_active: bool,
    pub created_at: i64,
    pub last_activity: i64,
}

#[derive(Debug)]
struct ActiveSession {
    pub session: CLISession,
    pub process: Arc<Mutex<Option<Child>>>,
    pub stdin_sender: Option<mpsc::UnboundedSender<String>>,
}

impl Clone for ActiveSession {
    fn clone(&self) -> Self {
        Self {
            session: self.session.clone(),
            process: self.process.clone(),
            stdin_sender: self.stdin_sender.clone(),
        }
    }
}

impl Drop for ActiveSession {
    fn drop(&mut self) {
        // Clean up resources when ActiveSession is dropped
        let process = self.process.clone();
        tokio::spawn(async move {
            let mut process_guard = process.lock().await;
            if let Some(mut child) = process_guard.take() {
                let _ = child.kill().await;
            }
        });
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatus {
    pub active_sessions: Vec<CLISession>,
    pub total_sessions: usize,
}

// Constants for session management
const SESSION_TIMEOUT_SECONDS: i64 = 1800; // 30 minutes

static SESSIONS: Lazy<Arc<Mutex<HashMap<String, ActiveSession>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

// Secondary index for O(1) session lookup by agent+working_dir
static SESSION_INDEX: Lazy<Arc<Mutex<HashMap<String, String>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

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

// Session management helper functions
fn generate_session_key(agent: &str, working_dir: &Option<String>) -> String {
    match working_dir {
        Some(dir) => format!("{}:{}", agent, dir),
        None => agent.to_string(),
    }
}

fn get_agent_quit_command(agent: &str) -> &str {
    match agent {
        "claude" => "/quit",
        "codex" => "/exit", 
        "gemini" => "/quit",
        _ => "/quit",
    }
}

async fn build_agent_command_args(agent: &str, message: &str, app_handle: &tauri::AppHandle) -> Vec<String> {
    let mut args = Vec::new();
    
    // Try to get agent settings to include model preference
    let agent_settings = load_all_agent_settings(app_handle.clone()).await.unwrap_or_else(|_| {
        AllAgentSettings {
            claude: AgentSettings::default(),
            codex: AgentSettings::default(),
            gemini: AgentSettings::default(),
            max_concurrent_sessions: 10,
        }
    });

    let current_agent_settings = match agent {
        "claude" => &agent_settings.claude,
        "codex" => &agent_settings.codex,
        "gemini" => &agent_settings.gemini,
        _ => &AgentSettings::default(),
    };
    
    match agent {
        "claude" => {
            args.push("--print".to_string());
            
            // Add model flag if set in preferences
            if let Some(ref model) = current_agent_settings.model {
                if !model.is_empty() {
                    args.push("--model".to_string());
                    args.push(model.clone());
                }
            }
            
            if !message.is_empty() {
                args.push(message.to_string());
            }
        }
        "codex" => {
            args.push("exec".to_string());
            
            // Add model flag if set in preferences
            if let Some(ref model) = current_agent_settings.model {
                if !model.is_empty() {
                    args.push("--model".to_string());
                    args.push(model.clone());
                }
            }
            
            if !message.is_empty() {
                args.push(message.to_string());
            }
        }
        "gemini" => {
            args.push("--prompt".to_string());
            
            // Add model flag if set in preferences
            if let Some(ref model) = current_agent_settings.model {
                if !model.is_empty() {
                    args.push("--model".to_string());
                    args.push(model.clone());
                }
            }
            
            if !message.is_empty() {
                args.push(message.to_string());
            }
        }
        _ => {
            // For unknown agents or test commands, pass as-is
            if !message.is_empty() {
                args.push(message.to_string());
            }
        }
    }
    
    args
}

fn parse_command_structure(agent: &str, message: &str) -> (String, String) {
    // Handle different command patterns:
    // 1. "/claude /help" -> agent: "claude", message: "/help"
    // 2. "/claude help" -> agent: "claude", message: "help"
    // 3. "/help" when agent is already "claude" -> agent: "claude", message: "/help"
    // 4. "help" when agent is "claude" -> agent: "claude", message: "help"
    
    if message.starts_with('/') {
        let parts: Vec<&str> = message.trim_start_matches('/').split_whitespace().collect();
        if parts.is_empty() {
            return (agent.to_string(), "help".to_string());
        }
        
        // Check if first part is an agent name
        let agent_names = ["claude", "codex", "gemini", "test"];
        if agent_names.contains(&parts[0]) {
            let actual_agent = parts[0].to_string();
            let remaining_parts = &parts[1..];
            
            if remaining_parts.is_empty() {
                // Just "/claude" -> start interactive session
                (actual_agent, String::new())
            } else {
                // "/claude /help" or "/claude help"
                let command = remaining_parts.join(" ");
                let formatted_command = if command.starts_with('/') {
                    command
                } else {
                    command
                };
                (actual_agent, formatted_command)
            }
        } else {
            // "/help" -> treat as subcommand for current agent
            (agent.to_string(), message.to_string())
        }
    } else {
        // Regular message without leading slash
        (agent.to_string(), message.to_string())
    }
}

async fn terminate_session_process(session_id: &str) -> Result<(), String> {
    // Use single locks to prevent race conditions and update both maps atomically
    let session_info = {
        let mut sessions = SESSIONS.lock().await;
        sessions.remove(session_id)
    };
    
    if let Some(session) = session_info {
        // Remove from index as well
        {
            let session_key = generate_session_key(&session.session.agent, &session.session.working_dir);
            let mut session_index = SESSION_INDEX.lock().await;
            session_index.remove(&session_key);
        }
        
        // Send quit command to the process first
        if let Some(sender) = &session.stdin_sender {
            let quit_cmd = get_agent_quit_command(&session.session.agent);
            let _ = sender.send(format!("{}\n", quit_cmd));
            
            // Give the process a moment to gracefully exit
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
        
        // Then forcefully kill if still running
        let mut process_guard = session.process.lock().await;
        if let Some(mut process) = process_guard.take() {
            let _ = process.kill().await;
        }
    }
    
    Ok(())
}

async fn cleanup_inactive_sessions() -> Result<(), String> {
    let mut sessions_to_remove = Vec::new();
    let current_time = chrono::Utc::now().timestamp();
    
    {
        let sessions = SESSIONS.lock().await;
        
        for (id, session) in sessions.iter() {
            // Remove sessions inactive for configured timeout
            if current_time - session.session.last_activity > SESSION_TIMEOUT_SECONDS {
                sessions_to_remove.push(id.clone());
            }
        }
    }
    
    for session_id in sessions_to_remove {
        let _ = terminate_session_process(&session_id).await;
    }
    
    Ok(())
}

// Check if a command is available in the system
async fn check_command_available(command: &str) -> bool {
    let check_cmd = if cfg!(target_os = "windows") {
        Command::new("where").arg(command).output().await
    } else {
        Command::new("which").arg(command).output().await
    };
    
    match check_cmd {
        Ok(output) => output.status.success(),
        Err(_) => false,
    }
}

#[tauri::command]
async fn execute_persistent_cli_command(
    app: tauri::AppHandle,
    session_id: String,
    agent: String,
    message: String,
    working_dir: Option<String>,
) -> Result<(), String> {
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    let _current_time = chrono::Utc::now().timestamp();
    
    tokio::spawn(async move {
        // Parse command structure to handle both "/agent subcommand" and direct subcommands
        let (agent_name, actual_message) = parse_command_structure(&agent, &message);
        
        // Emit session status info
        let info_chunk = StreamChunk {
            session_id: session_id_clone.clone(),
            content: format!("🔗 Agent: {} | Command: {}\n", agent_name, actual_message),
            finished: false,
        };
        let _ = app_clone.emit("cli-stream", info_chunk);
        
        // Check if command is available
        if !check_command_available(&agent_name).await {
            let error_chunk = StreamChunk {
                session_id: session_id_clone.clone(),
                content: format!("❌ Command '{}' not found. Please install it first:\n\n", agent_name),
                finished: false,
            };
            let _ = app_clone.emit("cli-stream", error_chunk);
            
            // Provide installation instructions
            let install_instructions = match agent_name.as_str() {
                "claude" => "Install Claude CLI: https://docs.anthropic.com/claude/docs/cli\n",
                "codex" => "Install GitHub Copilot CLI: https://github.com/features/copilot\n", 
                "gemini" => "Install Gemini CLI: https://cloud.google.com/sdk/docs/install\n",
                _ => "Please check the official documentation for installation instructions.\n",
            };
            
            let instruction_chunk = StreamChunk {
                session_id: session_id_clone,
                content: install_instructions.to_string(),
                finished: true,
            };
            let _ = app_clone.emit("cli-stream", instruction_chunk);
            return;
        }
        
        // Execute non-interactive command directly instead of persistent session
        let command_args = build_agent_command_args(&agent_name, &actual_message, &app_clone).await;
        
        let mut cmd = Command::new(&agent_name);
        cmd.args(&command_args)
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());
           
        if let Some(dir) = &working_dir {
            cmd.current_dir(dir);
        }
        
        match cmd.spawn() {
            Ok(mut child) => {
                // Stream stdout
                if let Some(stdout) = child.stdout.take() {
                    let app_for_stdout = app_clone.clone();
                    let session_id_for_stdout = session_id_clone.clone();
                    tokio::spawn(async move {
                        let reader = BufReader::new(stdout);
                        let mut lines = reader.lines();
                        
                        while let Ok(Some(line)) = lines.next_line().await {
                            let chunk = StreamChunk {
                                session_id: session_id_for_stdout.clone(),
                                content: line + "\n",
                                finished: false,
                            };
                            let _ = app_for_stdout.emit("cli-stream", chunk);
                        }
                    });
                }
                
                // Stream stderr
                if let Some(stderr) = child.stderr.take() {
                    let app_for_stderr = app_clone.clone();
                    let session_id_for_stderr = session_id_clone.clone();
                    tokio::spawn(async move {
                        let reader = BufReader::new(stderr);
                        let mut lines = reader.lines();
                        
                        while let Ok(Some(line)) = lines.next_line().await {
                            let chunk = StreamChunk {
                                session_id: session_id_for_stderr.clone(),
                                content: format!("ERROR: {}\n", line),
                                finished: false,
                            };
                            let _ = app_for_stderr.emit("cli-stream", chunk);
                        }
                    });
                }
                
                // Wait for completion
                match child.wait().await {
                    Ok(status) => {
                        let final_chunk = StreamChunk {
                            session_id: session_id_clone,
                            content: if status.success() {
                                "\n✅ Command completed successfully\n".to_string()
                            } else {
                                format!("\n❌ Command failed with exit code: {}\n", status.code().unwrap_or(-1))
                            },
                            finished: true,
                        };
                        let _ = app_clone.emit("cli-stream", final_chunk);
                    }
                    Err(e) => {
                        let error_chunk = StreamChunk {
                            session_id: session_id_clone,
                            content: format!("❌ Process error: {}\n", e),
                            finished: true,
                        };
                        let _ = app_clone.emit("cli-stream", error_chunk);
                    }
                }
            }
            Err(e) => {
                let error_message = if e.kind() == std::io::ErrorKind::NotFound {
                    format!("Command '{}' not found. Please make sure it's installed and available in your PATH.", agent_name)
                } else {
                    format!("Failed to start {}: {}", agent_name, e)
                };
                
                let error_chunk = StreamChunk {
                    session_id: session_id_clone.clone(),
                    content: format!("❌ {}\n", error_message),
                    finished: true,
                };
                let _ = app_clone.emit("cli-stream", error_chunk);
                return;
            }
        }
    });
    
    Ok(())
}

#[tauri::command]
async fn execute_cli_command(
    app: tauri::AppHandle,
    session_id: String,
    command: String,
    args: Vec<String>,
    working_dir: Option<String>,
) -> Result<(), String> {
    // Legacy function - redirect to persistent session handler
    let message = args.join(" ");
    execute_persistent_cli_command(app, session_id, command, message, working_dir).await
}

#[tauri::command]
async fn execute_claude_command(
    app: tauri::AppHandle,
    session_id: String,
    message: String,
    working_dir: Option<String>,
) -> Result<(), String> {
    execute_persistent_cli_command(app, session_id, "claude".to_string(), message, working_dir).await
}

#[tauri::command]
async fn execute_codex_command(
    app: tauri::AppHandle,
    session_id: String,
    message: String,
    working_dir: Option<String>,
) -> Result<(), String> {
    execute_persistent_cli_command(app, session_id, "codex".to_string(), message, working_dir).await
}

#[tauri::command]
async fn execute_gemini_command(
    app: tauri::AppHandle,
    session_id: String,
    message: String,
    working_dir: Option<String>,
) -> Result<(), String> {
    execute_persistent_cli_command(app, session_id, "gemini".to_string(), message, working_dir).await
}

// Test command to demonstrate CLI streaming (this will always work)
#[tauri::command]
async fn execute_test_command(
    app: tauri::AppHandle,
    session_id: String,
    message: String,
    _working_dir: Option<String>,
) -> Result<(), String> {
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    
    tokio::spawn(async move {
        // Simulate streaming response for testing
        let user_message = format!("💭 You said: {}", message);
        let lines = vec![
            "🔍 Processing your request...".to_string(),
            "📝 Analyzing the message...".to_string(),
            user_message,
            "✅ CLI streaming is working correctly!".to_string(),
            "🚀 All systems operational.".to_string(),
        ];
        
        for (i, line) in lines.iter().enumerate() {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            
            let chunk = StreamChunk {
                session_id: session_id_clone.clone(),
                content: format!("{}\n", line),
                finished: i == lines.len() - 1,
            };
            let _ = app_clone.emit("cli-stream", chunk);
        }
    });
    
    Ok(())
}

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
async fn save_all_agent_settings(app: tauri::AppHandle, settings: AllAgentSettings) -> Result<(), String> {
    let store = app.store("all-agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    let serialized_settings = serde_json::to_value(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    
    store.set("all_agent_settings", serialized_settings);
    
    store.save()
        .map_err(|e| format!("Failed to persist settings: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn load_all_agent_settings(app: tauri::AppHandle) -> Result<AllAgentSettings, String> {
    let store = app.store("all-agent-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    match store.get("all_agent_settings") {
        Some(value) => {
            let settings: AllAgentSettings = serde_json::from_value(value)
                .map_err(|e| format!("Failed to deserialize settings: {}", e))?;
            Ok(settings)
        },
        None => {
            // Return default settings
            Ok(AllAgentSettings {
                claude: AgentSettings::default(),
                codex: AgentSettings::default(),
                gemini: AgentSettings::default(),
                max_concurrent_sessions: 10,
            })
        },
    }
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
async fn check_project_name_conflict(projects_folder: String, project_name: String) -> Result<bool, String> {
    let project_path = std::path::Path::new(&projects_folder).join(&project_name);
    Ok(project_path.exists())
}

#[tauri::command]
async fn create_new_project_with_git(projects_folder: String, project_name: String) -> Result<String, String> {
    use std::process::Stdio;
    
    let project_path = std::path::Path::new(&projects_folder).join(&project_name);
    let project_path_str = project_path.to_string_lossy().to_string();
    
    // Check if project already exists
    if project_path.exists() {
        return Err(format!("A project named '{}' already exists", project_name));
    }
    
    // Create the directory
    std::fs::create_dir_all(&project_path)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;
    
    // Initialize git repository
    let git_init = tokio::process::Command::new("git")
        .args(&["init"])
        .current_dir(&project_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to initialize git repository: {}", e))?;
    
    if !git_init.status.success() {
        let stderr = String::from_utf8_lossy(&git_init.stderr);
        return Err(format!("Git init failed: {}", stderr));
    }
    
    // Create README.md file
    let readme_content = format!("# {}\n\nA new project created with Commander.\n", project_name);
    let readme_path = project_path.join("README.md");
    std::fs::write(&readme_path, readme_content)
        .map_err(|e| format!("Failed to create README.md: {}", e))?;
    
    // Stage and commit the README
    let git_add = tokio::process::Command::new("git")
        .args(&["add", "README.md"])
        .current_dir(&project_path)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("Failed to stage README: {}", e))?;
    
    if !git_add.status.success() {
        let stderr = String::from_utf8_lossy(&git_add.stderr);
        return Err(format!("Git add failed: {}", stderr));
    }
    
    let git_commit = tokio::process::Command::new("git")
        .args(&["commit", "-m", "Initial commit with README"])
        .current_dir(&project_path)
        .stdin(Stdio::null())
        .output()
        .await
        .map_err(|e| format!("Failed to commit README: {}", e))?;
    
    if !git_commit.status.success() {
        let stderr = String::from_utf8_lossy(&git_commit.stderr);
        return Err(format!("Git commit failed: {}", stderr));
    }
    
    Ok(project_path_str)
}

#[tauri::command]
async fn get_active_sessions() -> Result<SessionStatus, String> {
    let sessions = SESSIONS.lock().await;
    
    let active_sessions: Vec<CLISession> = sessions
        .values()
        .map(|session| session.session.clone())
        .collect();
    
    Ok(SessionStatus {
        active_sessions: active_sessions.clone(),
        total_sessions: active_sessions.len(),
    })
}

#[tauri::command]
async fn terminate_session(session_id: String) -> Result<(), String> {
    terminate_session_process(&session_id).await
}

#[tauri::command]
async fn terminate_all_sessions() -> Result<(), String> {
    let session_ids: Vec<String> = {
        let sessions = SESSIONS.lock().await;
        sessions.keys().cloned().collect()
    };
    
    for session_id in session_ids {
        let _ = terminate_session_process(&session_id).await;
    }
    
    Ok(())
}

#[tauri::command]
async fn send_quit_command_to_session(session_id: String) -> Result<(), String> {
    let sessions = SESSIONS.lock().await;
    
    if let Some(session) = sessions.get(&session_id) {
        if let Some(ref sender) = session.stdin_sender {
            let quit_cmd = get_agent_quit_command(&session.session.agent);
            sender.send(format!("{}\n", quit_cmd))
                .map_err(|e| format!("Failed to send quit command: {}", e))?;
        } else {
            return Err("Session stdin not available".to_string());
        }
    } else {
        return Err("Session not found".to_string());
    }
    
    Ok(())
}

#[tauri::command]
async fn cleanup_sessions() -> Result<(), String> {
    cleanup_inactive_sessions().await
}

#[tauri::command]
async fn fetch_claude_models() -> Result<Vec<String>, String> {
    // Check if Claude CLI is available
    if !check_command_available("claude").await {
        return Err("Claude CLI is not installed or not available in PATH".to_string());
    }

    // Try to get models from Claude CLI help output
    let output = Command::new("claude")
        .arg("--help")
        .output()
        .await
        .map_err(|e| format!("Failed to execute claude --help: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Claude CLI help command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();

    // Parse help output for model information
    // Look for lines containing model names or --model parameter info
    for line in stdout.lines() {
        let line = line.trim().to_lowercase();
        if line.contains("model") && (line.contains("claude") || line.contains("sonnet") || line.contains("opus") || line.contains("haiku")) {
            // Extract model names if they appear to be model identifiers
            if line.contains("claude-3") || line.contains("claude-3.5") {
                // Common Claude model patterns
                if line.contains("opus") { models.push("claude-3-opus".to_string()); }
                if line.contains("sonnet") { models.push("claude-3-sonnet".to_string()); }
                if line.contains("haiku") { models.push("claude-3-haiku".to_string()); }
                if line.contains("3.5") && line.contains("sonnet") { models.push("claude-3-5-sonnet".to_string()); }
            }
        }
    }

    // If no models found in help, provide common Claude models as fallback
    if models.is_empty() {
        models = vec![
            "claude-3-5-sonnet".to_string(),
            "claude-3-opus".to_string(),
            "claude-3-sonnet".to_string(),
            "claude-3-haiku".to_string(),
        ];
    }

    // Remove duplicates
    models.sort();
    models.dedup();

    Ok(models)
}

#[tauri::command]
async fn fetch_codex_models() -> Result<Vec<String>, String> {
    // Check if codex/gh CLI is available
    if !check_command_available("codex").await && !check_command_available("gh").await {
        return Err("Codex/GitHub CLI is not installed or not available in PATH".to_string());
    }

    let mut models = Vec::new();

    // Try codex command first
    if check_command_available("codex").await {
        let output = Command::new("codex")
            .arg("--help")
            .output()
            .await
            .map_err(|e| format!("Failed to execute codex --help: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Parse output for model information
            for line in stdout.lines() {
                let line = line.trim().to_lowercase();
                if line.contains("model") && (line.contains("gpt") || line.contains("codex")) {
                    if line.contains("gpt-4") { models.push("gpt-4".to_string()); }
                    if line.contains("gpt-3.5") { models.push("gpt-3.5-turbo".to_string()); }
                    if line.contains("codex") { models.push("code-davinci-002".to_string()); }
                }
            }
        }
    }

    // Try GitHub CLI copilot extension
    if check_command_available("gh").await && models.is_empty() {
        let output = Command::new("gh")
            .args(&["copilot", "--help"])
            .output()
            .await;

        if let Ok(output) = output {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                for line in stdout.lines() {
                    let line = line.trim().to_lowercase();
                    if line.contains("model") && line.contains("gpt") {
                        if line.contains("gpt-4") { models.push("gpt-4".to_string()); }
                        if line.contains("gpt-3.5") { models.push("gpt-3.5-turbo".to_string()); }
                    }
                }
            }
        }
    }

    // Fallback to common Codex/GitHub Copilot models
    if models.is_empty() {
        models = vec![
            "gpt-4".to_string(),
            "gpt-3.5-turbo".to_string(),
            "code-davinci-002".to_string(),
        ];
    }

    // Remove duplicates
    models.sort();
    models.dedup();

    Ok(models)
}

#[tauri::command]
async fn fetch_gemini_models() -> Result<Vec<String>, String> {
    // Check if Gemini CLI is available
    if !check_command_available("gemini").await {
        return Err("Gemini CLI is not installed or not available in PATH".to_string());
    }

    let output = Command::new("gemini")
        .arg("--help")
        .output()
        .await
        .map_err(|e| format!("Failed to execute gemini --help: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Gemini CLI help command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut models = Vec::new();

    // Parse help output for model information
    for line in stdout.lines() {
        let line = line.trim().to_lowercase();
        if line.contains("model") && line.contains("gemini") {
            if line.contains("gemini-pro") { models.push("gemini-pro".to_string()); }
            if line.contains("gemini-1.5") { models.push("gemini-1.5-pro".to_string()); }
            if line.contains("gemini-ultra") { models.push("gemini-ultra".to_string()); }
            if line.contains("gemini-flash") { models.push("gemini-1.5-flash".to_string()); }
        }
    }

    // Fallback to common Gemini models
    if models.is_empty() {
        models = vec![
            "gemini-1.5-pro".to_string(),
            "gemini-1.5-flash".to_string(),
            "gemini-pro".to_string(),
        ];
    }

    // Remove duplicates
    models.sort();
    models.dedup();

    Ok(models)
}

#[tauri::command]
async fn fetch_agent_models(agent: String) -> Result<Vec<String>, String> {
    match agent.as_str() {
        "claude" => fetch_claude_models().await,
        "codex" => fetch_codex_models().await,
        "gemini" => fetch_gemini_models().await,
        _ => Err(format!("Unknown agent: {}", agent)),
    }
}

#[tauri::command]
async fn get_git_global_config() -> Result<HashMap<String, String>, String> {
    let output = tokio::process::Command::new("git")
        .args(&["config", "--global", "--list"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute git config --global --list: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Git global config command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut config = HashMap::new();

    for line in stdout.lines() {
        if let Some((key, value)) = line.split_once('=') {
            config.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    Ok(config)
}

#[tauri::command]
async fn get_git_local_config() -> Result<HashMap<String, String>, String> {
    let output = tokio::process::Command::new("git")
        .args(&["config", "--local", "--list"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute git config --local --list: {}", e))?;

    if !output.status.success() {
        // Not in a git repository - return empty config
        return Ok(HashMap::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut config = HashMap::new();

    for line in stdout.lines() {
        if let Some((key, value)) = line.split_once('=') {
            config.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    Ok(config)
}

#[tauri::command]
async fn get_git_aliases() -> Result<HashMap<String, String>, String> {
    let output = tokio::process::Command::new("git")
        .args(&["config", "--global", "--get-regexp", "alias\\..*"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute git config for aliases: {}", e))?;

    if !output.status.success() {
        // No aliases found - return empty HashMap
        return Ok(HashMap::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut aliases = HashMap::new();

    for line in stdout.lines() {
        if let Some((key, value)) = line.split_once(' ') {
            if let Some(alias_name) = key.strip_prefix("alias.") {
                aliases.insert(alias_name.to_string(), value.trim().to_string());
            }
        }
    }

    Ok(aliases)
}

// File system helper functions for file mention system
fn is_valid_file_extension(path: &Path, allowed_extensions: &[&str]) -> bool {
    if allowed_extensions.is_empty() {
        return true; // No filtering if no extensions specified
    }
    
    if let Some(ext) = path.extension() {
        if let Some(ext_str) = ext.to_str() {
            return allowed_extensions.iter().any(|&allowed| allowed.eq_ignore_ascii_case(ext_str));
        }
    }
    false
}

fn should_skip_directory(dir_name: &str) -> bool {
    // Skip common directories that shouldn't be indexed for file mentions
    matches!(dir_name, 
        ".git" | ".svn" | ".hg" | 
        "node_modules" | ".next" | ".nuxt" | "dist" | "build" | "out" |
        "target" | "Cargo.lock" |
        ".vscode" | ".idea" |
        "__pycache__" | ".pytest_cache" |
        ".DS_Store" | "Thumbs.db" |
        "coverage" | ".nyc_output"
    )
}

fn collect_files_recursive(
    dir_path: &Path,
    base_path: &Path,
    allowed_extensions: &[&str],
    max_depth: usize,
    current_depth: usize,
) -> Result<Vec<FileInfo>, String> {
    if current_depth > max_depth {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    
    let entries = fs::read_dir(dir_path)
        .map_err(|e| format!("Failed to read directory {}: {}", dir_path.display(), e))?;

    for entry in entries {
        let entry = entry
            .map_err(|e| format!("Failed to process directory entry: {}", e))?;
        
        let entry_path = entry.path();
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy().to_string();

        // Skip hidden files and directories
        if file_name_str.starts_with('.') {
            continue;
        }

        if entry_path.is_dir() {
            // Skip directories we shouldn't index
            if should_skip_directory(&file_name_str) {
                continue;
            }
            
            // Recursively collect files from subdirectories
            let mut subdir_files = collect_files_recursive(
                &entry_path, 
                base_path, 
                allowed_extensions, 
                max_depth, 
                current_depth + 1
            )?;
            files.append(&mut subdir_files);
            
        } else if entry_path.is_file() {
            // Check if file has allowed extension
            if is_valid_file_extension(&entry_path, allowed_extensions) {
                let relative_path = entry_path
                    .strip_prefix(base_path)
                    .map_err(|_| "Failed to create relative path".to_string())?
                    .to_string_lossy()
                    .to_string();

                let extension = entry_path
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .map(|s| s.to_string());

                files.push(FileInfo {
                    name: file_name_str,
                    path: entry_path.to_string_lossy().to_string(),
                    relative_path,
                    is_directory: false,
                    extension,
                });
            }
        }
    }

    Ok(files)
}

#[tauri::command]
async fn get_current_working_directory() -> Result<String, String> {
    let current_dir = env::current_dir()
        .map_err(|e| format!("Failed to get current working directory: {}", e))?;
    
    Ok(current_dir.to_string_lossy().to_string())
}

#[tauri::command]
async fn set_current_working_directory(path: String) -> Result<(), String> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", path.display()));
    }
    
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }
    
    env::set_current_dir(path)
        .map_err(|e| format!("Failed to set current working directory: {}", e))
}

#[tauri::command]
async fn list_files_in_directory(
    directory_path: Option<String>,
    extensions: Option<Vec<String>>,
    max_depth: Option<usize>,
) -> Result<DirectoryListing, String> {
    // Default to current working directory if none specified
    let base_path = match directory_path {
        Some(path) => PathBuf::from(path),
        None => env::current_dir()
            .map_err(|e| format!("Failed to get current working directory: {}", e))?,
    };
    
    if !base_path.exists() {
        return Err(format!("Directory does not exist: {}", base_path.display()));
    }
    
    if !base_path.is_dir() {
        return Err(format!("Path is not a directory: {}", base_path.display()));
    }
    
    // Set reasonable defaults
    let max_depth = max_depth.unwrap_or(5); // Max 5 levels deep
    let allowed_extensions: Vec<&str> = extensions
        .as_ref()
        .map(|exts| exts.iter().map(|s| s.as_str()).collect())
        .unwrap_or_else(|| {
            // Default to common code file extensions
            vec![
                "rs", "js", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "h", "hpp",
                "go", "php", "rb", "swift", "kt", "cs", "dart", "vue", "svelte",
                "html", "css", "scss", "sass", "less", "md", "txt", "json", "yaml", "yml",
                "toml", "xml", "sql", "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd"
            ]
        });
    
    // Collect files recursively
    let files = collect_files_recursive(&base_path, &base_path, &allowed_extensions, max_depth, 0)?;
    
    // Sort files by relative path for consistent ordering
    let mut sorted_files = files;
    sorted_files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    
    Ok(DirectoryListing {
        current_directory: base_path.to_string_lossy().to_string(),
        files: sorted_files,
    })
}

#[tauri::command]
async fn search_files_by_name(
    directory_path: Option<String>,
    search_term: String,
    extensions: Option<Vec<String>>,
    max_depth: Option<usize>,
) -> Result<DirectoryListing, String> {
    if search_term.trim().is_empty() {
        return Err("Search term cannot be empty".to_string());
    }
    
    // Get all files first
    let listing = list_files_in_directory(directory_path, extensions, max_depth).await?;
    
    // Filter by search term (case-insensitive)
    let search_lower = search_term.to_lowercase();
    let filtered_files: Vec<FileInfo> = listing
        .files
        .into_iter()
        .filter(|file| {
            file.name.to_lowercase().contains(&search_lower) ||
            file.relative_path.to_lowercase().contains(&search_lower)
        })
        .collect();
    
    Ok(DirectoryListing {
        current_directory: listing.current_directory,
        files: filtered_files,
    })
}

#[tauri::command]
async fn get_file_info(file_path: String) -> Result<Option<FileInfo>, String> {
    let path = Path::new(&file_path);
    
    if !path.exists() {
        return Ok(None);
    }
    
    // Get the parent directory to create relative path
    let parent = path.parent().unwrap_or(Path::new(""));
    let relative_path = path
        .strip_prefix(parent)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string();
    
    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|s| s.to_string());
    
    Ok(Some(FileInfo {
        name: path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Unknown".to_string()),
        path: path.to_string_lossy().to_string(),
        relative_path,
        is_directory: path.is_dir(),
        extension,
    }))
}

#[tauri::command]
async fn get_git_worktree_enabled() -> Result<bool, String> {
    // Check if git worktree is supported and available
    let output = tokio::process::Command::new("git")
        .args(&["worktree", "--help"])
        .output()
        .await
        .map_err(|e| format!("Failed to check git worktree support: {}", e))?;

    // Git worktree is available if the help command succeeds
    Ok(output.status.success())
}

#[tauri::command]
async fn set_git_worktree_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    // Save the workspace (git worktree) preference to app settings
    let store = app.store("app-settings.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;
    
    store.set("git_worktree_enabled", serde_json::Value::Bool(enabled));
    
    store.save()
        .map_err(|e| format!("Failed to persist git worktree setting: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn get_git_worktrees() -> Result<Vec<HashMap<String, String>>, String> {
    let output = tokio::process::Command::new("git")
        .args(&["worktree", "list", "--porcelain"])
        .output()
        .await
        .map_err(|e| format!("Failed to execute git worktree list: {}", e))?;

    if !output.status.success() {
        // Not in a git repository or worktree not supported
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_worktree = HashMap::new();

    for line in stdout.lines() {
        if line.starts_with("worktree ") {
            if !current_worktree.is_empty() {
                worktrees.push(current_worktree);
                current_worktree = HashMap::new();
            }
            current_worktree.insert("path".to_string(), line[9..].to_string());
        } else if line.starts_with("HEAD ") {
            current_worktree.insert("head".to_string(), line[5..].to_string());
        } else if line.starts_with("branch ") {
            current_worktree.insert("branch".to_string(), line[7..].to_string());
        } else if line == "bare" {
            current_worktree.insert("bare".to_string(), "true".to_string());
        } else if line == "detached" {
            current_worktree.insert("detached".to_string(), "true".to_string());
        }
    }

    if !current_worktree.is_empty() {
        worktrees.push(current_worktree);
    }

    Ok(worktrees)
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
            execute_cli_command,
            execute_persistent_cli_command,
            execute_claude_command,
            execute_codex_command,
            execute_gemini_command,
            execute_test_command,
            get_active_sessions,
            terminate_session,
            terminate_all_sessions,
            send_quit_command_to_session,
            cleanup_sessions,
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
            fetch_claude_models,
            fetch_codex_models,
            fetch_gemini_models,
            fetch_agent_models,
            check_ai_agents,
            monitor_ai_agents,
            save_agent_settings,
            load_agent_settings,
            save_all_agent_settings,
            load_all_agent_settings,
            list_recent_projects,
            add_project_to_recent,
            refresh_recent_projects,
            check_project_name_conflict,
            create_new_project_with_git,
            get_git_global_config,
            get_git_local_config,
            get_git_aliases,
            get_git_worktree_enabled,
            set_git_worktree_enabled,
            get_git_worktrees,
            get_current_working_directory,
            set_current_working_directory,
            list_files_in_directory,
            search_files_by_name,
            get_file_info
        ])
        .setup(|app| {
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
            
            // Start monitoring AI agents on app startup
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = monitor_ai_agents(app_handle).await;
            });
            
            // Start session cleanup task
            tauri::async_runtime::spawn(async move {
                loop {
                    let _ = cleanup_inactive_sessions().await;
                    // Cleanup every 5 minutes
                    tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
                }
            });

            
            // Register Cmd+, shortcut for Settings on macOS
            let shortcut_manager = app.global_shortcut();
            let settings_shortcut = Shortcut::new(Some(tauri_plugin_global_shortcut::Modifiers::SUPER), tauri_plugin_global_shortcut::Code::Comma);
            
            shortcut_manager.on_shortcut(settings_shortcut, move |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    // Emit an event to the frontend to open settings
                    app.emit("shortcut://open-settings", ()).unwrap();
                }
            })?;
            
            // Register Cmd+Shift+P shortcut for Chat on macOS  
            let chat_shortcut = Shortcut::new(
                Some(tauri_plugin_global_shortcut::Modifiers::SUPER | tauri_plugin_global_shortcut::Modifiers::SHIFT), 
                tauri_plugin_global_shortcut::Code::KeyP
            );
            
            shortcut_manager.on_shortcut(chat_shortcut, move |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    // Emit an event to the frontend to toggle chat
                    app.emit("shortcut://toggle-chat", ()).unwrap();
                }
            })?;
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
