use crate::models::chat_history::*;
use crate::services::chat_history_service::{
    delete_chat_session as delete_session_impl, ensure_commander_directory,
    export_chat_history as export_impl, extract_file_mentions,
    get_chat_history_stats as get_stats_impl, group_messages_into_sessions,
    load_chat_sessions as load_sessions_impl, load_session_messages,
    migrate_legacy_chat_data as migrate_impl, save_chat_session as save_session_impl,
};

/// Save a chat session with its messages
#[tauri::command]
pub async fn save_chat_session(
    project_path: String,
    messages: Vec<EnhancedChatMessage>,
) -> Result<String, String> {
    if messages.is_empty() {
        return Err("Cannot save empty chat session".to_string());
    }

    // Group messages into sessions
    let sessions = group_messages_into_sessions(messages.clone()).await?;

    if sessions.is_empty() {
        return Err("Failed to create sessions from messages".to_string());
    }

    // Save each session (typically will be one session)
    let mut saved_session_ids = Vec::new();
    for session in sessions {
        let session_messages: Vec<EnhancedChatMessage> = messages
            .iter()
            .filter(|msg| {
                msg.agent == session.agent
                    && msg.timestamp >= session.start_time
                    && msg.timestamp <= session.end_time
            })
            .cloned()
            .collect();

        save_session_impl(&project_path, &session, &session_messages).await?;
        saved_session_ids.push(session.id.clone());
    }

    Ok(saved_session_ids.join(","))
}

/// Load chat sessions with optional filtering
#[tauri::command]
pub async fn load_chat_sessions(
    project_path: String,
    limit: Option<usize>,
    agent: Option<String>,
) -> Result<Vec<ChatSession>, String> {
    load_sessions_impl(&project_path, limit, agent).await
}

/// Get messages for a specific session
#[tauri::command]
pub async fn get_session_messages(
    project_path: String,
    session_id: String,
) -> Result<Vec<EnhancedChatMessage>, String> {
    load_session_messages(&project_path, &session_id).await
}

/// Delete a chat session
#[tauri::command]
pub async fn delete_chat_session(project_path: String, session_id: String) -> Result<(), String> {
    delete_session_impl(&project_path, &session_id).await
}

/// Get chat history statistics
#[tauri::command]
pub async fn get_chat_history_stats(project_path: String) -> Result<ChatHistoryStats, String> {
    get_stats_impl(&project_path).await
}

/// Export chat history in various formats
#[tauri::command]
pub async fn export_chat_history(
    project_path: String,
    format: ExportFormat,
    session_ids: Option<Vec<String>>,
    include_metadata: bool,
) -> Result<String, String> {
    let request = ExportRequest {
        format,
        sessions: session_ids,
        include_metadata,
        date_range: None,
    };

    export_impl(&project_path, request).await
}

/// Migrate legacy chat data to new format
#[tauri::command]
pub async fn migrate_legacy_chat_data(
    project_path: String,
    legacy_messages: Vec<LegacyChatMessage>,
) -> Result<(), String> {
    migrate_impl(&project_path, legacy_messages).await
}

/// Append a single message to an existing or new session
#[tauri::command]
pub async fn append_chat_message(
    project_path: String,
    role: String,
    content: String,
    agent: String,
    branch: Option<String>,
    working_dir: Option<String>,
) -> Result<String, String> {
    // Create enhanced message
    let session_id = uuid::Uuid::new_v4().to_string();
    let mut message = EnhancedChatMessage::new(&role, &content, &agent, &session_id);

    // Set metadata
    message.metadata.branch = branch;
    message.metadata.working_dir = working_dir;
    message.metadata.file_mentions = extract_file_mentions(&content);

    // Try to find an existing session to append to
    let recent_sessions = load_sessions_impl(&project_path, Some(1), Some(agent.clone())).await?;

    let session_to_use = if let Some(recent_session) = recent_sessions.first() {
        // Check if we should append to this session based on timing
        let time_gap_minutes = (message.timestamp - recent_session.end_time) / 60;
        if time_gap_minutes <= 5 && recent_session.agent == agent {
            // Update existing session
            message.metadata.session_id = recent_session.id.clone();

            // Load existing messages and append new one
            let mut existing_messages =
                load_session_messages(&project_path, &recent_session.id).await?;
            existing_messages.push(message.clone());

            // Create updated session
            let updated_sessions = group_messages_into_sessions(existing_messages.clone()).await?;
            if let Some(updated_session) = updated_sessions.first() {
                save_session_impl(&project_path, updated_session, &existing_messages).await?;
                updated_session.id.clone()
            } else {
                return Err("Failed to update existing session".to_string());
            }
        } else {
            // Create new session
            let new_sessions = group_messages_into_sessions(vec![message.clone()]).await?;
            if let Some(new_session) = new_sessions.first() {
                save_session_impl(&project_path, new_session, &[message.clone()]).await?;
                new_session.id.clone()
            } else {
                return Err("Failed to create new session".to_string());
            }
        }
    } else {
        // No existing sessions, create new one
        let new_sessions = group_messages_into_sessions(vec![message.clone()]).await?;
        if let Some(new_session) = new_sessions.first() {
            save_session_impl(&project_path, new_session, &[message.clone()]).await?;
            new_session.id.clone()
        } else {
            return Err("Failed to create new session".to_string());
        }
    };

    Ok(session_to_use)
}

