use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Enhanced chat message with full metadata support
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct EnhancedChatMessage {
    pub id: String,
    pub role: String, // "user" | "assistant"
    pub content: String,
    pub timestamp: i64, // Unix timestamp
    pub agent: String,  // "claude" | "codex" | "gemini" etc.
    pub metadata: ChatMessageMetadata,
}

/// Metadata associated with each chat message
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatMessageMetadata {
    pub branch: Option<String>,
    pub working_dir: Option<String>,
    pub file_mentions: Vec<String>,
    pub session_id: String,
}

/// Chat session containing multiple related messages
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatSession {
    pub id: String,
    pub start_time: i64,
    pub end_time: i64,
    pub agent: String,
    pub branch: Option<String>,
    pub message_count: usize,
    pub summary: String, // First user message or auto-generated summary
}

/// Sessions index for efficient loading
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionsIndex {
    pub sessions: Vec<ChatSession>,
    pub last_updated: i64,
    pub version: String, // For future migrations
}

/// Legacy chat message format for migration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyChatMessage {
    pub role: String,
    pub content: String,
    pub timestamp: i64,
    pub agent: Option<String>,
}

/// Configuration for chat history management
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatHistoryConfig {
    pub session_timeout_minutes: i64,          // Default: 5 minutes
    pub max_sessions_per_agent: Option<usize>, // None = unlimited
    pub retention_days: Option<u32>,           // None = keep forever
    pub compression_threshold_kb: usize,       // Default: 100KB
    pub auto_summary_enabled: bool,
}

impl Default for ChatHistoryConfig {
    fn default() -> Self {
        Self {
            session_timeout_minutes: 5,
            max_sessions_per_agent: None,
            retention_days: None,
            compression_threshold_kb: 100,
            auto_summary_enabled: true,
        }
    }
}

/// Response for chat history queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatHistoryResponse {
    pub sessions: Vec<ChatSession>,
    pub total_count: usize,
    pub has_more: bool,
}

/// Request parameters for loading chat sessions
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LoadSessionsRequest {
    pub limit: Option<usize>,
    pub agent: Option<String>,
    pub from_date: Option<i64>,
    pub to_date: Option<i64>,
    pub branch: Option<String>,
    pub search_term: Option<String>,
}

/// Export formats supported
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExportFormat {
    Json,
    Markdown,
    Html,
    Csv,
}

/// Export request parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRequest {
    pub format: ExportFormat,
    pub sessions: Option<Vec<String>>, // Session IDs to export, None = all
    pub include_metadata: bool,
    pub date_range: Option<(i64, i64)>, // (from, to) timestamps
}

/// Statistics about chat history
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatHistoryStats {
    pub total_sessions: usize,
    pub total_messages: usize,
    pub agents_used: HashMap<String, usize>, // agent -> session count
    pub branches_used: HashMap<String, usize>, // branch -> session count
    pub date_range: Option<(i64, i64)>,      // (oldest, newest) timestamps
    pub disk_usage_bytes: u64,
}

impl EnhancedChatMessage {
    /// Create a new enhanced chat message
    pub fn new(role: &str, content: &str, agent: &str, session_id: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            role: role.to_string(),
            content: content.to_string(),
            timestamp: Utc::now().timestamp(),
            agent: agent.to_string(),
            metadata: ChatMessageMetadata {
                branch: None,
                working_dir: None,
                file_mentions: Vec::new(),
                session_id: session_id.to_string(),
            },
        }
    }

    /// Create from legacy message format
    pub fn from_legacy(legacy: LegacyChatMessage, session_id: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            role: legacy.role,
            content: legacy.content.clone(),
            timestamp: legacy.timestamp,
            agent: legacy.agent.unwrap_or_else(|| "claude".to_string()),
            metadata: ChatMessageMetadata {
                branch: None,
                working_dir: None,
                file_mentions: extract_file_mentions(&legacy.content),
                session_id: session_id.to_string(),
            },
        }
    }

    /// Extract file mentions from content using regex patterns
    pub fn extract_file_mentions(content: &str) -> Vec<String> {
        extract_file_mentions(content)
    }
}

impl ChatSession {
    /// Create a new chat session
    pub fn new(agent: &str, start_time: i64, first_message: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            start_time,
            end_time: start_time,
            agent: agent.to_string(),
            branch: None,
            message_count: 0,
            summary: generate_summary(first_message),
        }
    }

    /// Update session with new message
    pub fn update_with_message(&mut self, message: &EnhancedChatMessage) {
        self.end_time = message.timestamp;
        self.message_count += 1;

        // Update branch if not set and message has branch info
        if self.branch.is_none() {
            self.branch = message.metadata.branch.clone();
        }
    }

    /// Check if this session should contain a new message based on timing and agent
    pub fn should_include_message(
        &self,
        message: &EnhancedChatMessage,
        timeout_minutes: i64,
    ) -> bool {
        let time_gap_minutes = (message.timestamp - self.end_time) / 60;
        message.agent == self.agent && time_gap_minutes <= timeout_minutes
    }

    /// Get duration in minutes
    pub fn duration_minutes(&self) -> i64 {
        (self.end_time - self.start_time) / 60
    }
}

