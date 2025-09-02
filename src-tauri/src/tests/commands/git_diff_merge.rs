#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;
    use std::process::Command as StdCommand;
    use tempfile::TempDir;
    use crate::commands::git_commands;

    fn init_repo(path: &std::path::Path) {
        assert!(StdCommand::new("git").arg("init").current_dir(path).status().unwrap().success());
        let _ = StdCommand::new("git").args(["config","user.name","Test"]).current_dir(path).status();
        let _ = StdCommand::new("git").args(["config","user.email","test@example.com"]).current_dir(path).status();
        fs::write(path.join("file.txt"), b"hello\n").unwrap();
        assert!(StdCommand::new("git").args(["add","."]).current_dir(path).status().unwrap().success());
        assert!(StdCommand::new("git").args(["commit","-m","init"]).current_dir(path).status().unwrap().success());
        let _ = StdCommand::new("git").args(["branch","-M","main"]).current_dir(path).status();
    }

    #[tokio::test]
    async fn diff_and_merge_workspace() {
        let tmp = TempDir::new().unwrap();
        let repo = tmp.path().join("repo");
        fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);

        // create workspace worktree
        let app = tauri::test::mock_builder().build();
        let app_handle = app.handle();
        let ws_path = git_commands::create_workspace_worktree(app_handle, repo.to_string_lossy().to_string(), "ws1".into())
            .await.expect("create worktree");

        // modify file in worktree and commit
        let wsp = std::path::PathBuf::from(&ws_path);
        let mut f = fs::OpenOptions::new().append(true).open(wsp.join("file.txt")).unwrap();
        writeln!(f, "world").unwrap();
        assert!(StdCommand::new("git").args(["add","file.txt"]).current_dir(&wsp).status().unwrap().success());
        assert!(StdCommand::new("git").args(["commit","-m","ws change"]).current_dir(&wsp).status().unwrap().success());

        // diff
        let diff = git_commands::diff_workspace_vs_main(repo.to_string_lossy().to_string(), ws_path.clone()).await.expect("diff");
        assert!(diff.iter().any(|d| d.get("path") == Some(&"file.txt".to_string())));

        // file diff should contain added line
        let file_diff = git_commands::diff_workspace_file(repo.to_string_lossy().to_string(), ws_path.clone(), "file.txt".into()).await.expect("file diff");
        assert!(file_diff.contains("+world"));

        // merge
        git_commands::merge_workspace_to_main(repo.to_string_lossy().to_string(), ws_path.clone(), Some("merge ws".into())).await.expect("merge");

        // verify main has content
        let content = fs::read_to_string(repo.join("file.txt")).unwrap();
        assert!(content.contains("world"));
    }
}
