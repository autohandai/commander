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
    }

    #[tokio::test]
    async fn file_at_commit_is_retrieved() {
        let tmp = TempDir::new().unwrap();
        let repo = tmp.path().join("repo");
        fs::create_dir_all(&repo).unwrap();
        init_repo(&repo);

        // first commit
        fs::write(repo.join("a.txt"), b"one\n").unwrap();
        assert!(StdCommand::new("git").args(["add","a.txt"]).current_dir(&repo).status().unwrap().success());
        assert!(StdCommand::new("git").args(["commit","-m","c1"]).current_dir(&repo).status().unwrap().success());
        let c1 = String::from_utf8(StdCommand::new("git").args(["rev-parse","HEAD"]).current_dir(&repo).output().unwrap().stdout).unwrap();
        let c1 = c1.trim().to_string();

        // second commit
        let mut f = fs::OpenOptions::new().append(true).open(repo.join("a.txt")).unwrap();
        writeln!(f, "two").unwrap();
        assert!(StdCommand::new("git").args(["add","a.txt"]).current_dir(&repo).status().unwrap().success());
        assert!(StdCommand::new("git").args(["commit","-m","c2"]).current_dir(&repo).status().unwrap().success());
        let c2 = String::from_utf8(StdCommand::new("git").args(["rev-parse","HEAD"]).current_dir(&repo).output().unwrap().stdout).unwrap();
        let c2 = c2.trim().to_string();

        let v1 = git_commands::get_file_at_commit(repo.to_string_lossy().to_string(), c1.clone(), "a.txt".into()).await.expect("file at c1");
        let v2 = git_commands::get_file_at_commit(repo.to_string_lossy().to_string(), c2.clone(), "a.txt".into()).await.expect("file at c2");

        assert!(v1.contains("one"));
        assert!(!v1.contains("two"));
        assert!(v2.contains("two"));
    }
}
