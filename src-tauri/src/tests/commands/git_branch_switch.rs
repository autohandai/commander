#[cfg(test)]
mod tests {
    use std::fs;
    use std::process::Command as StdCommand;
    use tempfile::TempDir;

    use crate::commands::git_commands;

    fn init_git_repo(dir: &std::path::Path) {
        assert!(StdCommand::new("git").arg("init").current_dir(dir).status().unwrap().success());
        let _ = StdCommand::new("git").args(["config","user.name","Test"]).current_dir(dir).status();
        let _ = StdCommand::new("git").args(["config","user.email","test@example.com"]).current_dir(dir).status();
        fs::write(dir.join("README.md"), "# test\n").unwrap();
        assert!(StdCommand::new("git").args(["add","."]).current_dir(dir).status().unwrap().success());
        assert!(StdCommand::new("git").args(["commit","-m","init"]).current_dir(dir).status().unwrap().success());
        let _ = StdCommand::new("git").args(["branch","-M","main"]).current_dir(dir).status();
        assert!(StdCommand::new("git").args(["checkout","-b","feature/sidebar"]).current_dir(dir).status().unwrap().success());
        assert!(StdCommand::new("git").args(["checkout","main"]).current_dir(dir).status().unwrap().success());
    }

    #[tokio::test]
    async fn switches_project_branch_to_requested_ref() {
        let tmp = TempDir::new().unwrap();
        let repo = tmp.path().join("repo");
        fs::create_dir_all(&repo).unwrap();
        init_git_repo(&repo);

        git_commands::switch_project_git_branch(
            repo.to_string_lossy().to_string(),
            "feature/sidebar".to_string(),
        )
        .await
        .expect("switch branch");

        let output = StdCommand::new("git")
            .args(["branch", "--show-current"])
            .current_dir(&repo)
            .output()
            .expect("read branch");

        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "feature/sidebar");
    }

    #[tokio::test]
    async fn creates_project_branch_from_command() {
        let tmp = TempDir::new().unwrap();
        let repo = tmp.path().join("repo");
        fs::create_dir_all(&repo).unwrap();
        init_git_repo(&repo);

        git_commands::create_project_git_branch(
            repo.to_string_lossy().to_string(),
            "feature/header-actions".to_string(),
        )
        .await
        .expect("create branch");

        let output = StdCommand::new("git")
            .args(["branch", "--show-current"])
            .current_dir(&repo)
            .output()
            .expect("read branch");

        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), "feature/header-actions");
    }
}
