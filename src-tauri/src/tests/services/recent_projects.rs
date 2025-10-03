#[cfg(test)]
mod tests {
    use crate::models::RecentProject;
    use crate::services::project_service;

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
    fn test_recent_projects_dedup_and_mru() {
        // existing list with A (older), B (newer)
        let existing = vec![rp("A", "/p/A", 100), rp("B", "/p/B", 200)];

        // upsert A again with newer timestamp -> A should move to front, no duplicates
        let updated_a = rp("A", "/p/A", 300);

        // This helper must perform: dedup by path, insert at front, keep order for others
        let result = project_service::upsert_recent_projects(existing, updated_a, 20);

        assert_eq!(result.len(), 2, "No duplicates should be created");
        assert_eq!(result[0].path, "/p/A", "Reopened project moves to front");
        assert_eq!(result[1].path, "/p/B", "Other entries keep relative order");
        assert_eq!(result[0].last_accessed, 300, "Timestamp updated to newest");
    }

    #[test]
    fn test_recent_projects_capped_at_20() {
        // Build 21 projects
        let mut existing: Vec<RecentProject> = (0..21)
            .map(|i| rp(&format!("P{i}"), &format!("/p/{i}"), i as i64))
            .collect();

        // Upsert a new project P21 with latest ts
        let new_item = rp("P21", "/p/21", 10_000);
        let result =
            project_service::upsert_recent_projects(existing.drain(..).collect(), new_item, 20);

        assert_eq!(result.len(), 20, "List must be capped at 20");
        assert_eq!(result[0].path, "/p/21", "Newest project at front");
        // Oldest should have been dropped; ensure "/p/0" is not present
        assert!(
            !result.iter().any(|p| p.path == "/p/0"),
            "Oldest item should be dropped"
        );
    }
}
