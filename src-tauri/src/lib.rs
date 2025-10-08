use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
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
            create_workspace_worktree,
            remove_workspace_worktree,
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
            get_chat_history_stats,
            export_chat_history,
            migrate_legacy_chat_data,
            append_chat_message,
            search_chat_history,
            cleanup_old_sessions,
            validate_chat_history_structure,
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
            open_file_in_editor
        ])
        .setup(|app| {
            // Handle command line arguments for opening projects
            let args: Vec<String> = std::env::args().collect();
            println!("🔍 Command line args received: {:?}", args);
            if args.len() > 1 {
                let path_arg = args[1].clone(); // Clone the string to avoid borrowing issues
                let app_handle = app.handle().clone();

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

            Ok(())
        });

    // Only run the app loop in non-test builds to avoid duplicate context symbols
    #[cfg(not(test))]
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
