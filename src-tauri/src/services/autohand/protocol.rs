use async_trait::async_trait;

use crate::error::CommanderError;
use crate::models::autohand::{AutohandConfig, AutohandState};

/// Shared trait for autohand protocol implementations (RPC and ACP).
///
/// Concrete implementations will handle the JSON-RPC 2.0 stdio transport
/// or the future ACP HTTP transport while exposing the same surface to the
/// rest of the Commander backend.
#[allow(dead_code)]
#[async_trait]
pub trait AutohandProtocol: Send + Sync {
    /// Start the autohand process with the given working directory and config.
    async fn start(
        &mut self,
        working_dir: &str,
        config: &AutohandConfig,
    ) -> Result<(), CommanderError>;

    /// Send a prompt/instruction to autohand.
    async fn send_prompt(
        &self,
        message: &str,
        images: Option<Vec<String>>,
    ) -> Result<(), CommanderError>;

    /// Abort the current in-flight operation.
    async fn abort(&self) -> Result<(), CommanderError>;

    /// Reset the agent state (clear conversation).
    async fn reset(&self) -> Result<(), CommanderError>;

    /// Query the current agent state.
    async fn get_state(&self) -> Result<AutohandState, CommanderError>;

    /// Respond to a permission request (approve or deny).
    async fn respond_permission(
        &self,
        request_id: &str,
        approved: bool,
    ) -> Result<(), CommanderError>;

    /// Gracefully shut down the autohand process.
    async fn shutdown(&self) -> Result<(), CommanderError>;

    /// Check if the process is still running.
    fn is_alive(&self) -> bool;
}
