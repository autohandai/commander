#[cfg(test)]
mod tests {
    use std::env;
    use std::fs;
    use std::path::PathBuf;
    use serial_test::serial;
    use tempfile::TempDir;

    use crate::services::sub_agent_service::SubAgentService;

    fn set_home(temp: &TempDir) {
        env::set_var("HOME", temp.path());
        // Also set USERPROFILE for Windows compatibility
        env::set_var("USERPROFILE", temp.path());
    }

    #[tokio::test]
    #[serial]
    async fn create_sub_agent_creates_file_under_home() {
        let temp = TempDir::new().expect("tempdir");
        set_home(&temp);

        // Create agent
        let agent = SubAgentService::create_sub_agent(
            "claude",
            "My Tool",
            Some("Test description".to_string()),
            Some("#ff00ff".to_string()),
            Some("claude-3".to_string()),
            "# Instructions\nDo things well.".to_string(),
        )
        .await
        .expect("create should succeed");

        // File exists in ~/.claude/agents/my-tool.md
        let expected_path = temp
            .path()
            .join(".claude/agents/my-tool.md");
        assert!(expected_path.exists(), "expected {:?} to exist", expected_path);

        // Load via service to ensure discoverable
        let agents = SubAgentService::load_agents_for_cli("claude")
            .await
            .expect("load should succeed");
        assert!(agents.iter().any(|a| a.name == agent.name));
    }

    #[tokio::test]
    #[serial]
    async fn save_sub_agent_overwrites_content() {
        let temp = TempDir::new().expect("tempdir");
        set_home(&temp);

        // Prepare a file
        let file_path: PathBuf = temp
            .path()
            .join(".codex/agents/test.md");
        fs::create_dir_all(file_path.parent().unwrap()).unwrap();
        fs::write(&file_path, "---\nname: Test\ndescription: D\n---\nold").unwrap();

        // Save new content
        SubAgentService::save_agent_file(&file_path, "---\nname: Test\ndescription: D\n---\nnew").expect("save should succeed");

        let updated = fs::read_to_string(&file_path).unwrap();
        assert!(updated.contains("new"));
        assert!(!updated.contains("old"));
    }

    #[tokio::test]
    #[serial]
    async fn delete_sub_agent_removes_file() {
        let temp = TempDir::new().expect("tempdir");
        set_home(&temp);

        // Create a file under ~/.gemini/agents
        let file_path: PathBuf = temp
            .path()
            .join(".gemini/agents/will-delete.md");
        fs::create_dir_all(file_path.parent().unwrap()).unwrap();
        fs::write(&file_path, "---\nname: Delete Me\ndescription: D\n---\nbye").unwrap();

        assert!(file_path.exists());
        SubAgentService::delete_agent_file(&file_path).expect("delete should succeed");
        assert!(!file_path.exists());
    }
}
