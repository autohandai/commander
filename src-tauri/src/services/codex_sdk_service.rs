use crate::services::execution_mode_service::ExecutionMode;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexThreadPreferences {
    pub sandbox_mode: Option<String>,
    pub skip_git_repo_check: bool,
}

impl Default for CodexThreadPreferences {
    fn default() -> Self {
        Self {
            sandbox_mode: Some("workspace-write".to_string()),
            skip_git_repo_check: true,
        }
    }
}

pub fn build_codex_thread_prefs(
    execution_mode: Option<ExecutionMode>,
    dangerous_bypass: bool,
) -> CodexThreadPreferences {
    let mut prefs = CodexThreadPreferences::default();

    match execution_mode {
        Some(ExecutionMode::Chat) => {
            prefs.sandbox_mode = Some("read-only".to_string());
        }
        Some(ExecutionMode::Collab) => {
            prefs.sandbox_mode = Some("workspace-write".to_string());
        }
        Some(ExecutionMode::Full) => {
            if dangerous_bypass {
                prefs.sandbox_mode = Some("danger-full-access".to_string());
            } else {
                prefs.sandbox_mode = Some("workspace-write".to_string());
            }
        }
        None => {
            prefs.sandbox_mode = Some("workspace-write".to_string());
        }
    }

    prefs
}
