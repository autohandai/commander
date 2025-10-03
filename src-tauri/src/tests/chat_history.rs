#[cfg(test)]
mod tests {
    use crate::models::chat_history::*;
    use crate::services::chat_history_service::{
        delete_chat_session, ensure_commander_directory, extract_file_mentions,
        group_messages_into_sessions, load_chat_sessions, load_session_messages,
        migrate_legacy_chat_data, save_chat_session,
    };
    use chrono::Utc;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn create_test_project_dir() -> TempDir {
        let temp_dir = TempDir::new().expect("Failed to create temp directory");
        // Initialize as git repo
        let git_dir = temp_dir.path().join(".git");
        fs::create_dir_all(&git_dir).expect("Failed to create .git directory");

        // Create a basic git config to mark as valid repo
        let config_file = git_dir.join("config");
        fs::write(config_file, "[core]\nrepositoryformatversion = 0\n")
            .expect("Failed to write git config");

        temp_dir
    }

    fn create_test_message(
        role: &str,
        content: &str,
        agent: &str,
        timestamp_offset: i64,
    ) -> EnhancedChatMessage {
        let base_time = Utc::now().timestamp() - 3600; // 1 hour ago as base
        EnhancedChatMessage {
            id: uuid::Uuid::new_v4().to_string(),
            role: role.to_string(),
            content: content.to_string(),
            timestamp: base_time + timestamp_offset,
            agent: agent.to_string(),
            metadata: ChatMessageMetadata {
                branch: Some("main".to_string()),
                working_dir: None,
                file_mentions: vec!["src/main.rs".to_string()],
                session_id: "test-session".to_string(),
            },
        }
    }

    #[tokio::test]
    async fn test_create_commander_directory() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        let result = ensure_commander_directory(&project_path).await;
        assert!(
            result.is_ok(),
            "Should create .commander directory successfully"
        );

