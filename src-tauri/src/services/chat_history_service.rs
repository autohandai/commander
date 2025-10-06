use crate::models::chat_history::*;
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};
use tokio::fs as async_fs;

const COMMANDER_DIR: &str = ".commander";
const CHAT_HISTORY_DIR: &str = "chat_history";
const SESSIONS_INDEX_FILE: &str = "sessions_index.json";
const SESSION_TIMEOUT_MINUTES: i64 = 5;

/// Ensure the .commander/chat_history directory exists
pub async fn ensure_commander_directory(project_path: &str) -> Result<PathBuf, String> {
    let chat_dir = Path::new(project_path)
        .join(COMMANDER_DIR)
        .join(CHAT_HISTORY_DIR);

    async_fs::create_dir_all(&chat_dir)
        .await
        .map_err(|e| format!("Failed to create chat history directory: {}", e))?;

    Ok(chat_dir)
}

/// Group messages into sessions based on timing and agent
pub async fn group_messages_into_sessions(
    messages: Vec<EnhancedChatMessage>,
) -> Result<Vec<ChatSession>, String> {
    if messages.is_empty() {
        return Ok(Vec::new());
    }

    let mut sessions = Vec::new();
    let mut current_session: Option<ChatSession> = None;

    for message in messages {
        let should_create_new_session = match &current_session {
            None => true,
            Some(session) => !session.should_include_message(&message, SESSION_TIMEOUT_MINUTES),
        };

        if should_create_new_session {
            // Finalize the current session
            if let Some(session) = current_session {
                sessions.push(session);
            }

            // Create new session
            let first_message_content = if message.role == "user" {
                message.content.clone()
            } else {
                "Assistant initiated conversation".to_string()
            };

            current_session = Some(ChatSession::new(
                &message.agent,
                message.timestamp,
                &first_message_content,
            ));
        }

        // Update session with message
        if let Some(ref mut session) = current_session {
            session.update_with_message(&message);
        }
    }

    // Don't forget the last session
    if let Some(session) = current_session {
        sessions.push(session);
    }

    Ok(sessions)
}

/// Save a chat session and its messages to disk
pub async fn save_chat_session(
    project_path: &str,
    session: &ChatSession,
    messages: &[EnhancedChatMessage],
) -> Result<(), String> {
    let chat_dir = ensure_commander_directory(project_path).await?;

    // Save session messages
    let session_file = chat_dir.join(format!("session_{}.json", session.id));
    let messages_json = serde_json::to_string_pretty(messages)
        .map_err(|e| format!("Failed to serialize messages: {}", e))?;

    async_fs::write(session_file, messages_json)
        .await
        .map_err(|e| format!("Failed to write session file: {}", e))?;

    // Update sessions index
    update_sessions_index(project_path, session).await?;

    Ok(())
}

/// Update the sessions index with a new session
async fn update_sessions_index(
    project_path: &str,
    new_session: &ChatSession,
) -> Result<(), String> {
    let chat_dir = ensure_commander_directory(project_path).await?;
    let index_file = chat_dir.join(SESSIONS_INDEX_FILE);

    // Load existing index
    let mut index = if index_file.exists() {
        let index_content = async_fs::read_to_string(&index_file)
            .await
            .map_err(|e| format!("Failed to read sessions index: {}", e))?;

        serde_json::from_str::<SessionsIndex>(&index_content)
            .unwrap_or_else(|_| SessionsIndex::default())
    } else {
        SessionsIndex::default()
    };

    // Remove existing session with same ID (for updates)
    index.sessions.retain(|s| s.id != new_session.id);

    // Add new session
    index.sessions.push(new_session.clone());

    // Sort by start time (newest first)
    index
        .sessions
        .sort_by(|a, b| b.start_time.cmp(&a.start_time));

    // Update metadata
    index.last_updated = Utc::now().timestamp();
    index.version = "1.0".to_string();

    // Save updated index
    let index_json = serde_json::to_string_pretty(&index)
        .map_err(|e| format!("Failed to serialize sessions index: {}", e))?;

    async_fs::write(index_file, index_json)
        .await
        .map_err(|e| format!("Failed to write sessions index: {}", e))?;

    Ok(())
}

