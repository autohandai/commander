use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, Mutex};

use crate::commands::settings_commands::load_all_agent_settings;
use crate::models::*;
use crate::services::cli_command_builder::build_codex_command_args;
use crate::services::cli_output_service::{sanitize_cli_output_line, CodexStreamAccumulator};
use crate::services::codex_sdk_service::{build_codex_thread_prefs, CodexThreadPreferences};
use crate::services::execution_mode_service::ExecutionMode;
use serde::{Deserialize, Serialize};
use std::process::Command as StdCommand;

const CODEX_SDK_RUNNER_SOURCE: &str = include_str!("../../../scripts/codex-sdk-runner.mjs");
const CODEX_SDK_CORE_SOURCE: &str = include_str!("../../../scripts/codex-sdk-core.mjs");

static CODEX_SDK_RUNNER_PATH: Lazy<Result<PathBuf, String>> = Lazy::new(|| {
    let mut path = std::env::temp_dir();
    path.push("commander-codex-sdk-runner.mjs");

    if let Err(e) = fs::write(&path, CODEX_SDK_RUNNER_SOURCE) {
        return Err(format!(
            "Failed to materialize Codex SDK runner script: {}",
            e
        ));
    }

    // Also materialize the shared core module alongside the runner
    if let Some(parent) = path.parent() {
        let core_path = parent.join("codex-sdk-core.mjs");
        if let Err(e) = fs::write(&core_path, CODEX_SDK_CORE_SOURCE) {
            return Err(format!(
                "Failed to materialize Codex SDK core module: {}",
                e
            ));
        }
    }

    Ok(path)
});

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

