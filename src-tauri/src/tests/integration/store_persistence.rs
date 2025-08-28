#[cfg(test)]
mod tests {
    use crate::commands::project_commands::{open_existing_project, list_recent_projects};
    use crate::tests::{create_test_git_project};
    use serial_test::serial;
    use tempfile::TempDir;

    fn build_test_app() -> tauri::App {
        // Isolate plugin-store path by overriding HOME to a temp dir
        let td = TempDir::new().expect("tempdir");
        std::env::set_var("HOME", td.path());

        // Build a minimal Tauri app with the store plugin enabled
        let app = tauri::Builder::default()
            .plugin(tauri_plugin_store::Builder::new().build())
            .build(tauri::generate_context!())
            .expect("failed to build test app");

        app
    }

    #[tokio::test]
    #[serial]
    async fn test_open_existing_project_persists_and_dedups() {
        let (_td, path) = create_test_git_project("persist-git");
        let path_str = path.to_string_lossy().to_string();

        let app = build_test_app();
        let handle = app.handle();

        // First open
        let rp1 = open_existing_project(handle.clone(), path_str.clone()).await
            .expect("open should succeed");
        assert_eq!(rp1.path, path_str);
        assert!(rp1.is_git_repo);

        // List recents
        let recents1 = list_recent_projects(handle.clone()).await
            .expect("list recent should succeed");
        assert_eq!(recents1.len(), 1);
        assert_eq!(recents1[0].path, path_str);

        // Reopen same path should dedup and keep len=1
        let rp2 = open_existing_project(handle.clone(), path_str.clone()).await
            .expect("reopen should succeed");
        assert_eq!(rp2.path, path_str);

        let recents2 = list_recent_projects(handle.clone()).await
            .expect("list should succeed");
        assert_eq!(recents2.len(), 1, "No duplicates should be created");
        assert_eq!(recents2[0].path, path_str);
    }
}