/// Load chat sessions with optional filtering and limiting
pub async fn load_chat_sessions(
    project_path: &str,
    limit: Option<usize>,
    agent_filter: Option<String>,
) -> Result<Vec<ChatSession>, String> {
    let chat_dir = ensure_commander_directory(project_path).await?;
    let index_file = chat_dir.join(SESSIONS_INDEX_FILE);

    if !index_file.exists() {
        return Ok(Vec::new());
    }

    let index_content = async_fs::read_to_string(&index_file)
        .await
        .map_err(|e| format!("Failed to read sessions index: {}", e))?;

    let index: SessionsIndex = serde_json::from_str(&index_content)
        .map_err(|e| format!("Failed to parse sessions index: {}", e))?;

    let mut sessions = index.sessions;

    // Apply agent filter
    if let Some(agent) = agent_filter {
        sessions.retain(|s| s.agent == agent);
    }

    // Apply limit
    if let Some(limit) = limit {
        sessions.truncate(limit);
    }

    Ok(sessions)
}

/// Load messages for a specific session
pub async fn load_session_messages(
    project_path: &str,
    session_id: &str,
) -> Result<Vec<EnhancedChatMessage>, String> {
    let chat_dir = ensure_commander_directory(project_path).await?;
    let session_file = chat_dir.join(format!("session_{}.json", session_id));

    if !session_file.exists() {
        return Err(format!("Session file not found: {}", session_id));
    }

    let session_content = async_fs::read_to_string(&session_file)
        .await
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    let messages: Vec<EnhancedChatMessage> = serde_json::from_str(&session_content)
        .map_err(|e| format!("Failed to parse session messages: {}", e))?;

    Ok(messages)
}

/// Delete a chat session
pub async fn delete_chat_session(project_path: &str, session_id: &str) -> Result<(), String> {
    let chat_dir = ensure_commander_directory(project_path).await?;

    // Delete session file
    let session_file = chat_dir.join(format!("session_{}.json", session_id));
    if session_file.exists() {
        async_fs::remove_file(session_file)
            .await
            .map_err(|e| format!("Failed to delete session file: {}", e))?;
    }

    // Remove from sessions index
    let index_file = chat_dir.join(SESSIONS_INDEX_FILE);
    if index_file.exists() {
        let index_content = async_fs::read_to_string(&index_file)
            .await
            .map_err(|e| format!("Failed to read sessions index: {}", e))?;

        let mut index: SessionsIndex =
            serde_json::from_str(&index_content).unwrap_or_else(|_| SessionsIndex::default());

        // Remove session from index
        index.sessions.retain(|s| s.id != session_id);
        index.last_updated = Utc::now().timestamp();

        // Save updated index
        let index_json = serde_json::to_string_pretty(&index)
            .map_err(|e| format!("Failed to serialize sessions index: {}", e))?;

        async_fs::write(index_file, index_json)
            .await
            .map_err(|e| format!("Failed to write sessions index: {}", e))?;
    }

    Ok(())
}

/// Migrate legacy chat data to new format
pub async fn migrate_legacy_chat_data(
    project_path: &str,
    legacy_messages: Vec<LegacyChatMessage>,
) -> Result<(), String> {
    if legacy_messages.is_empty() {
        return Ok(());
    }

    // Convert legacy messages to enhanced format
    let session_id = uuid::Uuid::new_v4().to_string();
    let enhanced_messages: Vec<EnhancedChatMessage> = legacy_messages
        .into_iter()
        .map(|msg| EnhancedChatMessage::from_legacy(msg, &session_id))
        .collect();

    // Group into sessions
    let sessions = group_messages_into_sessions(enhanced_messages.clone()).await?;

    // Save each session
    for session in sessions {
        let session_messages: Vec<EnhancedChatMessage> = enhanced_messages
            .iter()
            .filter(|msg| msg.agent == session.agent)
            .filter(|msg| msg.timestamp >= session.start_time && msg.timestamp <= session.end_time)
            .cloned()
            .collect();

        save_chat_session(project_path, &session, &session_messages).await?;
    }

    Ok(())
}