async fn build_agent_command_args(
    agent: &str,
    message: &str,
    app_handle: &tauri::AppHandle,
    execution_mode: Option<String>,
    dangerous_bypass: bool,
    permission_mode: Option<String>,
) -> Vec<String> {
    let mut args = Vec::new();

    // Try to get agent settings to include model preference
    let agent_settings = load_all_agent_settings(app_handle.clone())
        .await
        .unwrap_or_else(|_| AllAgentSettings {
            claude: AgentSettings::default(),
            codex: AgentSettings::default(),
            gemini: AgentSettings::default(),
            max_concurrent_sessions: 10,
        });

    let current_agent_settings = match agent {
        "claude" => &agent_settings.claude,
        "codex" => &agent_settings.codex,
        "gemini" => &agent_settings.gemini,
        _ => &AgentSettings::default(),
    };

    let parsed_execution_mode = execution_mode.as_deref().and_then(ExecutionMode::from_str);

    match agent {
        "claude" => {
            args.extend(build_claude_cli_args(
                message,
                permission_mode.as_deref(),
                current_agent_settings,
            ));
        }
        "codex" => {
            args.extend(build_codex_command_args(
                message,
                parsed_execution_mode,
                dangerous_bypass,
                Some(current_agent_settings),
            ));
        }
        "gemini" => {
            args.push("--prompt".to_string());
            // Permission-mode pass-through if provided (adjust flag here if CLI differs)
            if let Some(pm) = permission_mode.as_ref() {
                if !pm.is_empty() {
                    args.push("--permission-mode".to_string());
                    args.push(pm.clone());
                }
            }

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

fn build_claude_cli_args(
    message: &str,
    permission_mode: Option<&str>,
    settings: &AgentSettings,
) -> Vec<String> {
    let mut args = Vec::new();

    args.push("-p".to_string());
    if !message.is_empty() {
        args.push(message.to_string());
    }
    args.push("--output-format".to_string());
    args.push("stream-json".to_string());
    args.push("--include-partial-messages".to_string());
    args.push("--verbose".to_string());

    if let Some(pm) = permission_mode {
        if !pm.is_empty() {
            args.push("--permission-mode".to_string());
            args.push(pm.to_string());
        }
    }

    if let Some(model) = settings.model.as_ref() {
        if !model.is_empty() {
            args.push("--model".to_string());
            args.push(model.clone());
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

        // Check if first part is an agent name (with aliases)
        let agent_or_aliases = ["claude", "codex", "gemini", "test", "code", "copilot"];
        if agent_or_aliases.contains(&parts[0]) {
            // Canonicalize aliases to their real agent
            let actual_agent = match parts[0] {
                "code" | "copilot" => "codex".to_string(),
                other => other.to_string(),
            };
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

#[cfg(test)]
mod tests {
    use super::{build_claude_cli_args, parse_command_structure};
    #[test]
    fn parses_code_alias_to_codex_with_help() {
        let (agent, msg) = parse_command_structure("claude", "/code help");
        assert_eq!(agent, "codex", "'/code' should route to 'codex' agent");
        assert_eq!(msg, "help");
    }

    #[test]
    fn parses_code_alias_with_free_text_message() {
        let (agent, msg) = parse_command_structure("claude", "/code are you there?");
        assert_eq!(agent, "codex");
        assert_eq!(msg, "are you there?");
    }

    #[test]
    fn preserves_codex_agent_when_explicit() {
        let (agent, msg) = parse_command_structure("claude", "/codex help");
        assert_eq!(agent, "codex");
        assert_eq!(msg, "help");
    }

    #[test]
    fn claude_cli_args_include_stream_json_and_partials() {
        let settings = crate::models::AgentSettings {
            model: Some("claude-opus".to_string()),
            ..Default::default()
        };

        let args = build_claude_cli_args("list files", Some("plan"), &settings);

        assert!(
            args.contains(&"-p".to_string()),
            "expected -p to be present"
        );
        assert!(
            args.windows(2)
                .any(|pair| pair[0] == "--output-format" && pair[1] == "stream-json"),
            "expected --output-format stream-json"
        );
        assert!(
            args.contains(&"--include-partial-messages".to_string()),
            "expected --include-partial-messages to be present"
        );
        assert!(
            args.contains(&"--verbose".to_string()),
            "expected --verbose to be present"
        );
        assert!(
            args.windows(2)
                .any(|pair| pair[0] == "--model" && pair[1] == "claude-opus"),
            "expected --model flag to use configured model"
        );
        assert!(
            args.windows(2)
                .any(|pair| pair[0] == "--permission-mode" && pair[1] == "plan"),
            "expected permission mode passthrough"
        );
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
            let session_key =
                generate_session_key(&session.session.agent, &session.session.working_dir);
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
    // Prefer Rust which crate for reliability in GUI app contexts (PATH differences)
    which::which(command).is_ok()
}

// Try to spawn the command inside a PTY to get unbuffered, real-time output.
// Falls back to stdio pipes in the caller if PTY spawn fails.
async fn try_spawn_with_pty(
    app: tauri::AppHandle,
    session_id: String,
    agent: &str,
    program: &str,
    args: &[String],
    working_dir: Option<String>,
) -> Result<(), String> {
    // PTY must be used in blocking context; spawn a blocking task.
    let app_clone = app.clone();
    let program_s = program.to_string();
    let args_v = args.to_vec();
    let session_id_clone = session_id.clone();

    let agent_string = agent.to_string();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let agent_ref = agent_string;
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 32,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let mut cmd = CommandBuilder::new(program_s);
        for a in &args_v {
            cmd.arg(a);
        }
        if let Some(dir) = working_dir.clone() {
            println!("🏠 PTY: Setting working directory to: {}", dir);
            cmd.cwd(dir);
        } else {
            println!("⚠️  PTY: No working directory - using system default");
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn PTY command: {}", e))?;

        // Reader for master end
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

        // Read loop: emit chunks as they arrive
        let mut buf = [0u8; 4096];
        let mut codex_accumulator = if agent_ref.eq_ignore_ascii_case("codex") {
            Some(CodexStreamAccumulator::new())
        } else {
            None
        };

        loop {
            match std::io::Read::read(&mut reader, &mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let text = String::from_utf8_lossy(&buf[..n]).to_string();
                    if let Some(acc) = codex_accumulator.as_mut() {
                        for segment in acc.push_chunk(&text) {
                            if let Some(filtered) = sanitize_cli_output_line(&agent_ref, &segment) {
                                let _ = app_clone.emit(
                                    "cli-stream",
                                    StreamChunk {
                                        session_id: session_id_clone.clone(),
                                        content: filtered,
                                        finished: false,
                                    },
                                );
                            }
                        }
                    } else {
                        for line in text.split_inclusive(['\n', '\r']) {
                            let trimmed = line.trim_end_matches(['\n', '\r']);
                            if trimmed.is_empty() {
                                continue;
                            }
                            if let Some(filtered) = sanitize_cli_output_line(&agent_ref, trimmed) {
                                let _ = app_clone.emit(
                                    "cli-stream",
                                    StreamChunk {
                                        session_id: session_id_clone.clone(),
                                        content: format!("{}\n", filtered),
                                        finished: false,
                                    },
                                );
                            }
                        }
                    }
                }
                Err(e) => {
                    let _ = app_clone.emit(
                        "cli-stream",
                        StreamChunk {
                            session_id: session_id_clone.clone(),
                            content: format!("\n❌ PTY read error: {}\n", e),
                            finished: false,
                        },
                    );
                    break;
                }
            }
        }

        // Wait for child to exit
        let status = child
            .wait()
            .map_err(|e| format!("Failed to wait on PTY child: {}", e))?;
        if let Some(mut acc) = codex_accumulator {
            if let Some(remaining) = acc.flush() {
                if let Some(filtered) = sanitize_cli_output_line(&agent_ref, &remaining) {
                    let _ = app_clone.emit(
                        "cli-stream",
                        StreamChunk {
                            session_id: session_id_clone.clone(),
                            content: filtered,
                            finished: false,
                        },
                    );
                }
            }
        }
        let final_content = if status.success() {
            String::new()
        } else {
            format!("\n❌ Command failed with status\n")
        };
        let _ = app_clone.emit(
            "cli-stream",
            StreamChunk {
                session_id: session_id_clone,
                content: final_content,
                finished: true,
            },
        );
        Ok(())
    })
    .await
    .map_err(|e| format!("PTY task join error: {}", e))??;

    Ok(())
}

#[derive(Debug, Serialize)]
struct CodexSdkInvocation {
    #[serde(rename = "sessionId")]
    session_id: String,
    prompt: String,
    #[serde(rename = "workingDirectory", skip_serializing_if = "Option::is_none")]
    working_directory: Option<String>,
    #[serde(rename = "sandboxMode", skip_serializing_if = "Option::is_none")]
    sandbox_mode: Option<String>,
    #[serde(rename = "model", skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(rename = "skipGitRepoCheck")]
    skip_git_repo_check: bool,
}

#[derive(Debug, Deserialize)]
struct CodexSdkBridgeMessage {
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
    content: Option<String>,
    error: Option<String>,
    #[serde(default)]
    finished: bool,
}

fn resolve_codex_runner_path() -> Result<PathBuf, String> {
    match CODEX_SDK_RUNNER_PATH.as_ref() {
        Ok(path) => Ok(path.clone()),
        Err(err) => Err(err.clone()),
    }
}

async fn try_spawn_codex_sdk(
    app: tauri::AppHandle,
    session_id: String,
    prompt: String,
    working_dir: Option<String>,
    prefs: CodexThreadPreferences,
    model: Option<String>,
) -> Result<(), String> {
    let script_path = resolve_codex_runner_path()?;

    let mut cmd = Command::new("node");
    cmd.arg(
        script_path
            .to_str()
            .ok_or_else(|| "Invalid script path".to_string())?,
    )
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    let node_modules_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../node_modules");
    if let Ok(canonical) = fs::canonicalize(&node_modules_dir) {
        cmd.env("NODE_PATH", &canonical);

        let sdk_dist_path = canonical.join("@openai/codex-sdk/dist/index.js");
        if sdk_dist_path.exists() {
            cmd.env("CODEX_SDK_DIST_PATH", sdk_dist_path);
        }
    }

    if let Some(dir) = &working_dir {
        cmd.current_dir(dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Codex SDK runner: {}", e))?;

    let config = CodexSdkInvocation {
        session_id: session_id.clone(),
        prompt,
        working_directory: working_dir.clone(),
        sandbox_mode: prefs.sandbox_mode.clone(),
        model,
        skip_git_repo_check: prefs.skip_git_repo_check,
    };

    if let Some(mut stdin) = child.stdin.take() {
        let payload = serde_json::to_string(&config)
            .map_err(|e| format!("Failed to serialize Codex SDK config: {}", e))?;
        tokio::spawn(async move {
            let _ = stdin.write_all(payload.as_bytes()).await;
            let _ = stdin.shutdown().await;
        });
    }

    if let Some(stdout) = child.stdout.take() {
        let app_for_stdout = app.clone();
        let session_for_stdout = session_id.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }

                let parsed: Result<CodexSdkBridgeMessage, _> = serde_json::from_str(&line);
                match parsed {
                    Ok(msg) => {
                        let sid = msg.session_id.unwrap_or_else(|| session_for_stdout.clone());

                        if let Some(error) = msg.error {
                            let chunk = StreamChunk {
                                session_id: sid,
                                content: format!("❌ Codex error: {}\n", error),
                                finished: msg.finished,
                            };
                            let _ = app_for_stdout.emit("cli-stream", chunk);
                        } else if let Some(content) = msg.content {
                            let chunk = StreamChunk {
                                session_id: sid,
                                content,
                                finished: msg.finished,
                            };
                            let _ = app_for_stdout.emit("cli-stream", chunk);
                        }
                    }
                    Err(_) => {
                        let chunk = StreamChunk {
                            session_id: session_for_stdout.clone(),
                            content: line + "\n",
                            finished: false,
                        };
                        let _ = app_for_stdout.emit("cli-stream", chunk);
                    }
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_for_stderr = app.clone();
        let session_for_stderr = session_id.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.trim().is_empty() {
                    continue;
                }
                let parsed: Result<CodexSdkBridgeMessage, _> = serde_json::from_str(&line);
                match parsed {
                    Ok(msg) => {
                        let sid = msg.session_id.unwrap_or_else(|| session_for_stderr.clone());
                        if let Some(error) = msg.error {
                            let chunk = StreamChunk {
                                session_id: sid,
                                content: format!("❌ Codex error: {}\n", error),
                                finished: msg.finished,
                            };
                            let _ = app_for_stderr.emit("cli-stream", chunk);
                        }
                    }
                    Err(_) => {
                        let chunk = StreamChunk {
                            session_id: session_for_stderr.clone(),
                            content: format!("{}\n", line),
                            finished: false,
                        };
                        let _ = app_for_stderr.emit("cli-stream", chunk);
                    }
                }
            }
        });
    }

    match child.wait().await {
        Ok(status) => {
            if status.success() {
                let _ = app.emit(
                    "cli-stream",
                    StreamChunk {
                        session_id,
                        content: "\n \n".to_string(),
                        finished: true,
                    },
                );
            } else {
                let _ = app.emit(
                    "cli-stream",
                    StreamChunk {
                        session_id,
                        content: format!(
                            "\n❌ Codex SDK runner exited with status {}\n",
                            status.code().unwrap_or(-1)
                        ),
                        finished: true,
                    },
                );
            }
            Ok(())
        }
        Err(e) => Err(format!("Failed to wait for Codex SDK runner: {}", e)),
    }
}

#[tauri::command]
pub async fn execute_persistent_cli_command(
    app: tauri::AppHandle,
    session_id: String,
    agent: String,
    message: String,
    working_dir: Option<String>,
    execution_mode: Option<String>,
    dangerousBypass: Option<bool>,
    permissionMode: Option<String>,
) -> Result<(), String> {
    println!(
        "🔍 BACKEND RECEIVED - Agent: {}, Working Dir: {:?}",
        agent, working_dir
    );
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

        let dangerous_bypass = dangerousBypass.unwrap_or(false);

        if agent_name.eq_ignore_ascii_case("codex") {
            let all_agent_settings = load_all_agent_settings(app_clone.clone())
                .await
                .unwrap_or_else(|_| AllAgentSettings {
                    claude: AgentSettings::default(),
                    codex: AgentSettings::default(),
                    gemini: AgentSettings::default(),
                    max_concurrent_sessions: 10,
                });

            let current_agent_settings = all_agent_settings.codex.clone();
            let parsed_execution_mode = execution_mode.as_deref().and_then(ExecutionMode::from_str);
            let prefs = build_codex_thread_prefs(parsed_execution_mode, dangerous_bypass);
            let model = current_agent_settings.model.clone();

            match try_spawn_codex_sdk(
                app_clone.clone(),
                session_id_clone.clone(),
                actual_message.clone(),
                working_dir.clone(),
                prefs,
                model,
            )
            .await
            {
                Ok(()) => {
                    return;
                }
                Err(err) => {
                    let fallback_chunk = StreamChunk {
                        session_id: session_id_clone.clone(),
                        content: format!(
                            "ℹ️ Codex SDK runner unavailable ({}). Falling back to CLI…\n",
                            err
                        ),
                        finished: false,
                    };
                    let _ = app_clone.emit("cli-stream", fallback_chunk);
                }
            }
        }

        // Check if command is available
        if !check_command_available(&agent_name).await {
            let error_chunk = StreamChunk {
                session_id: session_id_clone.clone(),
                content: format!(
                    "❌ Command '{}' not found. Please install it first:\n\n",
                    agent_name
                ),
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

        // Build args once
        let command_args = build_agent_command_args(
            &agent_name,
            &actual_message,
            &app_clone,
            execution_mode.clone(),
            dangerous_bypass,
            permissionMode.clone(),
        )
        .await;

        // Resolve absolute path of the executable to avoid PATH issues in GUI contexts
        let resolved_prog = which::which(&agent_name)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(agent_name.clone());

        // Prefer PTY for richer streaming – Codex in particular emits carriage-return updates that
        // disappear when spawned via plain pipes. `try_spawn_with_pty` respects the working
        // directory, so we can safely attempt it regardless of `working_dir`.
        let prefer_pty = working_dir.is_none()
            || agent_name.eq_ignore_ascii_case("codex")
            || agent_name.eq_ignore_ascii_case("claude")
            || agent_name.eq_ignore_ascii_case("gemini");

        if prefer_pty {
            if let Err(e) = try_spawn_with_pty(
                app_clone.clone(),
                session_id_clone.clone(),
                &agent_name,
                &resolved_prog,
                &command_args,
                working_dir.clone(),
            )
            .await
            {
                // Inform about PTY fallback
                let _ = app_clone.emit(
                    "cli-stream",
                    StreamChunk {
                        session_id: session_id_clone.clone(),
                        content: format!(
                            "ℹ️ PTY unavailable ({}). Falling back to pipe streaming...\n",
                            e
                        ),
                        finished: false,
                    },
                );
            } else {
                return; // PTY path handled end-to-end
            }
        }

        let mut cmd = Command::new(&resolved_prog);
        cmd.args(&command_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(dir) = &working_dir {
            println!("📁 PIPE: Setting working directory to: {}", dir);
            cmd.current_dir(dir);
        } else {
            println!("⚠️  PIPE: No working directory - using system default");
        }

        match cmd.spawn() {
            Ok(mut child) => {
                // Stream stdout
                if let Some(stdout) = child.stdout.take() {
                    let app_for_stdout = app_clone.clone();
                    let session_id_for_stdout = session_id_clone.clone();
                    let agent_for_stdout = agent_name.clone();
                    tokio::spawn(async move {
                        if agent_for_stdout.eq_ignore_ascii_case("codex") {
                            let mut reader = BufReader::new(stdout);
                            let mut buf = vec![0u8; 4096];
                            let mut accumulator = CodexStreamAccumulator::new();

                            loop {
                                match reader.read(&mut buf).await {
                                    Ok(0) => break,
                                    Ok(n) => {
                                        let text = String::from_utf8_lossy(&buf[..n]);
                                        for segment in accumulator.push_chunk(text.as_ref()) {
                                            if let Some(filtered) = sanitize_cli_output_line(
                                                &agent_for_stdout,
                                                &segment,
                                            ) {
                                                let chunk = StreamChunk {
                                                    session_id: session_id_for_stdout.clone(),
                                                    content: filtered,
                                                    finished: false,
                                                };
                                                let _ = app_for_stdout.emit("cli-stream", chunk);
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        let chunk = StreamChunk {
                                            session_id: session_id_for_stdout.clone(),
                                            content: format!("ERROR: {}\n", e),
                                            finished: false,
                                        };
                                        let _ = app_for_stdout.emit("cli-stream", chunk);
                                        break;
                                    }
                                }
                            }

                            if let Some(remaining) = accumulator.flush() {
                                if let Some(filtered) =
                                    sanitize_cli_output_line(&agent_for_stdout, &remaining)
                                {
                                    let chunk = StreamChunk {
                                        session_id: session_id_for_stdout,
                                        content: filtered,
                                        finished: false,
                                    };
                                    let _ = app_for_stdout.emit("cli-stream", chunk);
                                }
                            }
                        } else {
                            let reader = BufReader::new(stdout);
                            let mut lines = reader.lines();

                            while let Ok(Some(line)) = lines.next_line().await {
                                if let Some(filtered) =
                                    sanitize_cli_output_line(&agent_for_stdout, &line)
                                {
                                    let chunk = StreamChunk {
                                        session_id: session_id_for_stdout.clone(),
                                        content: filtered + "\n",
                                        finished: false,
                                    };
                                    let _ = app_for_stdout.emit("cli-stream", chunk);
                                }
                            }
                        }
                    });
                }

                // Stream stderr
                if let Some(stderr) = child.stderr.take() {
                    let app_for_stderr = app_clone.clone();
                    let session_id_for_stderr = session_id_clone.clone();
                    let agent_for_stderr = agent_name.clone();
                    tokio::spawn(async move {
                        if agent_for_stderr.eq_ignore_ascii_case("codex") {
                            let mut reader = BufReader::new(stderr);
                            let mut buf = vec![0u8; 4096];
                            let mut accumulator = CodexStreamAccumulator::new();

                            loop {
                                match reader.read(&mut buf).await {
                                    Ok(0) => break,
                                    Ok(n) => {
                                        let text = String::from_utf8_lossy(&buf[..n]);
                                        for segment in accumulator.push_chunk(text.as_ref()) {
                                            if let Some(filtered) = sanitize_cli_output_line(
                                                &agent_for_stderr,
                                                &segment,
                                            ) {
                                                let chunk = StreamChunk {
                                                    session_id: session_id_for_stderr.clone(),
                                                    content: format!("ERROR: {}\n", filtered),
                                                    finished: false,
                                                };
                                                let _ = app_for_stderr.emit("cli-stream", chunk);
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        let chunk = StreamChunk {
                                            session_id: session_id_for_stderr.clone(),
                                            content: format!("ERROR: {}\n", e),
                                            finished: false,
                                        };
                                        let _ = app_for_stderr.emit("cli-stream", chunk);
                                        break;
                                    }
                                }
                            }

                            if let Some(remaining) = accumulator.flush() {
                                if let Some(filtered) =
                                    sanitize_cli_output_line(&agent_for_stderr, &remaining)
                                {
                                    let chunk = StreamChunk {
                                        session_id: session_id_for_stderr,
                                        content: format!("ERROR: {}\n", filtered),
                                        finished: false,
                                    };
                                    let _ = app_for_stderr.emit("cli-stream", chunk);
                                }
                            }
                        } else {
                            let reader = BufReader::new(stderr);
                            let mut lines = reader.lines();

                            while let Ok(Some(line)) = lines.next_line().await {
                                if let Some(filtered) =
                                    sanitize_cli_output_line(&agent_for_stderr, &line)
                                {
                                    let chunk = StreamChunk {
                                        session_id: session_id_for_stderr.clone(),
                                        content: format!("ERROR: {}\n", filtered),
                                        finished: false,
                                    };
                                    let _ = app_for_stderr.emit("cli-stream", chunk);
                                }
                            }
                        }
                    });
                }

                // Wait for completion
                match child.wait().await {
                    Ok(status) => {
                        let final_chunk = StreamChunk {
                            session_id: session_id_clone,
                            content: if status.success() {
                                String::new()
                            } else {
                                format!(
                                    "\n❌ Command failed with exit code: {}\n",
                                    status.code().unwrap_or(-1)
                                )
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
    execution_mode: Option<String>,
    dangerousBypass: Option<bool>,
    permissionMode: Option<String>,
) -> Result<(), String> {
    // Legacy function - redirect to persistent session handler
    let message = args.join(" ");
    execute_persistent_cli_command(
        app,
        session_id,
        command,
        message,
        working_dir,
        execution_mode,
        dangerousBypass,
        permissionMode,
    )
    .await
}

#[tauri::command]
pub async fn execute_claude_command(
    app: tauri::AppHandle,
    #[allow(non_snake_case)] sessionId: String,
    message: String,
    #[allow(non_snake_case)] workingDir: Option<String>,
) -> Result<(), String> {
    execute_persistent_cli_command(
        app,
        sessionId,
        "claude".to_string(),
        message,
        workingDir,
        None,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn execute_codex_command(
    app: tauri::AppHandle,
    #[allow(non_snake_case)] sessionId: String,
    message: String,
    #[allow(non_snake_case)] workingDir: Option<String>,
    executionMode: Option<String>,
    dangerousBypass: Option<bool>,
    permissionMode: Option<String>,
) -> Result<(), String> {
    execute_persistent_cli_command(
        app,
        sessionId,
        "codex".to_string(),
        message,
        workingDir,
        executionMode,
        dangerousBypass,
        permissionMode,
    )
    .await
}

#[tauri::command]
pub async fn execute_gemini_command(
    app: tauri::AppHandle,
    #[allow(non_snake_case)] sessionId: String,
    message: String,
    #[allow(non_snake_case)] workingDir: Option<String>,
) -> Result<(), String> {
    execute_persistent_cli_command(
        app,
        sessionId,
        "gemini".to_string(),
        message,
        workingDir,
        None,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn execute_ollama_command(
    app: tauri::AppHandle,
    #[allow(non_snake_case)] sessionId: String,
    message: String,
    #[allow(non_snake_case)] workingDir: Option<String>,
) -> Result<(), String> {
    execute_persistent_cli_command(
        app,
        sessionId,
        "ollama".to_string(),
        message,
        workingDir,
        None,
        None,
        None,
    )
    .await
}

// Test command to demonstrate CLI streaming (this will always work)
#[tauri::command]
pub async fn execute_test_command(
    app: tauri::AppHandle,
    #[allow(non_snake_case)] sessionId: String,
    message: String,
    #[allow(non_snake_case)] workingDir: Option<String>,
) -> Result<(), String> {
    let app_clone = app.clone();
    let session_id_clone = sessionId.clone();
    let _ = workingDir; // currently unused

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
            sender
                .send(format!("{}\n", quit_cmd))
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
pub fn open_file_in_editor(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    #[cfg(target_os = "macos")]
    {
        StdCommand::new("open")
            .arg("-t")
            .arg(file_path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        StdCommand::new("cmd")
            .args(&["/C", "start", "", &file_path])
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        StdCommand::new("xdg-open")
            .arg(file_path)
            .spawn()
            .map_err(|e| format!("Failed to open file: {}", e))?;
    }

    Ok(())
}
