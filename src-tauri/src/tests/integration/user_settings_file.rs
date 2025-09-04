// Skip on macOS due to tauri thread constraints like other integration tests
#[cfg(all(test, not(target_os = "macos")))]
mod tests {
    use serial_test::serial;
    use tempfile::TempDir;
    use std::fs;
    use std::path::PathBuf;

    use crate::models::AppSettings;
    use crate::commands::settings_commands::{load_app_settings, save_app_settings};

    fn build_test_app() -> (tauri::App, TempDir) {
        let td = TempDir::new().expect("tempdir");
        std::env::set_var("HOME", td.path());
        let app = tauri::Builder::default()
            .plugin(tauri_plugin_store::Builder::new().build())
            .build(tauri::generate_context!())
            .expect("failed to build test app");
        (app, td)
    }

    fn settings_file_path(home: &TempDir) -> PathBuf {
        home.path().join(".commander").join("settings.json")
    }

    #[test]
    #[serial]
    fn test_welcome_recent_setting_persists_to_user_file() {
        let (app, home_td) = build_test_app();
        let handle = app.handle();

        // Save settings with welcome recent disabled
        let mut s = AppSettings::default();
        s.show_welcome_recent_projects = false;
        tauri::async_runtime::block_on(save_app_settings(handle.clone(), s)).expect("save");

        // Verify user settings file exists and has the flag set
        let sf = settings_file_path(&home_td);
        assert!(sf.exists());
        let content = fs::read_to_string(&sf).expect("read user settings");
        assert!(content.contains("show_recent_projects_welcome_screen"));
        assert!(content.contains("false"));

        // Now load and ensure it reflects the value
        let loaded = tauri::async_runtime::block_on(load_app_settings(handle.clone())).expect("load");
        assert!(!loaded.show_welcome_recent_projects);
    }
}

