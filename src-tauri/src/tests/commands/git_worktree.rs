#[cfg(test)]
mod tests {
    use std::fs;
    use std::process::Command as StdCommand;
    use tempfile::TempDir;

    use crate::commands::git_commands;

    fn init_git_repo(dir: &std::path::Path) {
        // git init
        assert!(StdCommand::new("git").arg("init").current_dir(dir).status().unwrap().success());
        // user config (local)
        let _ = StdCommand::new("git").args(["config","user.name","Test"]).current_dir(dir).status();
        let _ = StdCommand::new("git").args(["config","user.email","test@example.com"]).current_dir(dir).status();
        // initial commit
        fs::write(dir.join("README.md"), "# test\n").unwrap();
        assert!(StdCommand::new("git").args(["add","."]).current_dir(dir).status().unwrap().success());
        assert!(StdCommand::new("git").args(["commit","-m","init"]).current_dir(dir).status().unwrap().success());
        // ensure main branch
        let _ = StdCommand::new("git").args(["branch","-M","main"]).current_dir(dir).status();
    }

    #[tokio::test]
    async fn create_and_remove_workspace_worktree() {
        let tmp = TempDir::new().unwrap();
        let repo = tmp.path().join("repo");
        fs::create_dir_all(&repo).unwrap();
        init_git_repo(&repo);

        // Create tauri app handle for commands that need store access
        let app = tauri::test::mock_builder().build();
        let app_handle = app.handle();

        // Create a workspace worktree under .commander
        let created = git_commands::create_workspace_worktree(
            app_handle.clone(),
            repo.to_string_lossy().to_string(),
            "ws1".to_string()
        ).await.expect("should create worktree");
        assert!(created.contains(".commander"));
        assert!(std::path::Path::new(&created).exists());

        // List worktrees and ensure it exists
        let worktrees = git_commands::get_git_worktrees().await.expect("list");
        assert!(worktrees.iter().any(|w| w.get("path").map(|p| p == &created).unwrap_or(false)));

        // Remove worktree
        git_commands::remove_workspace_worktree(
            repo.to_string_lossy().to_string(),
            created.clone()
        ).await.expect("remove");

        let worktrees_after = git_commands::get_git_worktrees().await.expect("list after");
        assert!(!worktrees_after.iter().any(|w| w.get("path").map(|p| p == &created).unwrap_or(false)));
    }
}

