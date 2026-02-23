pub mod acp_client;
pub mod hooks_service;
pub mod protocol;
pub mod rpc_client;
pub mod types;

// Re-export client types for use by commands layer.
pub use acp_client::AutohandAcpClient;
pub use rpc_client::AutohandRpcClient;