/// Extract file mentions from content using regex
pub fn extract_file_mentions(content: &str) -> Vec<String> {
    use regex::Regex;

    // More comprehensive regex patterns for file detection
    // Note: The Rust `regex` crate does not support lookarounds, so we
    // capture the filename/path in group 1 and match trailing punctuation
    // as part of a non-capturing group to establish a boundary.
    let patterns = [
        // Paths or filenames that include an extension; allow leading ./ and internal /
        r#"(?:^|\s|`|[\[("])([\./A-Za-z0-9_\-]+(?:/[A-Za-z0-9_\-.]+)*\.[A-Za-z0-9]{1,6})(?:\s|`|$|[\]\),.;:!\?"'])"#,
        // Common filenames optionally prefixed by path segments
        r#"(?:^|\s|`|[\[("])((?:[\./A-Za-z0-9_\-]+/)*?(?:Makefile|Dockerfile|README|LICENSE|CHANGELOG|Cargo\.toml|package\.json|pom\.xml|build\.gradle))(?:\s|`|$|[\]\),.;:!\?"'])"#,
        // Backtick-enclosed content (we'll post-filter with is_likely_file_path)
        r#"`([^`]+)`"#,
    ];

    let mut mentions = std::collections::HashSet::new();

    for pattern_str in &patterns {
        if let Ok(pattern) = Regex::new(pattern_str) {
            for cap in pattern.captures_iter(content) {
                if let Some(file_match) = cap.get(1) {
                    let file_str = file_match.as_str().trim();
                    if is_likely_file_path(file_str) {
                        mentions.insert(file_str.to_string());
                    }
                }
            }
        }
    }

    mentions.into_iter().collect()
}

/// Check if a string is likely a file path
fn is_likely_file_path(text: &str) -> bool {
    // Skip if too long or contains URL-like patterns
    if text.len() > 200 || text.contains("://") || text.starts_with("http") {
        return false;
    }

    // Consider only the basename for extension/common-file checks
    let basename = text
        .rsplit(|c| c == '/' || c == '\\')
        .next()
        .unwrap_or(text);

    // Has a plausible extension (e.g., main.rs, config.json, .env)
    let has_extension = if let Some((_, ext)) = basename.rsplit_once('.') {
        !ext.is_empty() && ext.len() <= 6
    } else {
        false
    };

    let is_common_file = is_common_filename(basename);

    (has_extension || is_common_file) && !is_false_positive(text)
}

/// Check for common filename patterns
fn is_common_filename(text: &str) -> bool {
    let common_files = [
        "Makefile",
        "Dockerfile",
        "README",
        "LICENSE",
        "CHANGELOG",
        "Cargo.toml",
        "package.json",
        "pom.xml",
        "build.gradle",
    ];

    common_files
        .iter()
        .any(|&file| text.eq_ignore_ascii_case(file))
}

/// Check if text is likely a false positive
fn is_false_positive(text: &str) -> bool {
    let false_positives = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "example.com",
        "www.",
        ".com",
        ".org",
        ".net",
        ".io",
    ];

    false_positives.iter().any(|&fp| text.contains(fp))
        || text.chars().all(|c| c.is_ascii_digit() || c == '.') // IP addresses
}

