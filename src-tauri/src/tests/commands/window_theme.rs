// On macOS, window theme APIs require main-thread usage; skip like other integration tests.
#[cfg(all(test, not(target_os = "macos")))]
mod tests {
    use tempfile::TempDir;
    use crate::commands::settings_commands::set_window_theme;

    fn build_test_app_with_window() -> (tauri::App, TempDir) {
        let td = TempDir::new().expect("tempdir");
        std::env::set_var("HOME", td.path());

        let mut app = tauri::Builder::default()
            .plugin(tauri_plugin_store::Builder::new().build())
            .build(tauri::generate_context!())
            .expect("failed to build test app");

        // Ensure a window exists for calling the command
        app.create_window(
            tauri::window::WindowBuilder::new(&app, "main", tauri::window::WindowUrl::default())
        ).expect("failed to create window");

        (app, td)
    }

    #[test]
    fn test_set_window_theme_commands() {
        let (app, _td) = build_test_app_with_window();
        let window = app.get_webview_window("main").expect("window exists");

        // Should succeed for all variants
        tauri::async_runtime::block_on(set_window_theme(window.clone(), "light".into())).expect("light ok");
        tauri::async_runtime::block_on(set_window_theme(window.clone(), "dark".into())).expect("dark ok");
        tauri::async_runtime::block_on(set_window_theme(window.clone(), "auto".into())).expect("auto ok");
    }
}

