#[cfg(test)]
mod tests {
    use crate::commands::git_commands::is_valid_git_repository;
    use crate::tests::create_test_git_project;
    use crate::*;
    use serial_test::serial;
    use tempfile::TempDir;

    // Helper function to create a mock app handle for testing
    // Note: This is a placeholder - we'll need to implement proper app mocking
    async fn create_mock_app() -> tauri::AppHandle {
        // TODO: Implement proper mock app creation
        // For now, this will need to be implemented when we set up full integration tests
        todo!("Implement mock app creation")
    }

    #[tokio::test]
    #[serial] // Ensure tests don't interfere with each other's storage
    async fn test_add_project_to_recent_valid_project() {
        let (_temp_dir, project_path) = create_test_git_project("test-recent-project");
        let _path_str = project_path.to_string_lossy().to_string();

        // This test will need a mock app handle
        // TODO: Implement when we have proper app mocking
        // let app = create_mock_app().await;
        // let result = add_project_to_recent(app, path_str).await;
        // assert!(result.is_ok(), "Should successfully add valid git project to recent");
    }

    #[tokio::test]
    async fn test_check_project_name_conflict_no_conflict() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let projects_folder = temp_dir.path().to_string_lossy().to_string();
        let project_name = "unique-project-name".to_string();

        let result = check_project_name_conflict(projects_folder, project_name).await;

        assert!(result.is_ok(), "Command should succeed");
        assert!(
            !result.unwrap(),
            "Should return false for non-conflicting name"
        );
    }

    #[tokio::test]
    async fn test_check_project_name_conflict_with_conflict() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let projects_folder = temp_dir.path().to_string_lossy().to_string();
        let project_name = "existing-project".to_string();

        // Create the conflicting project directory
        let conflicting_path = temp_dir.path().join(&project_name);
        std::fs::create_dir_all(&conflicting_path).expect("Failed to create conflicting directory");

        let result = check_project_name_conflict(projects_folder, project_name).await;

        assert!(result.is_ok(), "Command should succeed");
        assert!(result.unwrap(), "Should return true for conflicting name");
    }

    #[test]
    fn test_is_valid_git_repository_helper() {
        let (_temp_dir, project_path) = create_test_git_project("test-helper-function");

        let result = is_valid_git_repository(&project_path);

        assert!(result, "Helper function should detect valid git repository");
    }

    #[test]
    fn test_is_valid_git_repository_helper_invalid() {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        let regular_path = temp_dir.path().join("not-a-git-repo");
        std::fs::create_dir_all(&regular_path).expect("Failed to create directory");

        let result = is_valid_git_repository(&regular_path);

        assert!(
            !result,
            "Helper function should not detect git in regular folder"
        );
    }

    // Integration test placeholder for the full project creation workflow
    #[tokio::test]
    #[serial]
    async fn test_create_project_workflow_integration() {
        // TODO: Implement full integration test that:
        // 1. Creates a new project with git
        // 2. Verifies it's added to recent projects
        // 3. Verifies it can be listed in recent projects
        // 4. Cleans up properly

        // This will require proper app handle mocking
    }
}
