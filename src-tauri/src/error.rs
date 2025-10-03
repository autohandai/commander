use serde::{Deserialize, Serialize};
use std::fmt;

/// Comprehensive error types for the Commander application
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "details")]
pub enum CommanderError {
    /// Git-related errors
    Git {
        operation: String,
        path: String,
        message: String,
    },

    /// Project management errors
    Project {
        operation: String,
        project_name: String,
        message: String,
    },

    /// File system errors
    FileSystem {
        operation: String,
        path: String,
        message: String,
    },

    /// LLM/AI service errors
    LLM {
        provider: String,
        operation: String,
        message: String,
    },

    /// Settings/configuration errors
    Configuration { component: String, message: String },

    /// Session management errors
    Session {
        session_id: Option<String>,
        operation: String,
        message: String,
    },

    /// External command execution errors
    Command {
        command: String,
        exit_code: Option<i32>,
        message: String,
    },

    /// Network/API errors
    Network {
        url: String,
        status_code: Option<u16>,
        message: String,
    },

    /// Serialization/deserialization errors
    Serialization { data_type: String, message: String },

    /// Permission/access errors
    Permission { resource: String, message: String },

    /// Validation errors
    Validation {
        field: String,
        value: String,
        message: String,
    },

    /// Generic application errors
    Application { component: String, message: String },
}

impl CommanderError {
    /// Create a Git error
    pub fn git(
        operation: impl Into<String>,
        path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self::Git {
            operation: operation.into(),
            path: path.into(),
            message: message.into(),
        }
    }

    /// Create a Project error
    pub fn project(
        operation: impl Into<String>,
        project_name: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self::Project {
            operation: operation.into(),
            project_name: project_name.into(),
            message: message.into(),
        }
    }

    /// Create a File System error
    pub fn file_system(
        operation: impl Into<String>,
        path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self::FileSystem {
            operation: operation.into(),
            path: path.into(),
            message: message.into(),
        }
    }

    /// Create an LLM error
    pub fn llm(
        provider: impl Into<String>,
        operation: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self::LLM {
            provider: provider.into(),
            operation: operation.into(),
            message: message.into(),
        }
    }

    /// Create a Configuration error
    pub fn configuration(component: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Configuration {
            component: component.into(),
            message: message.into(),
        }
    }

    /// Create a Session error
    pub fn session(
        session_id: Option<String>,
        operation: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self::Session {
            session_id,
            operation: operation.into(),
            message: message.into(),
        }
    }

    /// Create a Command execution error
    pub fn command(
        command: impl Into<String>,
        exit_code: Option<i32>,
        message: impl Into<String>,
    ) -> Self {
        Self::Command {
            command: command.into(),
            exit_code,
            message: message.into(),
        }
    }

    /// Create a Network error
    pub fn network(
        url: impl Into<String>,
        status_code: Option<u16>,
        message: impl Into<String>,
    ) -> Self {
        Self::Network {
            url: url.into(),
            status_code,
            message: message.into(),
        }
    }

    /// Create a Serialization error
    pub fn serialization(data_type: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Serialization {
            data_type: data_type.into(),
            message: message.into(),
        }
    }

    /// Create a Permission error
    pub fn permission(resource: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Permission {
            resource: resource.into(),
            message: message.into(),
        }
    }

    /// Create a Validation error
    pub fn validation(
        field: impl Into<String>,
        value: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self::Validation {
            field: field.into(),
            value: value.into(),
            message: message.into(),
        }
    }

    /// Create a generic Application error
    pub fn application(component: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Application {
            component: component.into(),
            message: message.into(),
        }
    }

    /// Get user-friendly error message
    pub fn user_message(&self) -> String {
        match self {
            CommanderError::Git {
                operation,
                path,
                message,
            } => {
                format!(
                    "Git operation '{}' failed for '{}': {}",
                    operation, path, message
                )
            }
            CommanderError::Project {
                operation,
                project_name,
                message,
            } => {
                format!(
                    "Project operation '{}' failed for '{}': {}",
                    operation, project_name, message
                )
            }
            CommanderError::FileSystem {
                operation,
                path,
                message,
            } => {
                format!(
                    "File operation '{}' failed for '{}': {}",
                    operation, path, message
                )
            }
            CommanderError::LLM {
                provider,
                operation,
                message,
            } => {
                format!("{} operation '{}' failed: {}", provider, operation, message)
            }
            CommanderError::Configuration { component, message } => {
                format!("Configuration error in {}: {}", component, message)
            }
            CommanderError::Session {
                session_id,
                operation,
                message,
            } => match session_id {
                Some(id) => format!(
                    "Session '{}' operation '{}' failed: {}",
                    id, operation, message
                ),
                None => format!("Session operation '{}' failed: {}", operation, message),
            },
            CommanderError::Command {
                command,
                exit_code,
                message,
            } => match exit_code {
                Some(code) => format!(
                    "Command '{}' failed with exit code {}: {}",
                    command, code, message
                ),
                None => format!("Command '{}' failed: {}", command, message),
            },
            CommanderError::Network {
                url,
                status_code,
                message,
            } => match status_code {
                Some(code) => format!(
                    "Network request to '{}' failed with status {}: {}",
                    url, code, message
                ),
                None => format!("Network request to '{}' failed: {}", url, message),
            },
            CommanderError::Serialization { data_type, message } => {
                format!("Failed to process {} data: {}", data_type, message)
            }
            CommanderError::Permission { resource, message } => {
                format!("Permission denied for '{}': {}", resource, message)
            }
            CommanderError::Validation {
                field,
                value,
                message,
            } => {
                format!(
                    "Invalid value '{}' for field '{}': {}",
                    value, field, message
                )
            }
            CommanderError::Application { component, message } => {
                format!("{}: {}", component, message)
            }
        }
    }

    /// Get technical error message (for logging)
    pub fn technical_message(&self) -> String {
        format!("{:?}", self)
    }
}

impl fmt::Display for CommanderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.user_message())
    }
}

impl std::error::Error for CommanderError {}

/// Convert CommanderError to String for Tauri command compatibility
impl From<CommanderError> for String {
    fn from(error: CommanderError) -> Self {
        error.user_message()
    }
}

/// Result type alias for Commander operations
#[allow(dead_code)] // Used in tests
pub type CommanderResult<T> = Result<T, CommanderError>;

/// Helper macros for creating errors quickly
#[macro_export]
macro_rules! git_error {
    ($op:expr, $path:expr, $msg:expr) => {
        CommanderError::git($op, $path, $msg)
    };
}

#[macro_export]
macro_rules! project_error {
    ($op:expr, $name:expr, $msg:expr) => {
        CommanderError::project($op, $name, $msg)
    };
}

#[macro_export]
macro_rules! config_error {
    ($component:expr, $msg:expr) => {
        CommanderError::configuration($component, $msg)
    };
}

#[macro_export]
macro_rules! app_error {
    ($component:expr, $msg:expr) => {
        CommanderError::application($component, $msg)
    };
}