/// Search chat history by content
#[tauri::command]
pub async fn search_chat_history(
    project_path: String,
    query: String,
    agent: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<ChatSession>, String> {
    let all_sessions = load_sessions_impl(&project_path, None, agent).await?;
    let query_lower = query.to_lowercase();

    let mut matching_sessions = Vec::new();

    for session in all_sessions {
        // Check if session summary matches
        if session.summary.to_lowercase().contains(&query_lower) {
            matching_sessions.push(session);
            continue;
        }

        // Check if any message in the session matches
        if let Ok(messages) = load_session_messages(&project_path, &session.id).await {
            let has_matching_message = messages
                .iter()
                .any(|msg| msg.content.to_lowercase().contains(&query_lower));

            if has_matching_message {
                matching_sessions.push(session);
            }
        }
    }

    // Apply limit
    if let Some(limit) = limit {
        matching_sessions.truncate(limit);
    }

    Ok(matching_sessions)
}

/// Clean up old sessions based on retention policy
#[tauri::command]
pub async fn cleanup_old_sessions(
    project_path: String,
    retention_days: u32,
) -> Result<usize, String> {
    let cutoff_timestamp = chrono::Utc::now().timestamp() - (retention_days as i64 * 24 * 60 * 60);
    let all_sessions = load_sessions_impl(&project_path, None, None).await?;

    let mut deleted_count = 0;

    for session in all_sessions {
        if session.end_time < cutoff_timestamp {
            delete_session_impl(&project_path, &session.id).await?;
            deleted_count += 1;
        }
    }

    Ok(deleted_count)
}

/// Validate project has valid chat history structure
#[tauri::command]
pub async fn validate_chat_history_structure(project_path: String) -> Result<bool, String> {
    // Try to ensure directory exists
    match ensure_commander_directory(&project_path).await {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

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

    fn create_test_message(role: &str, content: &str, agent: &str) -> EnhancedChatMessage {
        EnhancedChatMessage::new(role, content, agent, "test-session")
    }

    #[tokio::test]
    async fn test_save_and_load_session() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        let messages = vec![
            create_test_message("user", "Hello", "claude"),
            create_test_message("assistant", "Hi there!", "claude"),
        ];

        // Save session
        let result = save_chat_session(project_path.clone(), messages.clone()).await;
        assert!(result.is_ok(), "Should save session successfully");

        let session_id = result.unwrap();
        assert!(!session_id.is_empty(), "Should return session ID");

        // Load sessions
        let sessions = load_chat_sessions(project_path.clone(), None, None)
            .await
            .unwrap();
        assert_eq!(sessions.len(), 1, "Should have one session");
        assert_eq!(sessions[0].agent, "claude");
    }

    #[tokio::test]
    async fn test_append_message_to_existing_session() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Create messages with specific timestamps to ensure same session
        let base_timestamp = chrono::Utc::now().timestamp();

        let mut message1 =
            EnhancedChatMessage::new("user", "First message", "claude", "session-test");
        message1.timestamp = base_timestamp;

        let mut message2 =
            EnhancedChatMessage::new("assistant", "First response", "claude", "session-test");
        message2.timestamp = base_timestamp + 60; // 1 minute later

        // Save as session
        let session_id = save_chat_session(
            project_path.clone(),
            vec![message1.clone(), message2.clone()],
        )
        .await
        .unwrap();

        // Load messages
        let messages = get_session_messages(project_path, session_id)
            .await
            .unwrap();
        assert_eq!(messages.len(), 2, "Should have two messages in session");
        assert_eq!(messages[0].content, "First message");
        assert_eq!(messages[1].content, "First response");
    }

    #[tokio::test]
    async fn test_search_functionality() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Create session with searchable content
        let messages = vec![
            create_test_message("user", "Help me with Rust programming", "claude"),
            create_test_message("assistant", "I'll help with Rust!", "claude"),
        ];

        save_chat_session(project_path.clone(), messages)
            .await
            .unwrap();

        // Search for "Rust"
        let results = search_chat_history(project_path.clone(), "Rust".to_string(), None, None)
            .await
            .unwrap();

        assert_eq!(results.len(), 1, "Should find one matching session");
        assert!(results[0].summary.contains("Rust") || results[0].summary.contains("programming"));
    }

    #[tokio::test]
    async fn test_delete_session() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        let messages = vec![create_test_message("user", "To be deleted", "claude")];

        let session_id = save_chat_session(project_path.clone(), messages)
            .await
            .unwrap();

        // Verify it exists
        let sessions_before = load_chat_sessions(project_path.clone(), None, None)
            .await
            .unwrap();
        assert_eq!(sessions_before.len(), 1);

        // Delete it
        delete_chat_session(project_path.clone(), session_id)
            .await
            .unwrap();

        // Verify it's gone
        let sessions_after = load_chat_sessions(project_path, None, None).await.unwrap();
        assert_eq!(sessions_after.len(), 0);
    }

    #[tokio::test]
    async fn test_export_functionality() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        let messages = vec![create_test_message("user", "Export test", "claude")];

        save_chat_session(project_path.clone(), messages)
            .await
            .unwrap();

        // Export as JSON
        let exported = export_chat_history(project_path, ExportFormat::Json, None, true)
            .await
            .unwrap();

        assert!(
            exported.contains("Export test"),
            "Should contain message content"
        );
        assert!(exported.contains("claude"), "Should contain agent name");
    }
}
