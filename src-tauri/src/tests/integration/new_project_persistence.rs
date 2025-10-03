// On macOS, building a full Tauri app for tests requires main-thread constraints.
// Skip this integration test on macOS like other integration tests in this repo.
#[cfg(all(test, not(target_os = "macos")))]
mod tests {
    use crate::commands::project_commands::{
        create_new_project_with_git, list_recent_projects, open_existing_project,
    };
    use crate::tests::create_test_git_project;
    use serial_test::serial;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn build_test_app() -> (tauri::App, TempDir) {
        // Isolate plugin-store path by overriding HOME to a temp dir
        let td = TempDir::new().expect("tempdir");
        std::env::set_var("HOME", td.path());

        // Build a minimal Tauri app with the store plugin enabled
        let app = tauri::Builder::default()
            .plugin(tauri_plugin_store::Builder::new().build())
            .build(tauri::generate_context!())
            .expect("failed to build test app");

        (app, td)
    }

    #[test]
    #[serial]
    fn test_create_new_project_preserves_existing_recents_and_adds_new() {
        let (app, _home_td) = build_test_app();
        let handle = app.handle();

        // Seed existing recent with a real git repo
        let (_seed_td, seed_path) = create_test_git_project("seed-repo");
        let seed_path_str = seed_path.to_string_lossy().to_string();
        let _ = tauri::async_runtime::block_on(open_existing_project(
            handle.clone(),
            seed_path_str.clone(),
        ))
        .expect("seed open should succeed");

        // Verify it is listed
        let recents_before = tauri::async_runtime::block_on(list_recent_projects(handle.clone()))
            .expect("list before should succeed");
        assert_eq!(recents_before.len(), 1);
        assert_eq!(recents_before[0].path, seed_path_str);

        // Create a new project in a temp projects folder via command
        let projects_folder_td = TempDir::new().expect("projects folder tempdir");
        let projects_folder: PathBuf = projects_folder_td.path().to_path_buf();
        let proj_name = "new-cli-project".to_string();

        let new_path = tauri::async_runtime::block_on(create_new_project_with_git(
            handle.clone(),
            projects_folder.to_string_lossy().to_string(),
            proj_name.clone(),
        ))
        .expect("create_new_project_with_git should succeed");

        // After creation, both the seed repo and the new project should exist in recents
        let recents_after = tauri::async_runtime::block_on(list_recent_projects(handle.clone()))
            .expect("list after should succeed");

        assert_eq!(
            recents_after.len(),
            2,
            "Should keep existing and add the new project"
        );
        assert!(recents_after.iter().any(|p| p.path == seed_path_str));
        assert!(recents_after.iter().any(|p| p.path == new_path));
    }
}
