use std::process::Stdio;
use std::sync::Arc;
use async_trait::async_trait;
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncBufReadExt, BufReader};
use tokio::process::Child;
use tokio::sync::Mutex;

use crate::commands::cli_commands::{
    build_agent_command_args, try_spawn_with_pty,
};
use crate::error::CommanderError;
use crate::models::ai_agent::{AgentSettings, StreamChunk};
use crate::models::protocol::ProtocolMode;
use crate::services::cli_output_service::{sanitize_cli_output_line, CodexStreamAccumulator};
use super::AgentExecutor;

pub struct PtyExecutor {
    child: Arc<Mutex<Option<Child>>>,
}

impl PtyExecutor {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
        }
    }
}

#[async_trait]
impl AgentExecutor for PtyExecutor {
    async fn execute(
        &mut self,
        app: &tauri::AppHandle,
        session_id: &str,
        agent: &str,
        message: &str,
        working_dir: &str,
        settings: &AgentSettings,
        resume_session_id: Option<&str>,
    ) -> Result<(), CommanderError> {
        let app = app.clone();
        let session_id = session_id.to_string();
        let agent = agent.to_string();
        let message = message.to_string();
        let working_dir = working_dir.to_string();
        let _settings = settings.clone();
        let child_handle = self.child.clone();

        // Build args — build_agent_command_args loads its own settings internally
        let command_args = build_agent_command_args(
            &agent,
            &message,
            &app,
            None,  // execution_mode — not threaded through AgentExecutor yet
            false, // dangerous_bypass
            None,  // permission_mode
            resume_session_id.map(|s| s.to_string()),  // resume_session_id
        )
        .await;

        // Resolve absolute path of the executable to avoid PATH issues in GUI contexts
        let resolved_prog = which::which(&agent)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| agent.clone());

        let working_dir_opt = if working_dir.is_empty() {
            None
        } else {
            Some(working_dir.clone())
        };

        // Prefer PTY for richer streaming
        let prefer_pty = working_dir_opt.is_none()
            || agent.eq_ignore_ascii_case("codex")
            || agent.eq_ignore_ascii_case("claude")
            || agent.eq_ignore_ascii_case("gemini");

        if prefer_pty {
            if let Err(e) = try_spawn_with_pty(
                app.clone(),
                session_id.clone(),
                &agent,
                &resolved_prog,
                &command_args,
                working_dir_opt.clone(),
            )
            .await
            {
                // Inform about PTY fallback
                let _ = app.emit(
                    "cli-stream",
                    StreamChunk {
                        session_id: session_id.clone(),
                        content: format!(
                            "ℹ️ PTY unavailable ({}). Falling back to pipe streaming...\n",
                            e
                        ),
                        finished: false,
                    },
                );
            } else {
                return Ok(()); // PTY path handled end-to-end
            }
        }

        // Pipe fallback
        let mut cmd = tokio::process::Command::new(&resolved_prog);
        cmd.args(&command_args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(dir) = &working_dir_opt {
            println!("📁 PIPE: Setting working directory to: {}", dir);
            cmd.current_dir(dir);
        } else {
            println!("⚠️  PIPE: No working directory - using system default");
        }

        match cmd.spawn() {
            Ok(mut child_process) => {
                // Stream stdout
                if let Some(stdout) = child_process.stdout.take() {
                    let app_for_stdout = app.clone();
                    let session_id_for_stdout = session_id.clone();
                    let agent_for_stdout = agent.clone();
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
                if let Some(stderr) = child_process.stderr.take() {
                    let app_for_stderr = app.clone();
                    let session_id_for_stderr = session_id.clone();
                    let agent_for_stderr = agent.clone();
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

                // Store child for abort capability
                {
                    let mut guard = child_handle.lock().await;
                    *guard = None; // pipe fallback child is consumed by wait below
                }

                // Wait for completion
                match child_process.wait().await {
                    Ok(status) => {
                        let final_chunk = StreamChunk {
                            session_id: session_id.clone(),
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
                        let _ = app.emit("cli-stream", final_chunk);
                    }
                    Err(e) => {
                        let error_chunk = StreamChunk {
                            session_id: session_id.clone(),
                            content: format!("❌ Process error: {}\n", e),
                            finished: true,
                        };
                        let _ = app.emit("cli-stream", error_chunk);
                    }
                }
            }
            Err(e) => {
                let error_message = if e.kind() == std::io::ErrorKind::NotFound {
                    format!("Command '{}' not found. Please make sure it's installed and available in your PATH.", agent)
                } else {
                    format!("Failed to start {}: {}", agent, e)
                };

                let error_chunk = StreamChunk {
                    session_id: session_id.clone(),
                    content: format!("❌ {}\n", error_message),
                    finished: true,
                };
                let _ = app.emit("cli-stream", error_chunk);
            }
        }

        Ok(())
    }

    async fn abort(&self) -> Result<(), CommanderError> {
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            let _ = child.kill().await;
        }
        Ok(())
    }

    async fn respond_permission(&self, _request_id: &str, _approved: bool) -> Result<(), CommanderError> {
        Ok(())
    }

    fn is_alive(&self) -> bool {
        // For a synchronous check we can't await the lock.
        // This is a best-effort check; the child handle is primarily
        // used for abort. Before execute() starts, is_alive is false.
        false
    }

    fn protocol(&self) -> Option<ProtocolMode> {
        None
    }
}
