use crate::error::{CommanderError, CommanderResult};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_git_error_creation() {
        let error = CommanderError::git("clone", "/path/to/repo", "Repository not found");

        match &error {
            CommanderError::Git {
                operation,
                path,
                message,
            } => {
                assert_eq!(operation, "clone");
                assert_eq!(path, "/path/to/repo");
                assert_eq!(message, "Repository not found");
            }
            _ => panic!("Expected Git error"),
        }

        let user_msg = error.user_message();
        assert!(user_msg.contains("clone"));
        assert!(user_msg.contains("/path/to/repo"));
        assert!(user_msg.contains("Repository not found"));
    }

    #[test]
    fn test_project_error_creation() {
        let error = CommanderError::project("create", "MyProject", "Directory already exists");

        let user_msg = error.user_message();
        assert_eq!(
            user_msg,
            "Project operation 'create' failed for 'MyProject': Directory already exists"
        );
    }

    #[test]
    fn test_llm_error_creation() {
        let error = CommanderError::llm("OpenRouter", "fetch_models", "API key required");

        let user_msg = error.user_message();
        assert_eq!(
            user_msg,
            "OpenRouter operation 'fetch_models' failed: API key required"
        );
    }

    #[test]
    fn test_validation_error_creation() {
        let error = CommanderError::validation(
            "project_name",
            "invalid/name",
            "Project name cannot contain slashes",
        );

        let user_msg = error.user_message();
        assert_eq!(user_msg, "Invalid value 'invalid/name' for field 'project_name': Project name cannot contain slashes");
    }

    #[test]
    fn test_network_error_with_status_code() {
        let error =
            CommanderError::network("https://api.example.com", Some(404), "Resource not found");

        let user_msg = error.user_message();
        assert!(user_msg.contains("404"));
        assert!(user_msg.contains("https://api.example.com"));
    }

    #[test]
    fn test_session_error_with_id() {
        let error = CommanderError::session(
            Some("sess-123".to_string()),
            "terminate",
            "Session not found",
        );

        let user_msg = error.user_message();
        assert!(user_msg.contains("sess-123"));
        assert!(user_msg.contains("terminate"));
    }

    #[test]
    fn test_session_error_without_id() {
        let error = CommanderError::session(None, "list", "No active sessions");

        let user_msg = error.user_message();
        assert!(!user_msg.contains("sess-"));
        assert!(user_msg.contains("list"));
    }

    #[test]
    fn test_command_error_with_exit_code() {
        let error = CommanderError::command("git status", Some(128), "Not a git repository");

        let user_msg = error.user_message();
        assert!(user_msg.contains("128"));
        assert!(user_msg.contains("git status"));
    }

    #[test]
    fn test_error_conversion_to_string() {
        let error = CommanderError::application("FileManager", "Failed to read directory");
        let error_string: String = error.into();

        assert_eq!(error_string, "FileManager: Failed to read directory");
    }

    #[test]
    fn test_error_display_trait() {
        let error = CommanderError::configuration("Settings", "Invalid JSON format");
        let displayed = format!("{}", error);

        assert_eq!(
            displayed,
            "Configuration error in Settings: Invalid JSON format"
        );
    }

    #[test]
    fn test_commander_result_usage() {
        fn example_function(should_fail: bool) -> CommanderResult<String> {
            if should_fail {
                Err(CommanderError::application(
                    "TestFunction",
                    "Simulated failure",
                ))
            } else {
                Ok("Success".to_string())
            }
        }

        // Test success case
        let result = example_function(false);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Success");

        // Test error case
        let result = example_function(true);
        assert!(result.is_err());
        let error = result.unwrap_err();
        assert!(error.user_message().contains("TestFunction"));
    }

    #[test]
    fn test_technical_vs_user_messages() {
        let error = CommanderError::git("push", "/repo", "Authentication failed");

        let user_msg = error.user_message();
        let technical_msg = error.technical_message();

        // User message should be readable
        assert!(user_msg.contains("Git operation"));
        assert!(!user_msg.contains("Git {"));

        // Technical message should contain debug info
        assert!(technical_msg.contains("Git {"));
        assert!(technical_msg.contains("operation:"));
    }

    #[test]
    fn test_error_serialization() {
        let error = CommanderError::project("delete", "TestProject", "Project is locked");

        // Test that error can be serialized to JSON (important for Tauri)
        let json = serde_json::to_string(&error).expect("Error should be serializable");
        assert!(json.contains("Project"));
        assert!(json.contains("delete"));
        assert!(json.contains("TestProject"));

        // Test that error can be deserialized back
        let deserialized: CommanderError =
            serde_json::from_str(&json).expect("Error should be deserializable");
        match deserialized {
            CommanderError::Project {
                operation,
                project_name,
                message,
            } => {
                assert_eq!(operation, "delete");
                assert_eq!(project_name, "TestProject");
                assert_eq!(message, "Project is locked");
            }
            _ => panic!("Deserialized error should be Project variant"),
        }
    }
}
