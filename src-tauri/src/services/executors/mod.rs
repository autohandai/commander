pub mod pty_executor;
pub mod acp_executor;
pub mod rpc_executor;

use async_trait::async_trait;
use crate::error::CommanderError;
use crate::models::ai_agent::AgentSettings;
use crate::models::protocol::ProtocolMode;
use crate::services::agent_status_service::ProtocolCache;

use self::pty_executor::PtyExecutor;
use self::acp_executor::AcpExecutor;
use self::rpc_executor::RpcExecutor;

#[async_trait]
pub trait AgentExecutor: Send + Sync {
    async fn execute(
        &mut self,
        app: &tauri::AppHandle,
        session_id: &str,
        agent: &str,
        message: &str,
        working_dir: &str,
        settings: &AgentSettings,
        resume_session_id: Option<&str>,
    ) -> Result<(), CommanderError>;

    async fn abort(&self) -> Result<(), CommanderError>;

    async fn respond_permission(&self, request_id: &str, approved: bool) -> Result<(), CommanderError>;

    fn is_alive(&self) -> bool;

    fn protocol(&self) -> Option<ProtocolMode>;
}

pub struct ExecutorFactory;

impl ExecutorFactory {
    pub fn create(agent: &str, protocol_cache: &ProtocolCache) -> Box<dyn AgentExecutor> {
        let entry = protocol_cache.get(agent);
        match entry.and_then(|e| e.protocol) {
            Some(ProtocolMode::Acp) => {
                let flag = entry.and_then(|e| e.flag_variant.clone());
                Box::new(AcpExecutor::new(flag))
            }
            Some(ProtocolMode::Rpc) => {
                let flag = entry.and_then(|e| e.flag_variant.clone());
                Box::new(RpcExecutor::new(flag))
            }
            None => Box::new(PtyExecutor::new()),
        }
    }
}
