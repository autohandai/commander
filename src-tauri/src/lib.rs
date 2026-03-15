// Suppress false-positive dead_code/unused_imports warnings in test builds.
// Tauri command functions are registered via invoke_handler! at runtime and
// appear "unused" to the compiler during test compilation.
#![cfg_attr(test, allow(dead_code, unused_imports))]

use std::sync::Arc;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

// Import all modules
mod commands;
mod error;
mod models;
mod services;

use commands::*;

// Test modules (only compiled during testing)
#[cfg(test)]
mod tests;

// Utility commands
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn start_drag(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

// Helper function to create the native menu structure
fn create_native_menu(app: &tauri::App) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    use tauri::menu::PredefinedMenuItem;
    // Create standard Edit submenu so Cmd/Ctrl+C/V work in inputs
    let edit_submenu = SubmenuBuilder::new(app, "Edit")
        .item(&PredefinedMenuItem::undo(app, None)?)
        .item(&PredefinedMenuItem::redo(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    // Create the app menu (Commander) - this will be the first menu on macOS
    let app_submenu = SubmenuBuilder::new(app, "Commander")
        .item(&MenuItemBuilder::with_id("about", "About Commander").build(app)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("preferences", "Preferences...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Quit Commander"))?)
        .build()?;

    // Create Projects submenu as a separate menu
    let projects_submenu = SubmenuBuilder::new(app, "Projects")
        .item(
            &MenuItemBuilder::with_id("new_project", "New Project")
                .accelerator("CmdOrCtrl+N")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("clone_project", "Clone Project")
                .accelerator("CmdOrCtrl+Shift+N")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open_project", "Open Project...")
                .accelerator("CmdOrCtrl+O")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("close_project", "Close Project")
                .accelerator("CmdOrCtrl+W")
                .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id("delete_project", "Delete Current Project").build(app)?)
        .build()?;

    // Create Help submenu
    let help_submenu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("documentation", "Documentation").build(app)?)
        .item(
            &MenuItemBuilder::with_id("keyboard_shortcuts_help", "Keyboard Shortcuts")
                .build(app)?,
        )
        .separator()
        .item(&MenuItemBuilder::with_id("report_issue", "Report Issue").build(app)?)
        .build()?;

    // Create main menu - order matters on macOS
    let menu = MenuBuilder::new(app)
        .item(&app_submenu) // Commander menu (first)
        .item(&projects_submenu) // Projects menu (second)
        .item(&edit_submenu) // Edit menu (third) enables keyboard copy/paste
        .item(&help_submenu) // Help menu (fourth)
        .build()?;

    Ok(menu)
}

/// Build the tray context menu with agent statuses.
/// `agents` is a list of (display_name, available) tuples.
pub fn build_tray_menu(
    app: &tauri::AppHandle,
    agents: &[(String, bool)],
) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    let show_item = MenuItemBuilder::with_id("show_commander", "Show Commander").build(app)?;
    let settings_item = MenuItemBuilder::with_id("tray_preferences", "Settings...").build(app)?;
    let updates_item =
        MenuItemBuilder::with_id("check_updates", "Check for Updates").build(app)?;
    let quit_item = MenuItemBuilder::with_id("tray_quit", "Quit Commander").build(app)?;

    let mut builder = MenuBuilder::new(app)
        .item(&show_item)
        .item(&settings_item)
        .separator();

    // Add agent status items (display-only)
    for (name, available) in agents {
        let icon = if *available { "\u{25CF}" } else { "\u{25CB}" };
        let status_text = if *available { "available" } else { "not found" };
        let label = format!("{} {}  {}", icon, name, status_text);
        let item = MenuItemBuilder::with_id(format!("agent_{}", name.to_lowercase()), &label)
            .enabled(false)
            .build(app)?;
        builder = builder.item(&item);
    }

    builder = builder
        .separator()
        .item(&updates_item)
        .separator()
        .item(&quit_item);

    builder.build()
}

