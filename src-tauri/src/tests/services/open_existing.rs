#[cfg(test)]
mod tests {
    use crate::models::RecentProject;
    use crate::services::project_service;
    use crate::tests::{create_test_git_project, create_test_regular_project};

    fn names(paths: &[RecentProject]) -> Vec<String> {
        paths.iter().map(|p| p.path.clone()).collect()
    }

    #[test]
    fn test_open_existing_project_core_valid_git_repo_dedup_mru() {
        let (_td, git_path) = create_test_git_project("proj-a");
        let git_path_str = git_path.to_string_lossy().to_string();

        // existing list contains the same path (older) and another project
        let existing = vec![
            RecentProject { name: "X".into(), path: git_path_str.clone(), last_accessed: 10, is_git_repo: true, git_branch: None, git_status: None },
            RecentProject { name: "Y".into(), path: "/other".into(), last_accessed: 20, is_git_repo: false, git_branch: None, git_status: None },
        ];

        let updated = project_service::open_existing_project_core(existing, &git_path_str, 999)
            .expect("should succeed for valid git repo");

        assert_eq!(updated.len(), 2, "Should not duplicate entries");
        assert_eq!(updated[0].path, git_path_str, "Re-opened project moves to front");
        assert!(updated[0].last_accessed >= 999, "Updated timestamp should be used");
        assert_eq!(updated[1].path, "/other");
    }

    #[test]
    fn test_open_existing_project_core_non_git_repo_errors() {
        let (_td, regular_path) = create_test_regular_project("not-git");
        let regular_path_str = regular_path.to_string_lossy().to_string();

        let existing: Vec<RecentProject> = vec![];
        let err = project_service::open_existing_project_core(existing, &regular_path_str, 1)
            .expect_err("should error for non-git folder");
        assert!(err.to_lowercase().contains("not a valid git"));
    }
}