/// Get chat history statistics
pub async fn get_chat_history_stats(project_path: &str) -> Result<ChatHistoryStats, String> {
    let chat_dir = ensure_commander_directory(project_path).await?;
    let index_file = chat_dir.join(SESSIONS_INDEX_FILE);

    let sessions = if index_file.exists() {
        let index_content = async_fs::read_to_string(&index_file)
            .await
            .map_err(|e| format!("Failed to read sessions index: {}", e))?;

        let index: SessionsIndex =
            serde_json::from_str(&index_content).unwrap_or_else(|_| SessionsIndex::default());

        index.sessions
    } else {
        Vec::new()
    };

    let mut agents_used = std::collections::HashMap::new();
    let mut branches_used = std::collections::HashMap::new();
    let mut total_messages = 0;
    let mut date_range: Option<(i64, i64)> = None;

    for session in &sessions {
        // Count agents
        *agents_used.entry(session.agent.clone()).or_insert(0) += 1;

        // Count branches
        if let Some(ref branch) = session.branch {
            *branches_used.entry(branch.clone()).or_insert(0) += 1;
        }

        // Count messages
        total_messages += session.message_count;

        // Track date range
        match date_range {
            None => date_range = Some((session.start_time, session.end_time)),
            Some((min, max)) => {
                date_range = Some((min.min(session.start_time), max.max(session.end_time)));
            }
        }
    }

    // Calculate disk usage
    let mut disk_usage_bytes = 0u64;
    if chat_dir.exists() {
        if let Ok(entries) = fs::read_dir(&chat_dir) {
            for entry in entries.flatten() {
                if let Ok(metadata) = entry.metadata() {
                    disk_usage_bytes += metadata.len();
                }
            }
        }
    }

    Ok(ChatHistoryStats {
        total_sessions: sessions.len(),
        total_messages,
        agents_used,
        branches_used,
        date_range,
        disk_usage_bytes,
    })
}

/// Export chat history in various formats
pub async fn export_chat_history(
    project_path: &str,
    request: ExportRequest,
) -> Result<String, String> {
    let sessions = load_chat_sessions(project_path, None, None).await?;

    // Filter sessions if specific ones requested
    let sessions_to_export = if let Some(ref session_ids) = request.sessions {
        sessions
            .into_iter()
            .filter(|s| session_ids.contains(&s.id))
            .collect()
    } else {
        sessions
    };

    match request.format {
        ExportFormat::Json => {
            export_as_json(&sessions_to_export, project_path, request.include_metadata).await
        }
        ExportFormat::Markdown => export_as_markdown(&sessions_to_export, project_path).await,
        ExportFormat::Html => export_as_html(&sessions_to_export, project_path).await,
        ExportFormat::Csv => export_as_csv(&sessions_to_export, project_path).await,
    }
}

async fn export_as_json(
    sessions: &[ChatSession],
    project_path: &str,
    include_metadata: bool,
) -> Result<String, String> {
    let mut export_data = serde_json::Map::new();
    export_data.insert(
        "export_date".to_string(),
        serde_json::Value::String(chrono::Utc::now().to_rfc3339()),
    );
    export_data.insert(
        "project_path".to_string(),
        serde_json::Value::String(project_path.to_string()),
    );

    let mut sessions_data = Vec::new();
    for session in sessions {
        let messages = load_session_messages(project_path, &session.id).await?;

        let session_data = if include_metadata {
            serde_json::json!({
                "session": session,
                "messages": messages
            })
        } else {
            // Simplified format without metadata
            let simple_messages: Vec<_> = messages
                .iter()
                .map(|m| {
                    serde_json::json!({
                        "role": m.role,
                        "content": m.content,
                        "timestamp": m.timestamp,
                        "agent": m.agent
                    })
                })
                .collect();

            serde_json::json!({
                "session_id": session.id,
                "agent": session.agent,
                "start_time": session.start_time,
                "summary": session.summary,
                "messages": simple_messages
            })
        };

        sessions_data.push(session_data);
    }

    export_data.insert(
        "sessions".to_string(),
        serde_json::Value::Array(sessions_data),
    );

    serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize export data: {}", e))
}

