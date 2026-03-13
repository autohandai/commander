use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::process::{Child, ChildStdin};
use async_trait::async_trait;
use crate::error::CommanderError;
use crate::models::ai_agent::AgentSettings;
use crate::models::protocol::ProtocolMode;
use super::AgentExecutor;

pub struct RpcExecutor {
    flag_variant: Option<String>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    child: Arc<Mutex<Option<Child>>>,
}

impl RpcExecutor {
    pub fn new(flag_variant: Option<String>) -> Self {
        Self {
            flag_variant,
            stdin: Arc::new(Mutex::new(None)),
            child: Arc::new(Mutex::new(None)),
        }
    }
}

#[async_trait]
impl AgentExecutor for RpcExecutor {
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
        todo!("Restore from git history in Task 8")
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
        Some(ProtocolMode::Rpc)
    }
}
