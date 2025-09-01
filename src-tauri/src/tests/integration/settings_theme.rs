// On macOS, building a full Tauri app for tests requires main-thread constraints.
// Skip this integration test on macOS like other integration tests in this repo.
#[cfg(all(test, not(target_os = "macos")))]
mod tests {
    use serial_test::serial;
    use tempfile::TempDir;

    use crate::models::AppSettings;
    use crate::commands::settings_commands::{load_app_settings, save_app_settings};

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
    fn test_app_settings_ui_theme_persistence() {
        let (app, _home_td) = build_test_app();
        let handle = app.handle();

        // Load defaults
        let defaults = tauri::async_runtime::block_on(load_app_settings(handle.clone()))
            .expect("load_app_settings should return defaults");
        assert_eq!(defaults.ui_theme, "auto");

        // Save with dark theme
        let mut updated = defaults.clone();
        updated.ui_theme = "dark".to_string();
        tauri::async_runtime::block_on(save_app_settings(handle.clone(), updated.clone()))
            .expect("save_app_settings should succeed");

        // Load and verify persisted value
        let reloaded = tauri::async_runtime::block_on(load_app_settings(handle.clone()))
            .expect("load_app_settings should succeed");
        assert_eq!(reloaded.ui_theme, "dark");
    }
}