/// Create the system tray icon with initial menu.
fn create_tray(app: &tauri::App) -> Result<(), tauri::Error> {
    let handle = app.handle();

    // Initial agent list (will be updated by monitor_ai_agents)
    let initial_agents: Vec<(String, bool)> = vec![
        ("Claude".to_string(), false),
        ("Codex".to_string(), false),
        ("Gemini".to_string(), false),
        ("Ollama".to_string(), false),
    ];

    let menu = build_tray_menu(handle, &initial_agents)?;

    let _tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("Commander")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show_commander" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "tray_preferences" => {
                let _ = app.emit("tray://open-settings", ());
            }
            "check_updates" => {
                let _ = app.emit("tray://check-updates", ());
            }
            "tray_quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[cfg(not(test))]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            start_drag,
            execute_cli_command,
            execute_persistent_cli_command,
            execute_claude_command,
            execute_codex_command,
            execute_gemini_command,
            execute_ollama_command,
            execute_test_command,
            get_active_sessions,
            terminate_session,
            terminate_all_sessions,
            send_quit_command_to_session,
            cleanup_sessions,
            validate_git_repository_url,
            clone_repository,
            get_user_home_directory,
            get_default_projects_folder,
            ensure_directory_exists,
            save_projects_folder,
            select_projects_folder,
            load_projects_folder,
            save_app_settings,
            load_app_settings,
            get_show_recent_projects_setting,
            set_show_recent_projects_setting,
            set_window_theme,
            get_code_auto_collapse_sidebar_setting,
            set_code_auto_collapse_sidebar_setting,
            fetch_openrouter_models,
            fetch_openai_models,
            check_ollama_installation,
            fetch_ollama_models,
            open_ollama_website,
            save_llm_settings,
            load_llm_settings,
            get_default_llm_settings,
            fetch_claude_models,
            fetch_codex_models,
            fetch_gemini_models,
            fetch_agent_models,
            check_ai_agents,
            monitor_ai_agents,
            detect_cli_agents,
            generate_plan,
            load_prompts,
            save_prompts,
            get_default_prompts,
            update_prompt,
            delete_prompt,
            create_prompt_category,
            save_agent_settings,
            load_agent_settings,
            save_all_agent_settings,
            load_all_agent_settings,
            list_recent_projects,
            add_project_to_recent,
            refresh_recent_projects,
            clear_recent_projects,
            open_project_directory,
            get_available_project_applications,
            open_project_with_application,
            delete_project,
            open_existing_project,
            check_project_name_conflict,
            create_new_project_with_git,
            load_all_sub_agents,
            load_sub_agents_for_cli,
            load_sub_agents_grouped,
            save_sub_agent,
            create_sub_agent,
            delete_sub_agent,
            get_git_global_config,
            get_git_local_config,
            get_git_aliases,
            get_git_branches,
            get_git_worktree_enabled,
            get_git_worktree_preference,
            set_git_worktree_enabled,
            get_git_worktrees,
            get_project_git_worktrees,
            create_workspace_worktree,
            remove_workspace_worktree,
            switch_project_git_branch,
            create_project_git_branch,
            get_git_log,
            diff_workspace_vs_main,
            merge_workspace_to_main,
            get_git_commit_dag,
            get_commit_diff_files,
            get_commit_diff_text,
            get_file_at_commit,
            load_project_chat,
            save_project_chat,
            append_project_chat_message,
            save_chat_session,
            load_chat_sessions,
            get_session_messages,
            delete_chat_session,
            archive_chat_session,
            unarchive_chat_session,
            fork_chat_session,
            rename_chat_session,
            update_session_summary,
            get_chat_history_stats,
            get_dashboard_stats,
            export_chat_history,
            migrate_legacy_chat_data,
            append_chat_message,
            search_chat_history,
            cleanup_old_sessions,
            validate_chat_history_structure,
            load_unified_chat_sessions,
            load_indexed_session_messages,
            migrate_project_chat_to_enhanced,
            check_migration_needed,
            backup_existing_chat_data,
            auto_migrate_chat_data,
            save_enhanced_chat_message,
            get_unified_chat_history,
            diff_workspace_file,
            get_current_working_directory,
            set_current_working_directory,
            list_files_in_directory,
            search_files_by_name,
            get_file_info,
            read_file_content,
            write_file_content,
            create_default_agents_docs,
            menu_new_project,
            menu_clone_project,
            menu_open_project,
            menu_close_project,
            menu_delete_project,
            validate_git_repository,
            select_git_project_folder,
            open_project_from_path,
            get_cli_project_path,
            clear_cli_project_path,
            open_file_in_editor,
            store_auth_token,
            get_auth_token,
            get_auth_user,
            clear_auth_token,
            get_autohand_config,
            save_autohand_config,
            get_autohand_hooks,
            save_autohand_hook,
            delete_autohand_hook,
            toggle_autohand_hook,
            get_autohand_mcp_servers,
            save_autohand_mcp_server,
            delete_autohand_mcp_server,
            respond_autohand_permission,
            execute_autohand_command,
            terminate_autohand_session,
            get_autohand_state,
            get_indexer_status,
            trigger_reindex,
            sync_autohand_docs,
            search_autohand_docs,
            get_autohand_doc,
            get_autohand_docs_status,
            clear_autohand_docs_cache
        ])
        .setup(|app| {
            // Handle command line arguments for opening projects
            let args: Vec<String> = std::env::args().collect();
            println!("🔍 Command line args received: {:?}", args);
            if args.len() > 1 {
                let path_arg = args[1].clone(); // Clone the string to avoid borrowing issues

                // Spawn async task to handle project opening
                tauri::async_runtime::spawn(async move {
                    // Wait longer for frontend to fully initialize and set up event listeners
                    println!("⏳ Waiting for frontend to initialize...");
                    tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;

                    println!("🚀 Processing CLI project path: {}", path_arg);

                    // Resolve and store the project path for frontend to pick up
                    let absolute_path = if std::path::Path::new(&path_arg).is_absolute() {
                        std::path::PathBuf::from(&path_arg)
                    } else {
                        std::env::current_dir().unwrap_or_default().join(&path_arg)
                    };

                    let path_str = absolute_path.to_string_lossy().to_string();

                    if let Some(git_root) =
                        crate::services::git_service::resolve_git_project_path(&path_str)
                    {
                        println!("✅ CLI git root found: {}", git_root);
                        commands::git_commands::set_cli_project_path(git_root);
                    } else {
                        println!("❌ CLI path '{}' is not a git repository", path_arg);
                    }
                });
            }
            use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

            // Create and set the native menu
            println!("🍎 Creating native menu...");
            let menu = create_native_menu(app)?;
            app.set_menu(menu.clone())?;
            println!("✅ Native menu created and set successfully!");

            // Create system tray icon
            println!("🔧 Creating system tray icon...");
            create_tray(app)?;
            println!("✅ System tray icon created successfully!");

            // Handle menu events
            app.on_menu_event({
                let app_handle = app.handle().clone();
                move |_app, event| {
                    let app_clone = app_handle.clone();
                    tauri::async_runtime::spawn(async move {
                        println!("🎯 Menu event triggered: {}", event.id().as_ref());
                        match event.id().as_ref() {
                            // Projects menu items
                            "new_project" => {
                                println!("📝 Creating new project via menu...");
                                let _ = menu_new_project(app_clone).await;
                            }
                            "clone_project" => {
                                println!("🌿 Cloning project via menu...");
                                let _ = menu_clone_project(app_clone).await;
                            }
                            "open_project" => {
                                println!("📂 Opening project via menu...");
                                let _ = menu_open_project(app_clone).await;
                            }
                            "close_project" => {
                                println!("❌ Closing project via menu...");
                                let _ = menu_close_project(app_clone).await;
                            }
                            "delete_project" => {
                                println!("🗑️ Deleting project via menu...");
                                let _ = menu_delete_project(app_clone).await;
                            }
                            // Settings menu items
                            "preferences" => {
                                println!("⚙️ Opening preferences via menu...");
                                app_clone.emit("menu://open-settings", ()).unwrap();
                            }
                            "keyboard_shortcuts" => {
                                println!("⌨️ Opening keyboard shortcuts via menu...");
                                app_clone.emit("menu://open-shortcuts", ()).unwrap();
                            }
                            // Help menu items
                            "about" => {
                                println!("ℹ️ Opening about dialog via menu...");
                                app_clone.emit("menu://open-about", ()).unwrap();
                            }
                            "documentation" => {
                                println!("📚 Opening documentation via menu...");
                                app_clone.emit("menu://open-docs", ()).unwrap();
                            }
                            "keyboard_shortcuts_help" => {
                                println!("⌨️ Opening keyboard shortcuts help via menu...");
                                app_clone.emit("menu://open-shortcuts", ()).unwrap();
                            }
                            "report_issue" => {
                                println!("🐛 Opening issue reporter via menu...");
                                app_clone.emit("menu://report-issue", ()).unwrap();
                            }
                            _ => {
                                println!("Unhandled menu event: {:?}", event.id());
                            }
                        }
                    });
                }
            });

            // Start monitoring AI agents on app startup
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = monitor_ai_agents(app_handle).await;
            });

            // Start session cleanup task
            tauri::async_runtime::spawn(async move {
                loop {
                    let _ = cleanup_cli_sessions().await;
                    // Cleanup every 5 minutes
                    tokio::time::sleep(tokio::time::Duration::from_secs(300)).await;
                }
            });

            // Initialize SQLite indexer database
            let app_data_dir = app.path().app_data_dir().map_err(|e| {
                Box::new(std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
                    as Box<dyn std::error::Error>
            })?;
            let db_path = app_data_dir.join("commander_index.db");
            let index_db = Arc::new(
                services::indexer::db::IndexDb::open(&db_path).map_err(|e| {
                    Box::new(std::io::Error::new(std::io::ErrorKind::Other, e))
                        as Box<dyn std::error::Error>
                })?,
            );
            app.manage(index_db.clone());

            // Spawn background indexer loop
            let indexer_app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                services::indexer::indexer_service::run_indexer_loop(index_db, indexer_app_handle).await;
            });

            // Register Cmd+, shortcut for Settings on macOS
            let shortcut_manager = app.global_shortcut();
            let settings_shortcut = Shortcut::new(
                Some(tauri_plugin_global_shortcut::Modifiers::SUPER),
                tauri_plugin_global_shortcut::Code::Comma,
            );

            shortcut_manager.on_shortcut(settings_shortcut, move |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    // Emit an event to the frontend to open settings
                    app.emit("shortcut://open-settings", ()).unwrap();
                }
            })?;

            // Register Cmd+Shift+P shortcut for Chat on macOS
            let chat_shortcut = Shortcut::new(
                Some(
                    tauri_plugin_global_shortcut::Modifiers::SUPER
                        | tauri_plugin_global_shortcut::Modifiers::SHIFT,
                ),
                tauri_plugin_global_shortcut::Code::KeyP,
            );

            shortcut_manager.on_shortcut(chat_shortcut, move |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    // Emit an event to the frontend to toggle chat
                    app.emit("shortcut://toggle-chat", ()).unwrap();
                }
            })?;

            // Register Cmd+Shift+H shortcut for Chat History panel
            let history_shortcut = Shortcut::new(
                Some(
                    tauri_plugin_global_shortcut::Modifiers::SUPER
                        | tauri_plugin_global_shortcut::Modifiers::SHIFT,
                ),
                tauri_plugin_global_shortcut::Code::KeyH,
            );

            shortcut_manager.on_shortcut(history_shortcut, move |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    app.emit("shortcut://toggle-chat-history", ()).ok();
                }
            })?;

            // Register Cmd+Shift+C shortcut for Copy Path
            let copy_path_shortcut = Shortcut::new(
                Some(
                    tauri_plugin_global_shortcut::Modifiers::SUPER
                        | tauri_plugin_global_shortcut::Modifiers::SHIFT,
                ),
                tauri_plugin_global_shortcut::Code::KeyC,
            );

            shortcut_manager.on_shortcut(copy_path_shortcut, move |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    app.emit("shortcut://copy-project-path", ()).ok();
                }
            })?;

            Ok(())
        });

    // Run the app loop
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// In test builds, provide a no-op run() to avoid unused builder warnings
#[cfg(test)]
pub fn run() {}
