use async_trait::async_trait;
use crate::error::CommanderError;
use crate::models::ai_agent::AgentSettings;
use crate::models::protocol::ProtocolMode;
use super::AgentExecutor;

pub struct PtyExecutor;

impl PtyExecutor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl AgentExecutor for PtyExecutor {
    async fn execute(
        &mut self,
        _app: &tauri::AppHandle,
        _session_id: &str,
        _agent: &str,
        _message: &str,
        _working_dir: &str,
        _settings: &AgentSettings,
        _resume_session_id: Option<&str>,
    ) -> Result<(), CommanderError> {
        todo!("Extract from cli_commands.rs in Task 6")
    }

    async fn abort(&self) -> Result<(), CommanderError> {
        Ok(())
    }

    async fn respond_permission(&self, _request_id: &str, _approved: bool) -> Result<(), CommanderError> {
        Ok(())
    }

    fn is_alive(&self) -> bool {
        false
    }

    fn protocol(&self) -> Option<ProtocolMode> {
        None
    }
}
