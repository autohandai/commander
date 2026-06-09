#[cfg(test)]
mod tests {
    use serde_json::Value;

    #[test]
    fn tauri_config_does_not_create_a_second_declarative_tray_icon() {
        let config: Value = serde_json::from_str(include_str!("../../../tauri.conf.json"))
            .expect("tauri config should be valid json");
        let app_config = config
            .get("app")
            .and_then(Value::as_object)
            .expect("tauri config should define app object");

        assert!(
            !app_config.contains_key("trayIcon"),
            "tray icon must be created only by create_tray in lib.rs"
        );
    }

    #[test]
    fn tauri_product_name_is_title_cased_for_macos_hover_labels() {
        let config: Value = serde_json::from_str(include_str!("../../../tauri.conf.json"))
            .expect("tauri config should be valid json");

        assert_eq!(
            config.get("productName").and_then(Value::as_str),
            Some("Commander"),
            "macOS hover/app labels should show Commander, not lowercase commander"
        );
    }

    #[test]
    fn programmatic_tray_uses_the_commander_default_window_icon() {
        let lib_source = include_str!("../../lib.rs");

        assert!(
            lib_source.contains("TrayIconBuilder::with_id(\"main\")"),
            "Commander should keep one named programmatic tray icon"
        );
        assert!(
            lib_source.contains(".icon(app.default_window_icon().expect(\"default window icon should be bundled\").clone())"),
            "programmatic tray must explicitly use the bundled Commander icon"
        );
    }

    #[test]
    fn tray_agent_status_rows_are_visible_and_green_when_available() {
        let lib_source = include_str!("../../lib.rs");

        assert!(
            lib_source.contains("let icon = if *available { \"🟢\" } else { \"○\" };"),
            "available tray agents should use a green visible indicator"
        );
        assert!(
            !lib_source.contains(".enabled(false)"),
            "agent status rows should not be disabled because macOS grays disabled menu text"
        );
    }
}
