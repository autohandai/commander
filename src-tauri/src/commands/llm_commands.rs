use std::collections::HashMap;

use tauri::Emitter;
use tokio::process::Command;

use crate::commands::settings_commands::{load_agent_settings, load_all_agent_settings};
use crate::models::*;
use crate::services::agent_status_service::AgentStatusService;
use crate::services::llm_service;

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
pub async fn fetch_openrouter_models(api_key: String) -> Result<Vec<LLMModel>, String> {
    if api_key.trim().is_empty() {
        return Err("OpenRouter API key is required to fetch models".to_string());
    }

    llm_service::fetch_openrouter_models(&api_key).await
}

#[tauri::command]
pub async fn fetch_openai_models(api_key: String) -> Result<Vec<LLMModel>, String> {
    if api_key.trim().is_empty() {
        return Err("OpenAI API key is required to fetch models".to_string());
    }

    llm_service::fetch_openai_models(&api_key).await
}

#[tauri::command]
pub async fn check_ollama_installation() -> Result<bool, String> {
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
pub async fn fetch_ollama_models() -> Result<Vec<LLMModel>, String> {
    let output = tokio::process::Command::new("ollama")
        .arg("list")
        .output()
        .await
        .map_err(|e| format!("Failed to execute ollama list: {}", e))?;

    if !output.status.success() {
        return Err(
            "Failed to list Ollama models. Make sure Ollama is installed and running.".to_string(),
        );
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
pub async fn open_ollama_website(app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url("https://ollama.ai", None::<String>)
        .map_err(|e| format!("Failed to open URL: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn save_llm_settings(app: tauri::AppHandle, settings: LLMSettings) -> Result<(), String> {
    llm_service::save_llm_settings(&app, &settings).await
}

#[tauri::command]
pub async fn load_llm_settings(app: tauri::AppHandle) -> Result<Option<LLMSettings>, String> {
    match llm_service::load_llm_settings(&app).await {
        Ok(settings) => Ok(Some(settings)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn get_default_llm_settings() -> Result<LLMSettings, String> {
    Ok(llm_service::get_default_llm_settings())
}

#[tauri::command]
pub async fn fetch_claude_models() -> Result<Vec<String>, String> {
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
        if line.contains("model")
            && (line.contains("claude")
                || line.contains("sonnet")
                || line.contains("opus")
                || line.contains("haiku"))
        {
            // Extract model names if they appear to be model identifiers
            if line.contains("claude-3") || line.contains("claude-3.5") {
                // Common Claude model patterns
                if line.contains("opus") {
                    models.push("claude-3-opus".to_string());
                }
                if line.contains("sonnet") {
                    models.push("claude-3-sonnet".to_string());
                }
                if line.contains("haiku") {
                    models.push("claude-3-haiku".to_string());
                }
                if line.contains("3.5") && line.contains("sonnet") {
                    models.push("claude-3-5-sonnet".to_string());
                }
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
pub async fn fetch_codex_models() -> Result<Vec<String>, String> {
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
                    if line.contains("gpt-4") {
                        models.push("gpt-4".to_string());
                    }
                    if line.contains("gpt-3.5") {
                        models.push("gpt-3.5-turbo".to_string());
                    }
                    if line.contains("codex") {
                        models.push("code-davinci-002".to_string());
                    }
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
                        if line.contains("gpt-4") {
                            models.push("gpt-4".to_string());
                        }
                        if line.contains("gpt-3.5") {
                            models.push("gpt-3.5-turbo".to_string());
                        }
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
pub async fn fetch_gemini_models() -> Result<Vec<String>, String> {
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
            if line.contains("gemini-pro") {
                models.push("gemini-pro".to_string());
            }
            if line.contains("gemini-1.5") {
                models.push("gemini-1.5-pro".to_string());
            }
            if line.contains("gemini-ultra") {
                models.push("gemini-ultra".to_string());
            }
            if line.contains("gemini-flash") {
                models.push("gemini-1.5-flash".to_string());
            }
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
pub async fn fetch_agent_models(agent: String) -> Result<Vec<String>, String> {
    match agent.as_str() {
        "claude" => fetch_claude_models().await,
        "codex" => fetch_codex_models().await,
        "gemini" => fetch_gemini_models().await,
        "ollama" => Ok(fetch_ollama_models()
            .await?
            .into_iter()
            .map(|model| model.id)
            .collect()),
        _ => Err(format!("Unknown agent: {}", agent)),
    }
}

#[tauri::command]
pub async fn check_ai_agents(app: tauri::AppHandle) -> Result<AgentStatus, String> {
    let enabled_agents = load_agent_settings(app.clone()).await.unwrap_or_else(|_| {
        HashMap::from([
            ("autohand".to_string(), true),
            ("claude".to_string(), true),
            ("codex".to_string(), true),
            ("gemini".to_string(), true),
            ("ollama".to_string(), true),
        ])
    });

    // Load custom agents from persisted settings so they appear in the status bar
    let custom_agents = load_all_agent_settings(app)
        .await
        .map(|s| s.custom_agents)
        .unwrap_or_default();

    let mut service = AgentStatusService::new();
    service.check_agents_with_custom(&enabled_agents, &custom_agents)
        .await
}

#[tauri::command]
pub async fn generate_plan(prompt: String, system_prompt: String) -> Result<String, String> {
    // Check if Ollama is available
    if !check_ollama_installation().await? {
        return Err("Ollama is not installed or not running".to_string());
    }

    // Get available Ollama models
    let models = fetch_ollama_models().await?;
    if models.is_empty() {
        return Err(
            "No Ollama models available. Please pull a model first with 'ollama pull <model>'"
                .to_string(),
        );
    }

    // Use the first available model (you could make this configurable)
    let model = &models[0].id;

    // Combine system prompt with user prompt
    let full_prompt = format!("{}\n\nUser request: {}", system_prompt, prompt);

    // Call Ollama to generate the plan
    let output = tokio::process::Command::new("ollama")
        .arg("run")
        .arg(model)
        .arg(&full_prompt)
        .output()
        .await
        .map_err(|e| format!("Failed to execute ollama run: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Ollama command failed: {}", stderr));
    }

    let response = String::from_utf8(output.stdout)
        .map_err(|e| format!("Failed to parse ollama output: {}", e))?;

    // Try to extract JSON from the response if it's embedded in other text
    let response = response.trim();

    // Look for JSON in the response
    if let Some(json_start) = response.find('{') {
        if let Some(json_end) = response.rfind('}') {
            if json_start <= json_end {
                let json_part = &response[json_start..=json_end];
                // Validate that it's valid JSON
                if serde_json::from_str::<serde_json::Value>(json_part).is_ok() {
                    return Ok(json_part.to_string());
                }
            }
        }
    }

    // If no valid JSON found, return the raw response
    Ok(response.to_string())
}

#[tauri::command]
pub async fn monitor_ai_agents(app: tauri::AppHandle) -> Result<(), String> {
    // Start a background task to monitor agent status
    let app_clone = app.clone();
    tokio::spawn(async move {
        loop {
            if let Ok(status) = check_ai_agents(app_clone.clone()).await {
                // Emit the status update to the frontend
                let _ = app_clone.emit("ai-agent-status", &status);

                // Update tray menu with current agent statuses
                let agents: Vec<(String, bool)> = status
                    .agents
                    .iter()
                    .map(|a| (a.display_name.clone(), a.available))
                    .collect();
                if let Ok(menu) = crate::build_tray_menu(&app_clone, &agents) {
                    if let Some(tray) = app_clone.tray_by_id("main") {
                        let _ = tray.set_menu(Some(menu));
                    }
                }
            }
            // Check every 10 seconds
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        }
    });

    Ok(())
}

// ---------------------------------------------------------------------------
// Auto-detect coding CLI agents
// ---------------------------------------------------------------------------

/// A candidate agent binary to check for RPC/ACP support.
struct AgentCandidate {
    binary: &'static str,
    display_name: &'static str,
}

/// Curated list of known coding CLI agents (beyond Commander's built-ins).
const AGENT_CANDIDATES: &[AgentCandidate] = &[
    AgentCandidate { binary: "aider",     display_name: "Aider" },
    AgentCandidate { binary: "goose",     display_name: "Goose" },
    AgentCandidate { binary: "amp",       display_name: "Amp" },
    AgentCandidate { binary: "cline",     display_name: "Cline" },
    AgentCandidate { binary: "plandex",   display_name: "Plandex" },
    AgentCandidate { binary: "mentat",    display_name: "Mentat" },
    AgentCandidate { binary: "tabby",     display_name: "Tabby" },
    AgentCandidate { binary: "continue",  display_name: "Continue" },
    AgentCandidate { binary: "cursor",    display_name: "Cursor" },
    AgentCandidate { binary: "copilot",   display_name: "GitHub Copilot" },
    AgentCandidate { binary: "devin",     display_name: "Devin" },
    AgentCandidate { binary: "sweep",     display_name: "Sweep" },
    AgentCandidate { binary: "gpt-engineer", display_name: "GPT Engineer" },
    AgentCandidate { binary: "roo",       display_name: "Roo Code" },
    AgentCandidate { binary: "oi",        display_name: "Open Interpreter" },
    AgentCandidate { binary: "interpreter", display_name: "Open Interpreter" },
    AgentCandidate { binary: "kodu",      display_name: "Kodu" },
    AgentCandidate { binary: "aide",      display_name: "Aide" },
];

/// Built-in agent IDs that should be excluded from detection results.
const BUILTIN_AGENT_IDS: &[&str] = &["autohand", "claude", "codex", "gemini", "ollama"];

/// Scan the system for known coding CLI agents and check for RPC/ACP support.
///
/// Returns agents found on PATH that aren't already registered as built-in or
/// custom agents.
#[tauri::command]
pub async fn detect_cli_agents(app: tauri::AppHandle) -> Result<Vec<DetectedAgent>, String> {
    use which::which;

    // Load existing custom agents so we don't suggest duplicates
    let existing_custom_ids: std::collections::HashSet<String> = load_all_agent_settings(app)
        .await
        .map(|s| s.custom_agents.into_iter().map(|a| a.id).collect())
        .unwrap_or_default();

    let mut detected = Vec::new();

    for candidate in AGENT_CANDIDATES {
        // Skip if it's a built-in agent or already added as custom
        let candidate_id = candidate.binary.replace('-', "-");
        if BUILTIN_AGENT_IDS.contains(&candidate.binary)
            || existing_custom_ids.contains(&candidate_id)
        {
            continue;
        }

        // Check if binary exists on PATH
        if which(candidate.binary).is_err() {
            continue;
        }

        // Try to get version
        let version = match Command::new(candidate.binary)
            .arg("--version")
            .output()
            .await
        {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let first_line = stdout.lines().next().unwrap_or("").trim();
                if first_line.is_empty() {
                    None
                } else {
                    Some(first_line.to_string())
                }
            }
            _ => None,
        };

        // Check --help output for RPC/ACP keywords
        let (supports_rpc, supports_acp) = match Command::new(candidate.binary)
            .arg("--help")
            .output()
            .await
        {
            Ok(output) => {
                let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
                let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
                let combined = format!("{} {}", text, stderr);
                let has_rpc = combined.contains("rpc")
                    || combined.contains("json-rpc")
                    || combined.contains("jsonrpc");
                let has_acp = combined.contains("acp")
                    || combined.contains("agent communication protocol");
                (has_rpc, has_acp)
            }
            _ => (false, false),
        };

        detected.push(DetectedAgent {
            binary: candidate.binary.to_string(),
            display_name: candidate.display_name.to_string(),
            version,
            supports_rpc,
            supports_acp,
        });
    }

    Ok(detected)
}
