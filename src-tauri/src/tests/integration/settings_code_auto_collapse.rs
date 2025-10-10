// Skip on macOS to match other integration tests that require non-main-thread access.
#[cfg(all(test, not(target_os = "macos")))]
mod tests {
    use serial_test::serial;
    use tempfile::TempDir;
    use std::fs;
    use std::path::PathBuf;

    use crate::commands::settings_commands::{load_app_settings, save_app_settings};
    use crate::models::AppSettings;

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
    fn test_code_auto_collapse_default_and_persistence() {
        let (app, _home_td) = build_test_app();
        let handle = app.handle();

        let defaults = tauri::async_runtime::block_on(load_app_settings(handle.clone()))
            .expect("load_app_settings should succeed");
        assert!(!defaults.code_settings.auto_collapse_sidebar);

        let mut updated = defaults.clone();
        updated.code_settings.auto_collapse_sidebar = true;
        tauri::async_runtime::block_on(save_app_settings(handle.clone(), updated))
            .expect("save_app_settings should succeed");

        let reloaded = tauri::async_runtime::block_on(load_app_settings(handle.clone()))
            .expect("load_app_settings should succeed after save");
        assert!(reloaded.code_settings.auto_collapse_sidebar);
    }

    #[test]
    #[serial]
    fn test_code_auto_collapse_persists_to_user_file_and_is_respected() {
        let (app, home_td) = build_test_app();
        let handle = app.handle();

        let mut s = AppSettings::default();
        s.code_settings.auto_collapse_sidebar = true;
        tauri::async_runtime::block_on(save_app_settings(handle.clone(), s))
            .expect("save_app_settings should succeed");

        let sf = settings_file_path(&home_td);
        assert!(sf.exists(), "user settings file should be created");

        let mut json: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(&sf).expect("read user settings"),
        )
        .expect("parse user settings json");
        assert_eq!(
            json.get("code")
                .and_then(|c| c.get("auto_collapse_sidebar"))
                .and_then(|b| b.as_bool()),
            Some(true)
        );

        // Flip the value manually to ensure load respects user edits.
        json["code"]["auto_collapse_sidebar"] = serde_json::json!(false);
        fs::write(&sf, serde_json::to_string_pretty(&json).expect("serialize json"))
            .expect("write user settings");

        let loaded = tauri::async_runtime::block_on(load_app_settings(handle.clone()))
            .expect("load_app_settings should succeed after manual edit");
        assert!(!loaded.code_settings.auto_collapse_sidebar);
    }
}
