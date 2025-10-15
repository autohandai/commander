// Integration tests covering persistence of AppSettings to the user-facing JSON file.
#[cfg(test)]
mod tests {
    use serde_json::Value;
    use serial_test::serial;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    use crate::commands::project_commands::load_projects_folder_internal;
    use crate::commands::settings_commands::{
        load_app_settings_internal, save_app_settings_internal,
    };
    use crate::models::AppSettings;

    fn build_test_app() -> (tauri::App<tauri::test::MockRuntime>, TempDir) {
        let td = TempDir::new().expect("tempdir");
        std::env::set_var("HOME", td.path());

        let builder =
            tauri::test::mock_builder().plugin(tauri_plugin_store::Builder::new().build());
        let ctx = tauri::test::mock_context(tauri::test::noop_assets());
        let app = builder.build(ctx).expect("failed to build test app");

        (app, td)
    }

    fn settings_file_path(home: &TempDir) -> PathBuf {
        home.path().join(".commander").join("settings.json")
    }

    fn read_settings_json(path: &PathBuf) -> Value {
        let content = fs::read_to_string(path).expect("read user settings");
        serde_json::from_str(&content).expect("parse user settings json")
    }

    fn build_app_for_home(home: &std::path::Path) -> tauri::App<tauri::test::MockRuntime> {
        std::env::set_var("HOME", home);
        let builder =
            tauri::test::mock_builder().plugin(tauri_plugin_store::Builder::new().build());
        let ctx = tauri::test::mock_context(tauri::test::noop_assets());
        builder.build(ctx).expect("failed to build test app")
    }

    #[test]
    #[serial]
    fn test_load_seeds_file_with_defaults() {
        let (app, home_td) = build_test_app();
        let handle = app.handle();
        let settings_path = settings_file_path(&home_td);

        assert!(
            !settings_path.exists(),
            "settings file should not pre-exist before load"
        );

        let loaded = tauri::async_runtime::block_on(load_app_settings_internal(handle.clone()))
            .expect("load");
        assert!(
            settings_path.exists(),
            "loading settings should create user file"
        );
        assert_eq!(loaded.show_console_output, true);

        let json = read_settings_json(&settings_path);
        assert!(
            json.get("app_settings").is_some(),
            "app_settings should be seeded on load"
        );
    }

    #[test]
    #[serial]
    fn test_settings_persist_across_app_instances() {
        let home = TempDir::new().expect("tempdir");

        let app1 = build_app_for_home(home.path());
        let handle1 = app1.handle();

        let mut settings = AppSettings::default();
        settings.show_console_output = false;
        settings.projects_folder = Some("/tmp/custom".to_string());
        settings.file_mentions_enabled = false;
        settings.ui_theme = "dark".to_string();
        settings.chat_send_shortcut = "enter".to_string();
        settings.show_welcome_recent_projects = false;
        settings.max_chat_history = 21;
        settings.default_cli_agent = "gemini".to_string();
        settings.code_settings.theme = "dracula".to_string();
        settings.code_settings.font_size = 18;
        settings.code_settings.auto_collapse_sidebar = true;

        tauri::async_runtime::block_on(save_app_settings_internal(
            handle1.clone(),
            settings.clone(),
        ))
        .expect("save");

        drop(app1);

        let app2 = build_app_for_home(home.path());
        let handle2 = app2.handle();

        let loaded = tauri::async_runtime::block_on(load_app_settings_internal(handle2.clone()))
            .expect("load");

        assert_eq!(loaded.show_console_output, false);
        assert_eq!(loaded.projects_folder, Some("/tmp/custom".to_string()));
        assert_eq!(loaded.file_mentions_enabled, false);
        assert_eq!(loaded.ui_theme, "dark".to_string());
        assert_eq!(loaded.chat_send_shortcut, "enter".to_string());
        assert_eq!(loaded.show_welcome_recent_projects, false);
        assert_eq!(loaded.max_chat_history, 21);
        assert_eq!(loaded.default_cli_agent, "gemini".to_string());
        assert_eq!(loaded.code_settings.theme, "dracula".to_string());
        assert_eq!(loaded.code_settings.font_size, 18);
        assert!(loaded.code_settings.auto_collapse_sidebar);
    }

