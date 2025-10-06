use crate::models::ai_agent::AgentSettings;
use crate::services::execution_mode_service::{codex_flags_for_mode, ExecutionMode};

/// Build command-line arguments for invoking the Codex CLI.
///
/// The resulting vector does **not** include the `codex` program name itself –
/// callers should prepend it when spawning the process. The helper keeps
/// responsibility scoped to pure argument construction so it can be reused and
/// unit-tested in isolation.
pub fn build_codex_command_args(
    message: &str,
    execution_mode: Option<ExecutionMode>,
    unsafe_full: bool,
    settings: Option<&AgentSettings>,
) -> Vec<String> {
    let mut args = vec!["exec".to_string()];

    if !message.trim().is_empty() {
        args.push(message.to_string());
    }

    if let Some(agent_settings) = settings {
        if let Some(model) = agent_settings.model.as_ref() {
            if !model.is_empty() {
                args.push("--model".to_string());
                args.push(model.clone());
            }
        }
    }

    if let Some(mode) = execution_mode {
        let bypass = unsafe_full && matches!(mode, ExecutionMode::Full);
        args.extend(codex_flags_for_mode(mode, bypass));
    }

    args.push("--skip-git-repo-check".to_string());

    args
}
