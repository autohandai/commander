#[cfg(test)]
mod tests {
    use crate::models::RecentProject;
    use crate::services::project_service;
    use tempfile::TempDir;

    fn rp(name: &str, path: &str, ts: i64) -> RecentProject {
        RecentProject {
            name: name.to_string(),
            path: path.to_string(),
            last_accessed: ts,
            is_git_repo: true,
            git_branch: Some("main".to_string()),
            git_status: Some("clean".to_string()),
        }
    }

    #[test]
    fn test_remove_recent_project_by_path_removes_only_matching_entry() {
        let projects = vec![
            rp("Commander", "/tmp/commander", 3),
            rp("Codex", "/tmp/codex", 2),
            rp("Gemini", "/tmp/gemini", 1),
        ];

        let filtered = project_service::remove_recent_project_by_path(projects, "/tmp/codex");

        assert_eq!(filtered.len(), 2);
        assert_eq!(filtered[0].path, "/tmp/commander");
        assert_eq!(filtered[1].path, "/tmp/gemini");
    }

    #[test]
    fn test_delete_project_directory_requires_existing_directory() {
        let missing = project_service::delete_project_directory("/tmp/definitely-missing-project-path");
        assert!(missing.is_err());
    }

    #[test]
    fn test_delete_project_directory_removes_existing_directory() {
        let temp_dir = TempDir::new().expect("tempdir");
        let project_path = temp_dir.path().join("sidebar-delete-target");
        std::fs::create_dir_all(&project_path).expect("create project path");
        std::fs::write(project_path.join("README.md"), "hello").expect("seed file");

        project_service::delete_project_directory(project_path.to_str().expect("utf8 path"))
            .expect("delete project directory");

        assert!(!project_path.exists());
    }

    #[test]
    fn test_project_application_spec_returns_known_application() {
        let cursor = project_service::project_application_spec("cursor").expect("cursor spec");
        assert_eq!(cursor.id, "cursor");
        assert_eq!(cursor.label, "Cursor");
    }

    #[test]
    fn test_project_application_spec_rejects_unknown_application() {
        let missing = project_service::project_application_spec("not-a-real-editor");
        assert!(missing.is_err());
    }
}
