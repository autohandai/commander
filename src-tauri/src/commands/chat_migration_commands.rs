use crate::commands::git_commands::{load_project_chat, save_project_chat, ChatMessage};
use crate::models::chat_history::*;
use crate::services::chat_history_service::*;

/// Migrate existing project chat data to new enhanced format
#[tauri::command]
pub async fn migrate_project_chat_to_enhanced(
    app: tauri::AppHandle,
    project_path: String,
) -> Result<String, String> {
    // Load existing chat data
    let existing_messages = load_project_chat(app.clone(), project_path.clone()).await?;

    if existing_messages.is_empty() {
        return Ok("No existing chat data to migrate".to_string());
    }

    // Convert to legacy format for migration
    let legacy_messages: Vec<LegacyChatMessage> = existing_messages
        .into_iter()
        .map(|msg| LegacyChatMessage {
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            agent: msg.agent,
        })
        .collect();

    // Migrate to enhanced format
    migrate_legacy_chat_data(&project_path, legacy_messages).await?;

    // Get migration statistics
    let sessions = load_chat_sessions(&project_path, None, None).await?;
    let total_messages: usize = sessions.iter().map(|s| s.message_count).sum();

    Ok(format!(
        "Migration completed: {} sessions created with {} total messages",
        sessions.len(),
        total_messages
    ))
}

/// Check if project needs migration
#[tauri::command]
pub async fn check_migration_needed(project_path: String) -> Result<bool, String> {
    // Check if enhanced chat history exists
    let enhanced_sessions = load_chat_sessions(&project_path, Some(1), None).await?;

    // If no enhanced sessions exist, migration might be needed
    Ok(enhanced_sessions.is_empty())
}

/// Create a backup of existing chat data before migration
#[tauri::command]
pub async fn backup_existing_chat_data(
    app: tauri::AppHandle,
    project_path: String,
) -> Result<String, String> {
    let existing_messages = load_project_chat(app, project_path.clone()).await?;

    if existing_messages.is_empty() {
        return Ok("No chat data to backup".to_string());
    }

    // Create backup in .commander directory
    let chat_dir = ensure_commander_directory(&project_path).await?;
    let backup_file = chat_dir.join("chat_backup.json");

    let backup_data = serde_json::json!({
        "backup_date": chrono::Utc::now().to_rfc3339(),
        "original_messages": existing_messages,
        "version": "legacy"
    });

    let backup_json = serde_json::to_string_pretty(&backup_data)
        .map_err(|e| format!("Failed to serialize backup data: {}", e))?;

    tokio::fs::write(backup_file, backup_json)
        .await
        .map_err(|e| format!("Failed to write backup file: {}", e))?;

    Ok(format!(
        "Backup created with {} messages",
        existing_messages.len()
    ))
}

/// Automatically migrate chat data when needed
#[tauri::command]
pub async fn auto_migrate_chat_data(
    app: tauri::AppHandle,
    project_path: String,
) -> Result<Option<String>, String> {
    // Check if migration is needed
    let needs_migration = check_migration_needed(project_path.clone()).await?;

    if !needs_migration {
        return Ok(None);
    }

    // Check if there's existing data to migrate
    let existing_messages = load_project_chat(app.clone(), project_path.clone()).await?;

    if existing_messages.is_empty() {
        return Ok(None);
    }

    // Create backup first
    let backup_result = backup_existing_chat_data(app.clone(), project_path.clone()).await?;

    // Perform migration
    let migration_result = migrate_project_chat_to_enhanced(app, project_path).await?;

    Ok(Some(format!("{}\n{}", backup_result, migration_result)))
}

/// Bridge function: Save enhanced message to both old and new formats
#[tauri::command]
pub async fn save_enhanced_chat_message(
    app: tauri::AppHandle,
    project_path: String,
    role: String,
    content: String,
    agent: String,
    branch: Option<String>,
    working_dir: Option<String>,
) -> Result<String, String> {
    // Save to enhanced format
    let session_id = append_chat_message(
        project_path.clone(),
        role.clone(),
        content.clone(),
        agent.clone(),
        branch,
        working_dir,
    )
    .await?;

    // Also save to legacy format for backward compatibility
    let legacy_message = ChatMessage {
        role,
        content,
        timestamp: chrono::Utc::now().timestamp(),
        agent: Some(agent),
        conversation_id: None,
        status: None,
        steps: None,
    };

    // Load existing legacy messages and append
    let mut existing_legacy = load_project_chat(app.clone(), project_path.clone()).await?;
    existing_legacy.push(legacy_message);
    save_project_chat(app, project_path, existing_legacy).await?;

    Ok(session_id)
}

/// Get unified chat history combining both formats
#[tauri::command]
pub async fn get_unified_chat_history(
    app: tauri::AppHandle,
    project_path: String,
    limit: Option<usize>,
) -> Result<Vec<ChatSession>, String> {
    // Try enhanced format first
    let enhanced_sessions = load_chat_sessions(&project_path, limit, None).await?;

    if !enhanced_sessions.is_empty() {
        return Ok(enhanced_sessions);
    }

    // Fall back to legacy format with auto-migration
    let legacy_messages = load_project_chat(app, project_path.clone()).await?;

    if legacy_messages.is_empty() {
        return Ok(Vec::new());
    }

    // Convert legacy to enhanced for display
    let legacy_converted: Vec<LegacyChatMessage> = legacy_messages
        .into_iter()
        .map(|msg| LegacyChatMessage {
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp,
            agent: msg.agent,
        })
        .collect();

    // Group legacy messages into sessions for display
    let session_id = uuid::Uuid::new_v4().to_string();
    let enhanced_messages: Vec<EnhancedChatMessage> = legacy_converted
        .into_iter()
        .map(|msg| EnhancedChatMessage::from_legacy(msg, &session_id))
        .collect();

    let sessions = group_messages_into_sessions(enhanced_messages).await?;

    // Apply limit if specified
    if let Some(limit) = limit {
        Ok(sessions.into_iter().take(limit).collect())
    } else {
        Ok(sessions)
    }
}

// Re-export the append_chat_message function from chat_history_commands
use crate::commands::chat_history_commands::append_chat_message;

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_project_dir() -> TempDir {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        // Initialize as git repo
        let git_dir = temp_dir.path().join(".git");
        std::fs::create_dir_all(&git_dir).expect("Failed to create .git directory");

        // Create a basic git config to mark as valid repo
        let config_file = git_dir.join("config");
        std::fs::write(config_file, "[core]\nrepositoryformatversion = 0\n")
            .expect("Failed to write git config");

        temp_dir
    }

    fn create_mock_app() -> tauri::AppHandle {
        // This is a simplified mock - in real tests you'd need proper Tauri app setup
        unimplemented!("Mock app creation not implemented for migration tests")
    }

    #[tokio::test]
    async fn test_migration_check() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Should need migration for empty project
        let needs_migration = check_migration_needed(project_path).await.unwrap();
        assert!(needs_migration, "Empty project should need migration");
    }

    #[tokio::test]
    async fn test_backup_creation() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Note: This test would need a proper app handle to work
        // For now, just test the path creation logic
        let chat_dir = ensure_commander_directory(&project_path).await.unwrap();
        let backup_file = chat_dir.join("chat_backup.json");

        assert!(
            !backup_file.exists(),
            "Backup file should not exist initially"
        );
    }
}
