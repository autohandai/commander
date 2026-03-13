use serde::{Deserialize, Serialize};
use std::fmt;

use crate::error::CommanderError;

/// Identifies which wire protocol an agent session uses.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProtocolMode {
    Acp,
    Rpc,
}

/// Errors that can occur during protocol communication.
#[derive(Debug, Clone)]
pub enum ProtocolError {
    /// The child process exited unexpectedly with the given exit code.
    ProcessDied(i32),
    /// Failed to parse a message from the agent.
    ParseError(String),
    /// The agent returned an application-level error.
    AgentError(String),
    /// Writing to the agent's stdin failed.
    WriteFailed(String),
    /// A request timed out.
    Timeout(String),
}

impl fmt::Display for ProtocolError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProtocolError::ProcessDied(code) => {
                write!(f, "process_died: exit code {}", code)
            }
            ProtocolError::ParseError(msg) => write!(f, "parse_error: {}", msg),
            ProtocolError::AgentError(msg) => write!(f, "agent_error: {}", msg),
            ProtocolError::WriteFailed(msg) => write!(f, "write_failed: {}", msg),
            ProtocolError::Timeout(msg) => write!(f, "timeout: {}", msg),
        }
    }
}

impl From<ProtocolError> for CommanderError {
    fn from(err: ProtocolError) -> Self {
        let kind = match &err {
            ProtocolError::ProcessDied(_) => "process_died",
            ProtocolError::ParseError(_) => "parse_error",
            ProtocolError::AgentError(_) => "agent_error",
            ProtocolError::WriteFailed(_) => "write_failed",
            ProtocolError::Timeout(_) => "timeout",
        };
        let code = match &err {
            ProtocolError::ProcessDied(c) => Some(*c),
            _ => None,
        };
        CommanderError::protocol(kind, code, err.to_string())
    }
}

/// Tool categories used in protocol events.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    Read,
    Write,
    Edit,
    Delete,
    Execute,
    Think,
    Fetch,
    Search,
    Other,
}

/// Session lifecycle events.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionEventKind {
    Connected,
    Reconnected,
    Disconnected,
    FallbackToPty,
}

/// Events emitted by a running agent session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum ProtocolEvent {
    /// A text message produced by the agent.
    Message {
        session_id: String,
        role: String,
        content: String,
    },
    /// A tool invocation has started.
    ToolStart {
        session_id: String,
        tool_id: String,
        kind: ToolKind,
        input: serde_json::Value,
    },
    /// A running tool produced incremental output.
    ToolUpdate {
        session_id: String,
        tool_id: String,
        output: String,
    },
    /// A tool invocation has finished.
    ToolEnd {
        session_id: String,
        tool_id: String,
        success: bool,
        output: Option<String>,
    },
    /// The agent is requesting user permission before proceeding.
    PermissionRequest {
        session_id: String,
        tool_id: String,
        description: String,
    },
    /// Arbitrary state changed in the session.
    StateChange {
        session_id: String,
        key: String,
        value: serde_json::Value,
    },
    /// A protocol-level error occurred.
    Error {
        session_id: String,
        kind: String,
        code: Option<i32>,
        message: String,
    },
    /// Session lifecycle notification.
    SessionEvent {
        session_id: String,
        kind: SessionEventKind,
    },
}
