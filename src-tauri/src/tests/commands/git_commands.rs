#[cfg(test)]
mod tests {
    use crate::commands::git_commands::is_valid_git_repository;
    use crate::tests::{create_test_git_project, create_test_regular_project};
    use crate::*;
    use std::path::Path;

    #[tokio::test]
    async fn test_is_valid_git_repository_with_git_folder() {
        let (_temp_dir, project_path) = create_test_git_project("test-git-repo");

        let result = is_valid_git_repository(&project_path);

        assert!(result, "Should detect valid git repository");
    }

    #[tokio::test]
    async fn test_is_valid_git_repository_without_git_folder() {
        let (_temp_dir, project_path) = create_test_regular_project("test-regular-folder");

        let result = is_valid_git_repository(&project_path);

        assert!(
            !result,
            "Should not detect git repository in regular folder"
        );
    }

    #[tokio::test]
    async fn test_is_valid_git_repository_nonexistent_path() {
        let nonexistent_path = Path::new("/this/path/does/not/exist");

        let result = is_valid_git_repository(nonexistent_path);

        assert!(!result, "Should return false for nonexistent path");
    }

    #[tokio::test]
    async fn test_validate_git_repository_command_valid_repo() {
        let (_temp_dir, project_path) = create_test_git_project("test-command-valid");
        let path_str = project_path.to_string_lossy().to_string();

        let result = validate_git_repository(path_str).await;

        assert!(result.is_ok(), "Command should succeed for valid git repo");
        assert!(result.unwrap(), "Should return true for valid git repo");
    }

    #[tokio::test]
    async fn test_validate_git_repository_command_invalid_repo() {
        let (_temp_dir, project_path) = create_test_regular_project("test-command-invalid");
        let path_str = project_path.to_string_lossy().to_string();

        let result = validate_git_repository(path_str).await;

        assert!(result.is_ok(), "Command should not error for invalid repo");
        assert!(!result.unwrap(), "Should return false for non-git folder");
    }

    #[tokio::test]
    async fn test_validate_git_repository_command_nonexistent_path() {
        let nonexistent_path = "/this/path/absolutely/does/not/exist".to_string();

        let result = validate_git_repository(nonexistent_path).await;

        assert!(
            result.is_ok(),
            "Command should not error for nonexistent path"
        );
        assert!(!result.unwrap(), "Should return false for nonexistent path");
    }
}
