use std::collections::HashMap;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Command, Child};
use std::process::Stdio;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use once_cell::sync::Lazy;

use crate::models::*;
use crate::commands::settings_commands::load_all_agent_settings;

// Constants for session management
const SESSION_TIMEOUT_SECONDS: i64 = 1800; // 30 minutes

static SESSIONS: Lazy<Arc<Mutex<HashMap<String, ActiveSession>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

// Secondary index for O(1) session lookup by agent+working_dir
static SESSION_INDEX: Lazy<Arc<Mutex<HashMap<String, String>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

// Internal ActiveSession struct for session management (not serializable due to Child process)
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
pub async fn execute_persistent_cli_command(
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
pub async fn execute_cli_command(
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
pub async fn execute_claude_command(
    app: tauri::AppHandle,
    session_id: String,
    message: String,
    working_dir: Option<String>,
) -> Result<(), String> {
    execute_persistent_cli_command(app, session_id, "claude".to_string(), message, working_dir).await
}

#[tauri::command]
pub async fn execute_codex_command(
    app: tauri::AppHandle,
    session_id: String,
    message: String,
    working_dir: Option<String>,
) -> Result<(), String> {
    execute_persistent_cli_command(app, session_id, "codex".to_string(), message, working_dir).await
}

#[tauri::command]
pub async fn execute_gemini_command(
    app: tauri::AppHandle,
    session_id: String,
    message: String,
    working_dir: Option<String>,
) -> Result<(), String> {
    execute_persistent_cli_command(app, session_id, "gemini".to_string(), message, working_dir).await
}

// Test command to demonstrate CLI streaming (this will always work)
#[tauri::command]
pub async fn execute_test_command(
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

// Expose functions for session management
pub async fn cleanup_cli_sessions() -> Result<(), String> {
    cleanup_inactive_sessions().await
}

pub async fn get_sessions_status() -> Result<SessionStatus, String> {
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

pub async fn terminate_session_by_id(session_id: &str) -> Result<(), String> {
    terminate_session_process(session_id).await
}

pub async fn terminate_all_active_sessions() -> Result<(), String> {
    let session_ids: Vec<String> = {
        let sessions = SESSIONS.lock().await;
        sessions.keys().cloned().collect()
    };
    
    for session_id in session_ids {
        let _ = terminate_session_process(&session_id).await;
    }
    
    Ok(())
}

pub async fn send_quit_to_session(session_id: &str) -> Result<(), String> {
    let sessions = SESSIONS.lock().await;
    
    if let Some(session) = sessions.get(session_id) {
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