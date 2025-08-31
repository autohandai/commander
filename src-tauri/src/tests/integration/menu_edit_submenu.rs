#[cfg(all(test, not(target_os = "macos")))]
mod tests {
    use serial_test::serial;

    fn build_test_app() -> tauri::App {
        tauri::Builder::default()
            .build(tauri::generate_context!())
            .expect("failed to build test app")
    }

    #[test]
    #[serial]
    fn test_menu_has_edit_with_copy_paste() {
        let app = build_test_app();

        // create_native_menu is defined at crate root; as a child module in tests we can access it.
        let menu = super::super::super::create_native_menu(&app)
            .expect("should create native menu");

        // Find the "Edit" submenu
        let items = menu.items().expect("list menu items");
        let mut found_edit = false;
        for item in items {
            if let tauri::menu::MenuItemKind::Submenu(sub) = item {
                let title = sub.text().expect("submenu title");
                if title == "Edit" {
                    found_edit = true;
                    // Should contain standard edit actions (undo, redo, cut, copy, paste, select all)
                    let sub_items = sub.items().expect("edit submenu items");
                    assert!(sub_items.len() >= 6, "Edit submenu should have standard items");
                }
            }
        }

        assert!(found_edit, "Edit submenu should be present in the app menu");
    }
}