/// Extract file mentions from message content
pub fn extract_file_mentions(content: &str) -> Vec<String> {
    use regex::Regex;

    // Pattern to match common file paths
    // Matches patterns like: src/main.rs, ./config.json, /usr/local/bin/app, etc.
    let file_pattern = Regex::new(r"(?:^|\s|`)([^\s`]+\.[a-zA-Z0-9]{1,6})(?:\s|`|$)")
        .unwrap_or_else(|_| panic!("Invalid regex pattern"));

    let path_pattern = Regex::new(r"(?:^|\s|`)([a-zA-Z0-9_\-./]+/[a-zA-Z0-9_\-./]+)(?:\s|`|$)")
        .unwrap_or_else(|_| panic!("Invalid regex pattern"));

    let mut mentions = std::collections::HashSet::new();

    // Extract file extensions
    for cap in file_pattern.captures_iter(content) {
        if let Some(file) = cap.get(1) {
            let file_str = file.as_str();
            // Filter out common false positives
            if !is_false_positive(file_str) {
                mentions.insert(file_str.to_string());
            }
        }
    }

    // Extract path-like patterns
    for cap in path_pattern.captures_iter(content) {
        if let Some(path) = cap.get(1) {
            let path_str = path.as_str();
            if !is_false_positive(path_str) && path_str.contains('/') {
                mentions.insert(path_str.to_string());
            }
        }
    }

    mentions.into_iter().collect()
}

/// Check if a potential file mention is likely a false positive
fn is_false_positive(text: &str) -> bool {
    // Common false positives
    let false_positives = [
        "http://",
        "https://",
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "package.json",
        "package-lock.json",
        "node_modules",
    ];

    false_positives.iter().any(|&fp| text.contains(fp)) ||
    text.len() > 100 || // Very long strings are likely not file paths
    text.starts_with("http") ||
    text.contains("://")
}

/// Generate a summary from the first user message
fn generate_summary(content: &str) -> String {
    // Take first 100 characters, truncate at word boundary
    if content.len() <= 100 {
        return content.to_string();
    }

    let truncated = &content[..100];
    if let Some(last_space) = truncated.rfind(' ') {
        format!("{}...", &truncated[..last_space])
    } else {
        format!("{}...", truncated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_file_mentions() {
        let content = "Check the src/main.rs and tests/mod.rs files. Also look at ./config.json";
        let mentions = extract_file_mentions(content);

        assert!(mentions.contains(&"src/main.rs".to_string()));
        assert!(mentions.contains(&"tests/mod.rs".to_string()));
        assert!(mentions.contains(&"./config.json".to_string()));
    }

    #[test]
    fn test_false_positive_filtering() {
        let content = "Visit https://example.com/api and http://localhost:3000/test";
        let mentions = extract_file_mentions(content);

        // Should not extract URLs as file mentions
        assert!(!mentions.iter().any(|m| m.contains("http")));
    }

    #[test]
    fn test_session_grouping_logic() {
        let session = ChatSession::new("claude", 1000, "Test message");

        let msg1 = EnhancedChatMessage {
            id: "1".to_string(),
            role: "user".to_string(),
            content: "Follow up".to_string(),
            timestamp: 1000 + 60, // 1 minute later
            agent: "claude".to_string(),
            metadata: ChatMessageMetadata {
                branch: None,
                working_dir: None,
                file_mentions: vec![],
                session_id: session.id.clone(),
            },
        };

        let msg2 = EnhancedChatMessage {
            id: "2".to_string(),
            role: "user".to_string(),
            content: "Much later".to_string(),
            timestamp: 1000 + 600, // 10 minutes later
            agent: "claude".to_string(),
            metadata: ChatMessageMetadata {
                branch: None,
                working_dir: None,
                file_mentions: vec![],
                session_id: session.id.clone(),
            },
        };

        assert!(session.should_include_message(&msg1, 5)); // Should include (1 min gap)
        assert!(!session.should_include_message(&msg2, 5)); // Should not include (10 min gap)
    }

    #[test]
    fn test_summary_generation() {
        let short = "Short message";
        assert_eq!(generate_summary(short), "Short message");

        let long = "This is a very long message that exceeds the 100 character limit and should be truncated properly at word boundaries to create a good summary";
        let summary = generate_summary(long);
        assert!(summary.len() <= 103); // 100 chars + "..."
        assert!(summary.ends_with("..."));
        assert!(!summary.contains("summary")); // Should truncate before this word
    }

    #[test]
    fn test_legacy_migration() {
        let legacy = LegacyChatMessage {
            role: "user".to_string(),
            content: "Check src/main.rs please".to_string(),
            timestamp: 1234567890,
            agent: Some("claude".to_string()),
        };

        let enhanced = EnhancedChatMessage::from_legacy(legacy, "session-123");

        assert_eq!(enhanced.role, "user");
        assert_eq!(enhanced.content, "Check src/main.rs please");
        assert_eq!(enhanced.timestamp, 1234567890);
        assert_eq!(enhanced.agent, "claude");
        assert_eq!(enhanced.metadata.session_id, "session-123");
        assert!(enhanced
            .metadata
            .file_mentions
            .contains(&"src/main.rs".to_string()));
    }
}