    #[test]
    #[serial]
    fn test_full_settings_persist_to_user_file() {
        let (app, home_td) = build_test_app();
        let handle = app.handle();
        let settings_path = settings_file_path(&home_td);
        if let Some(parent) = settings_path.parent() {
            fs::create_dir_all(parent).expect("create settings directory");
        }
        fs::write(&settings_path, r#"{ "custom_flag": true }"#).expect("seed settings file");

        let mut settings = AppSettings::default();
        settings.show_console_output = false;
        settings.projects_folder = Some("/tmp/projects".to_string());
        settings.file_mentions_enabled = false;
        settings.ui_theme = "dark".to_string();
        settings.chat_send_shortcut = "enter".to_string();
        settings.show_welcome_recent_projects = false;
        settings.max_chat_history = 42;
        settings.default_cli_agent = "gemini".to_string();
        settings.code_settings.theme = "dracula".to_string();
        settings.code_settings.font_size = 18;
        settings.code_settings.auto_collapse_sidebar = true;

        tauri::async_runtime::block_on(save_app_settings_internal(
            handle.clone(),
            settings.clone(),
        ))
        .expect("save_app_settings should succeed");

        let json = read_settings_json(&settings_path);
        assert_eq!(
            json.get("custom_flag").and_then(|v| v.as_bool()),
            Some(true),
            "unknown keys should be preserved"
        );

        let app_settings = json
            .get("app_settings")
            .expect("app_settings key should exist")
            .clone();
        let from_file: AppSettings =
            serde_json::from_value(app_settings).expect("deserialize app_settings");

        assert_eq!(from_file.show_console_output, false);
        assert_eq!(from_file.projects_folder, Some("/tmp/projects".to_string()));
        assert_eq!(from_file.file_mentions_enabled, false);
        assert_eq!(from_file.ui_theme, "dark".to_string());
        assert_eq!(from_file.chat_send_shortcut, "enter".to_string());
        assert_eq!(from_file.show_welcome_recent_projects, false);
        assert_eq!(from_file.max_chat_history, 42);
        assert_eq!(from_file.default_cli_agent, "gemini".to_string());
        assert_eq!(from_file.code_settings.theme, "dracula".to_string());
        assert_eq!(from_file.code_settings.font_size, 18);
        assert!(from_file.code_settings.auto_collapse_sidebar);

        assert!(
            json.get("code").is_none(),
            "legacy code block should be removed after save"
        );
        assert!(
            json.get("general").is_none(),
            "legacy general block should be removed after save"
        );

        let raw = fs::read_to_string(&settings_path).expect("read settings file");
        assert!(raw.ends_with('\n'), "settings file should end with newline");
    }

    #[test]
    #[serial]
    fn test_loads_from_file_when_store_empty() {
        let (app, home_td) = build_test_app();
        let handle = app.handle();
        let settings_path = settings_file_path(&home_td);
        if let Some(parent) = settings_path.parent() {
            fs::create_dir_all(parent).expect("create settings directory");
        }

        let file_payload = serde_json::json!({
            "app_settings": {
                "show_console_output": false,
                "projects_folder": "/manual/path",
                "file_mentions_enabled": false,
                "ui_theme": "light",
                "chat_send_shortcut": "enter",
                "show_welcome_recent_projects": false,
                "max_chat_history": 7,
                "default_cli_agent": "codex",
                "code_settings": {
                    "theme": "monokai",
                    "font_size": 22,
                    "auto_collapse_sidebar": true
                }
            }
        });
        fs::write(
            &settings_path,
            serde_json::to_string_pretty(&file_payload).expect("serialize payload"),
        )
        .expect("write settings file");

        let loaded = tauri::async_runtime::block_on(load_app_settings_internal(handle.clone()))
            .expect("load");
        assert!(!loaded.show_console_output);
        assert_eq!(loaded.projects_folder, Some("/manual/path".to_string()));
        assert!(!loaded.file_mentions_enabled);
        assert_eq!(loaded.ui_theme, "light".to_string());
        assert_eq!(loaded.chat_send_shortcut, "enter".to_string());
        assert!(!loaded.show_welcome_recent_projects);
        assert_eq!(loaded.max_chat_history, 7);
        assert_eq!(loaded.default_cli_agent, "codex".to_string());
        assert_eq!(loaded.code_settings.theme, "monokai".to_string());
        assert_eq!(loaded.code_settings.font_size, 22);
        assert!(loaded.code_settings.auto_collapse_sidebar);
    }

    #[test]
    #[serial]
    fn test_legacy_schema_is_loaded_and_upgraded() {
        let (app, home_td) = build_test_app();
        let handle = app.handle();
        let settings_path = settings_file_path(&home_td);
        if let Some(parent) = settings_path.parent() {
            fs::create_dir_all(parent).expect("create settings directory");
        }

        let legacy = serde_json::json!({
            "general": {
                "show_recent_projects_welcome_screen": false
            },
            "code": {
                "auto_collapse_sidebar": true
            }
        });
        fs::write(
            &settings_path,
            serde_json::to_string_pretty(&legacy).expect("serialize legacy payload"),
        )
        .expect("write legacy settings");

        let loaded = tauri::async_runtime::block_on(load_app_settings_internal(handle.clone()))
            .expect("load");
        assert!(!loaded.show_welcome_recent_projects);
        assert!(loaded.code_settings.auto_collapse_sidebar);

        // Saving should upgrade the file with full app_settings while retaining legacy keys.
        tauri::async_runtime::block_on(save_app_settings_internal(handle.clone(), loaded.clone()))
            .expect("save");

        let json = read_settings_json(&settings_path);
        assert!(
            json.get("app_settings").is_some(),
            "app_settings should be present after upgrade"
        );
        assert!(
            json.get("general").is_none(),
            "legacy general block should be removed"
        );
        assert!(
            json.get("code").is_none(),
            "legacy code block should be removed"
        );
    }

    #[test]
    #[serial]
    fn test_invalid_json_falls_back_to_defaults() {
        let (app, home_td) = build_test_app();
        let handle = app.handle();
        let settings_path = settings_file_path(&home_td);
        if let Some(parent) = settings_path.parent() {
            fs::create_dir_all(parent).expect("create settings directory");
        }

        fs::write(&settings_path, "{not valid json").expect("write invalid settings");

        let loaded = tauri::async_runtime::block_on(load_app_settings_internal(handle.clone()))
            .expect("load");
        // Defaults ensure welcome projects is true and sidebar auto collapse is false.
        assert!(loaded.show_welcome_recent_projects);
        assert!(!loaded.code_settings.auto_collapse_sidebar);

        tauri::async_runtime::block_on(save_app_settings_internal(handle.clone(), loaded))
            .expect("save defaults");

        let content = fs::read_to_string(&settings_path).expect("read settings file");
        let json: Value = serde_json::from_str(&content).expect("json should be valid after save");
        assert!(json.get("app_settings").is_some());
    }

    #[test]
    #[serial]
    fn test_projects_folder_command_reflects_app_settings() {
        let home = TempDir::new().expect("tempdir");
        let app = build_app_for_home(home.path());
        let handle = app.handle();

        let mut settings = AppSettings::default();
        settings.projects_folder = Some("/tmp/projects".to_string());

        tauri::async_runtime::block_on(save_app_settings_internal(
            handle.clone(),
            settings.clone(),
        ))
        .expect("save");

        let stored = tauri::async_runtime::block_on(load_projects_folder_internal(handle.clone()))
            .expect("load projects folder");
        assert_eq!(stored, Some("/tmp/projects".to_string()));
    }

    #[test]
    #[serial]
    fn test_projects_folder_command_after_restart() {
        let home = TempDir::new().expect("tempdir");
        let app1 = build_app_for_home(home.path());
        let handle1 = app1.handle();

        let mut settings = AppSettings::default();
        settings.projects_folder = Some("/tmp/persisted".to_string());

        tauri::async_runtime::block_on(save_app_settings_internal(
            handle1.clone(),
            settings.clone(),
        ))
        .expect("save");

        drop(app1);

        let app2 = build_app_for_home(home.path());
        let handle2 = app2.handle();

        let stored = tauri::async_runtime::block_on(load_projects_folder_internal(handle2.clone()))
            .expect("load after restart");
        assert_eq!(stored, Some("/tmp/persisted".to_string()));
    }
}