async fn export_as_markdown(
    sessions: &[ChatSession],
    project_path: &str,
) -> Result<String, String> {
    let mut markdown = String::new();

    markdown.push_str(&format!("# Chat History Export\n\n"));
    markdown.push_str(&format!("**Project:** {}\n", project_path));
    markdown.push_str(&format!(
        "**Export Date:** {}\n\n",
        chrono::Utc::now().to_rfc3339()
    ));

    for session in sessions {
        let messages = load_session_messages(project_path, &session.id).await?;
        let session_date = chrono::DateTime::from_timestamp(session.start_time, 0)
            .unwrap_or_default()
            .format("%Y-%m-%d %H:%M:%S");

        markdown.push_str(&format!(
            "## Session: {} ({})\n\n",
            session.summary, session_date
        ));
        markdown.push_str(&format!("**Agent:** {}\n", session.agent));
        if let Some(ref branch) = session.branch {
            markdown.push_str(&format!("**Branch:** {}\n", branch));
        }
        markdown.push_str(&format!("**Messages:** {}\n\n", session.message_count));

        for message in messages {
            let role_display = match message.role.as_str() {
                "user" => "👤 **User**",
                "assistant" => "🤖 **Assistant**",
                _ => &message.role,
            };

            markdown.push_str(&format!("{}\n\n", role_display));
            markdown.push_str(&format!("{}\n\n", message.content));
            markdown.push_str("---\n\n");
        }
    }

    Ok(markdown)
}

async fn export_as_html(_sessions: &[ChatSession], _project_path: &str) -> Result<String, String> {
    // Placeholder for HTML export
    Err("HTML export not yet implemented".to_string())
}

async fn export_as_csv(_sessions: &[ChatSession], _project_path: &str) -> Result<String, String> {
    // Placeholder for CSV export
    Err("CSV export not yet implemented".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    // use tempfile::TempDir;

    #[test]
    fn test_file_mention_extraction() {
        let content = "Check src/main.rs and ./config.json, also look at Makefile";
        let mentions = extract_file_mentions(content);

        println!("Debug: Extracted mentions: {:?}", mentions);
        println!("Debug: Looking for: src/main.rs, ./config.json, Makefile");

        assert!(mentions.contains(&"src/main.rs".to_string()));
        assert!(mentions.contains(&"./config.json".to_string()));
        assert!(mentions.contains(&"Makefile".to_string()));
    }

    #[test]
    fn test_false_positive_filtering() {
        let content = "Visit https://example.com and 192.168.1.1";
        let mentions = extract_file_mentions(content);

        assert!(!mentions.iter().any(|m| m.contains("https")));
        assert!(!mentions.iter().any(|m| m.contains("192.168")));
    }

    #[tokio::test]
    async fn test_session_grouping_by_agent() {
        let messages = vec![
            EnhancedChatMessage {
                id: "1".to_string(),
                role: "user".to_string(),
                content: "Claude message".to_string(),
                timestamp: 1000,
                agent: "claude".to_string(),
                metadata: ChatMessageMetadata {
                    branch: None,
                    working_dir: None,
                    file_mentions: vec![],
                    session_id: "".to_string(),
                },
            },
            EnhancedChatMessage {
                id: "2".to_string(),
                role: "user".to_string(),
                content: "Codex message".to_string(),
                timestamp: 1060, // 1 minute later
                agent: "codex".to_string(),
                metadata: ChatMessageMetadata {
                    branch: None,
                    working_dir: None,
                    file_mentions: vec![],
                    session_id: "".to_string(),
                },
            },
        ];

        let sessions = group_messages_into_sessions(messages).await.unwrap();
        assert_eq!(sessions.len(), 2); // Different agents = different sessions
        assert_eq!(sessions[0].agent, "claude");
        assert_eq!(sessions[1].agent, "codex");
    }
}
