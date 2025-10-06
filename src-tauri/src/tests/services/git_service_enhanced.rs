#[cfg(test)]
mod tests {
    use crate::services::git_service;
    use crate::tests::{create_test_git_project, create_test_regular_project};
    use std::fs;
    use std::path::Path;
    use std::process::Command as StdCommand;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_find_git_root_regular_repo() {
        let (_temp_dir, project_path) = create_test_git_project("test-git-root");
        let path_str = project_path.to_string_lossy().to_string();

        let result = git_service::find_git_root(&path_str);

        assert!(result.is_some(), "Should find git root for regular repo");
        let root = result.unwrap();
        assert_eq!(Path::new(&root), project_path);
    }

    #[tokio::test]
    async fn test_find_git_root_nonexistent_path() {
        let nonexistent_path = "/this/path/does/not/exist";

        let result = git_service::find_git_root(nonexistent_path);

        assert!(result.is_none(), "Should return None for nonexistent path");
    }

    #[tokio::test]
    async fn test_find_git_root_non_git_directory() {
        let (_temp_dir, project_path) = create_test_regular_project("test-non-git");
        let path_str = project_path.to_string_lossy().to_string();

        let result = git_service::find_git_root(&path_str);

        assert!(result.is_none(), "Should return None for non-git directory");
    }

    #[tokio::test]
    async fn test_resolve_git_project_path_regular_repo() {
        let (_temp_dir, project_path) = create_test_git_project("test-resolve-regular");
        let path_str = project_path.to_string_lossy().to_string();

        let result = git_service::resolve_git_project_path(&path_str);

        assert!(result.is_some(), "Should resolve regular git repository");
        assert_eq!(result.unwrap(), path_str);
    }

    #[tokio::test]
    async fn test_resolve_git_project_path_non_git_directory() {
        let (_temp_dir, project_path) = create_test_regular_project("test-resolve-non-git");
        let path_str = project_path.to_string_lossy().to_string();

        let result = git_service::resolve_git_project_path(&path_str);

        assert!(result.is_none(), "Should return None for non-git directory");
    }

    #[tokio::test]
    async fn test_resolve_git_project_path_with_worktree() {
        // Create a main repository
        let temp_dir = TempDir::new().unwrap();
        let main_repo = temp_dir.path().join("main");
        fs::create_dir_all(&main_repo).unwrap();

        // Initialize git repo
        init_git_repo(&main_repo);

        // Create a worktree
        let worktree_path = temp_dir.path().join("worktree");
        let output = StdCommand::new("git")
            .current_dir(&main_repo)
            .args([
                "worktree",
                "add",
                "-b",
                "feature",
                worktree_path.to_str().unwrap(),
            ])
            .output()
            .unwrap();

        assert!(output.status.success(), "Failed to create worktree");

        // Test resolve on the worktree
        let worktree_str = worktree_path.to_string_lossy().to_string();
        let result = git_service::resolve_git_project_path(&worktree_str);

        // Should resolve to either the main repo or fallback to git command result
        assert!(
            result.is_some(),
            "Should resolve worktree to main repository or itself"
        );

        // The result should be a valid git repository path
        let resolved_path = result.unwrap();
        assert!(
            Path::new(&resolved_path).exists(),
            "Resolved path should exist"
        );
    }

    fn init_git_repo(dir: &std::path::Path) {
        // git init
        assert!(StdCommand::new("git")
            .arg("init")
            .current_dir(dir)
            .status()
            .unwrap()
            .success());
        // user config (local)
        let _ = StdCommand::new("git")
            .args(["config", "user.name", "Test"])
            .current_dir(dir)
            .status();
        let _ = StdCommand::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(dir)
            .status();
        // initial commit
        fs::write(dir.join("README.md"), "# test\n").unwrap();
        assert!(StdCommand::new("git")
            .args(["add", "."])
            .current_dir(dir)
            .status()
            .unwrap()
            .success());
        assert!(StdCommand::new("git")
            .args(["commit", "-m", "init"])
            .current_dir(dir)
            .status()
            .unwrap()
            .success());
        // ensure main branch
        let _ = StdCommand::new("git")
            .args(["branch", "-M", "main"])
            .current_dir(dir)
            .status();
    }

    #[tokio::test]
    async fn test_resolve_git_project_path_subdir_of_repo() {
        let (_temp_dir, project_path) = create_test_git_project("test-resolve-subdir");

        // Create a subdirectory
        let subdir = project_path.join("src").join("components");
        fs::create_dir_all(&subdir).unwrap();

        let subdir_str = subdir.to_string_lossy().to_string();
        let result = git_service::resolve_git_project_path(&subdir_str);

        // Should return None because the subdirectory itself doesn't have .git
        assert!(
            result.is_none(),
            "Subdirectory without .git should return None"
        );

        // But find_git_root should work from the subdirectory
        let root_result = git_service::find_git_root(&subdir_str);
        assert!(
            root_result.is_some(),
            "find_git_root should work from subdirectory"
        );

        let root = root_result.unwrap();
        assert_eq!(
            Path::new(&root),
            project_path,
            "Should find the main repository root"
        );
    }
}