        let commander_dir = temp_dir.path().join(".commander").join("chat_history");
        assert!(
            commander_dir.exists(),
            ".commander/chat_history directory should exist"
        );
        assert!(
            commander_dir.is_dir(),
            ".commander/chat_history should be a directory"
        );
    }

    #[tokio::test]
    async fn test_session_grouping_by_time_gap() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Create messages with different time gaps
        let messages = vec![
            create_test_message("user", "First message", "claude", 0),
            create_test_message("assistant", "First response", "claude", 60), // 1 min later
            create_test_message("user", "Second message", "claude", 120),     // 2 min later
            // 10 minute gap - should create new session
            create_test_message("user", "New session message", "claude", 720), // 12 min later
            create_test_message("assistant", "New session response", "claude", 780),
        ];

        let sessions = group_messages_into_sessions(messages).await.unwrap();
        assert_eq!(
            sessions.len(),
            2,
            "Should create 2 sessions due to time gap"
        );

        // First session should have 3 messages
        assert_eq!(sessions[0].message_count, 3);
        assert_eq!(sessions[0].agent, "claude");

        // Second session should have 2 messages
        assert_eq!(sessions[1].message_count, 2);
        assert_eq!(sessions[1].agent, "claude");
    }

    #[tokio::test]
    async fn test_agent_specific_session_grouping() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Create messages with different agents but close timing
        let messages = vec![
            create_test_message("user", "Claude message", "claude", 0),
            create_test_message("assistant", "Claude response", "claude", 60),
            create_test_message("user", "Codex message", "codex", 120), // Different agent
            create_test_message("assistant", "Codex response", "codex", 180),
        ];

        let sessions = group_messages_into_sessions(messages).await.unwrap();
        assert_eq!(
            sessions.len(),
            2,
            "Should create 2 sessions for different agents"
        );

        // Sessions should be for different agents
        let claude_session = sessions.iter().find(|s| s.agent == "claude").unwrap();
        let codex_session = sessions.iter().find(|s| s.agent == "codex").unwrap();

        assert_eq!(claude_session.message_count, 2);
        assert_eq!(codex_session.message_count, 2);
    }

    #[tokio::test]
    async fn test_save_and_load_chat_session() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        let messages = vec![
            create_test_message("user", "Test message", "claude", 0),
            create_test_message("assistant", "Test response", "claude", 60),
        ];

        let sessions = group_messages_into_sessions(messages.clone())
            .await
            .unwrap();
        let session = &sessions[0];

        // Save the session
        let result = save_chat_session(&project_path, session, &messages).await;
        assert!(result.is_ok(), "Should save chat session successfully");

        // Load the session back
        let loaded_messages = load_session_messages(&project_path, &session.id).await;
        assert!(
            loaded_messages.is_ok(),
            "Should load session messages successfully"
        );

        let loaded = loaded_messages.unwrap();
        assert_eq!(loaded.len(), 2, "Should load correct number of messages");
        assert_eq!(loaded[0].content, "Test message");
        assert_eq!(loaded[1].content, "Test response");
    }

    #[tokio::test]
    async fn test_sessions_index_management() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        let messages1 = vec![
            create_test_message("user", "Session 1", "claude", 0),
            create_test_message("assistant", "Response 1", "claude", 60),
        ];

        let messages2 = vec![
            create_test_message("user", "Session 2", "codex", 600), // 10 min later
            create_test_message("assistant", "Response 2", "codex", 660),
        ];

        // Save first session
        let sessions1 = group_messages_into_sessions(messages1.clone())
            .await
            .unwrap();
        save_chat_session(&project_path, &sessions1[0], &messages1)
            .await
            .unwrap();

        // Save second session
        let sessions2 = group_messages_into_sessions(messages2.clone())
            .await
            .unwrap();
        save_chat_session(&project_path, &sessions2[0], &messages2)
            .await
            .unwrap();

        // Load sessions index
        let sessions_list = load_chat_sessions(&project_path, None, None).await;
        assert!(sessions_list.is_ok(), "Should load sessions successfully");

        let loaded_sessions = sessions_list.unwrap();
        assert_eq!(loaded_sessions.len(), 2, "Should have 2 sessions in index");

        // Check sessions are ordered by start time (newest first)
        assert!(loaded_sessions[0].start_time >= loaded_sessions[1].start_time);
    }

    #[tokio::test]
    async fn test_agent_filtering() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Create sessions for different agents
        let claude_messages = vec![create_test_message("user", "Claude message", "claude", 0)];

        let codex_messages = vec![create_test_message("user", "Codex message", "codex", 600)];

        // Save sessions
        let claude_sessions = group_messages_into_sessions(claude_messages.clone())
            .await
            .unwrap();
        save_chat_session(&project_path, &claude_sessions[0], &claude_messages)
            .await
            .unwrap();

        let codex_sessions = group_messages_into_sessions(codex_messages.clone())
            .await
            .unwrap();
        save_chat_session(&project_path, &codex_sessions[0], &codex_messages)
            .await
            .unwrap();

        // Filter by agent
        let claude_only = load_chat_sessions(&project_path, None, Some("claude".to_string()))
            .await
            .unwrap();
        assert_eq!(claude_only.len(), 1);
        assert_eq!(claude_only[0].agent, "claude");

        let codex_only = load_chat_sessions(&project_path, None, Some("codex".to_string()))
            .await
            .unwrap();
        assert_eq!(codex_only.len(), 1);
        assert_eq!(codex_only[0].agent, "codex");
    }

    #[tokio::test]
    async fn test_session_limit() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Create multiple sessions
        for i in 0..5 {
            let messages = vec![create_test_message(
                "user",
                &format!("Message {}", i),
                "claude",
                i * 600,
            )];
            let sessions = group_messages_into_sessions(messages.clone())
                .await
                .unwrap();
            save_chat_session(&project_path, &sessions[0], &messages)
                .await
                .unwrap();
        }

        // Test limit
        let limited = load_chat_sessions(&project_path, Some(3), None)
            .await
            .unwrap();
        assert_eq!(limited.len(), 3, "Should respect limit parameter");
    }

    #[tokio::test]
    async fn test_delete_session() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        let messages = vec![create_test_message("user", "To be deleted", "claude", 0)];

        let sessions = group_messages_into_sessions(messages.clone())
            .await
            .unwrap();
        let session_id = sessions[0].id.clone();

        // Save session
        save_chat_session(&project_path, &sessions[0], &messages)
            .await
            .unwrap();

        // Verify it exists
        let before_delete = load_chat_sessions(&project_path, None, None).await.unwrap();
        assert_eq!(before_delete.len(), 1);

        // Delete session
        let delete_result = delete_chat_session(&project_path, &session_id).await;
        assert!(delete_result.is_ok(), "Should delete session successfully");

        // Verify it's gone
        let after_delete = load_chat_sessions(&project_path, None, None).await.unwrap();
        assert_eq!(after_delete.len(), 0, "Session should be deleted");

        // Verify session file is also deleted
        let session_file_result = load_session_messages(&project_path, &session_id).await;
        assert!(
            session_file_result.is_err(),
            "Session file should be deleted"
        );
    }

    #[tokio::test]
    async fn test_file_mentions_extraction() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        let content_with_files = "Let me check the src/main.rs and tests/mod.rs files for you.";
        let mut message = create_test_message("user", content_with_files, "claude", 0);

        // Extract file mentions
        message.metadata.file_mentions = extract_file_mentions(content_with_files);

        assert_eq!(message.metadata.file_mentions.len(), 2);
        assert!(message
            .metadata
            .file_mentions
            .contains(&"src/main.rs".to_string()));
        assert!(message
            .metadata
            .file_mentions
            .contains(&"tests/mod.rs".to_string()));
    }

    #[tokio::test]
    async fn test_session_summary_generation() {
        let temp_dir = create_test_project_dir();

        let messages = vec![
            create_test_message(
                "user",
                "Can you help me implement a sorting algorithm?",
                "claude",
                0,
            ),
            create_test_message(
                "assistant",
                "I'll help you implement quicksort",
                "claude",
                60,
            ),
        ];

        let sessions = group_messages_into_sessions(messages).await.unwrap();
        let session = &sessions[0];

        assert_eq!(
            session.summary,
            "Can you help me implement a sorting algorithm?"
        );
    }

    #[tokio::test]
    async fn test_migration_from_legacy_format() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Create legacy messages (old format)
        let legacy_messages = vec![
            LegacyChatMessage {
                role: "user".to_string(),
                content: "Legacy message".to_string(),
                timestamp: Utc::now().timestamp(),
                agent: Some("claude".to_string()),
            },
            LegacyChatMessage {
                role: "assistant".to_string(),
                content: "Legacy response".to_string(),
                timestamp: Utc::now().timestamp() + 60,
                agent: Some("claude".to_string()),
            },
        ];

        // Migrate to new format
        let result = migrate_legacy_chat_data(&project_path, legacy_messages).await;
        assert!(result.is_ok(), "Should migrate legacy data successfully");

        // Verify migration created sessions
        let sessions = load_chat_sessions(&project_path, None, None).await.unwrap();
        assert_eq!(
            sessions.len(),
            1,
            "Should create one session from legacy data"
        );
        assert_eq!(sessions[0].agent, "claude");
        assert_eq!(sessions[0].message_count, 2);
    }

    #[tokio::test]
    async fn test_cross_platform_file_handling() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        let messages = vec![create_test_message(
            "user",
            "Cross platform test",
            "claude",
            0,
        )];

        let sessions = group_messages_into_sessions(messages.clone())
            .await
            .unwrap();
        save_chat_session(&project_path, &sessions[0], &messages)
            .await
            .unwrap();

        // Verify the files are created with correct paths
        let commander_dir = PathBuf::from(&project_path)
            .join(".commander")
            .join("chat_history");

        let index_file = commander_dir.join("sessions_index.json");
        assert!(index_file.exists(), "Index file should exist");

        let session_file = commander_dir.join(format!("session_{}.json", sessions[0].id));
        assert!(session_file.exists(), "Session file should exist");

        // Verify files have correct permissions and are readable
        let index_content = fs::read_to_string(index_file);
        assert!(index_content.is_ok(), "Index file should be readable");

        let session_content = fs::read_to_string(session_file);
        assert!(session_content.is_ok(), "Session file should be readable");
    }

    #[tokio::test]
    async fn test_error_handling_for_invalid_paths() {
        let invalid_path = "/nonexistent/path/to/project";

        let result = ensure_commander_directory(invalid_path).await;
        assert!(result.is_err(), "Should fail for invalid path");

        let load_result = load_chat_sessions(invalid_path, None, None).await;
        assert!(
            load_result.is_err(),
            "Should fail to load from invalid path"
        );
    }

    #[tokio::test]
    async fn test_large_session_handling() {
        let temp_dir = create_test_project_dir();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Create a large session (100 messages)
        let mut messages = Vec::new();
        for i in 0..100 {
            messages.push(create_test_message(
                if i % 2 == 0 { "user" } else { "assistant" },
                &format!("Message number {}", i),
                "claude",
                i as i64 * 30, // 30 seconds apart
            ));
        }

        let sessions = group_messages_into_sessions(messages.clone())
            .await
            .unwrap();
        assert_eq!(sessions.len(), 1, "Should group into single session");

        let save_result = save_chat_session(&project_path, &sessions[0], &messages).await;
        assert!(save_result.is_ok(), "Should handle large session");

        let loaded = load_session_messages(&project_path, &sessions[0].id)
            .await
            .unwrap();
        assert_eq!(loaded.len(), 100, "Should load all messages");
    }
}
