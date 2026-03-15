use crate::models::chat_history::{ChatMessageMetadata, EnhancedChatMessage};
use std::path::Path;

/// Load messages from an agent's source file, dispatching to the correct parser
pub async fn load_messages_from_source(
    agent_id: &str,
    source_file: &str,
) -> Result<Vec<EnhancedChatMessage>, String> {
    match agent_id {
        "autohand" => parse_autohand_messages(source_file).await,
        "claude" => parse_claude_messages(source_file).await,
        "codex" => parse_codex_messages(source_file).await,
        "gemini" => parse_gemini_placeholder(source_file),
        other => Err(format!("Unknown agent: {}", other)),
    }
}

/// Autohand: source_file is metadata.json; sibling conversation.jsonl has the messages
async fn parse_autohand_messages(source_file: &str) -> Result<Vec<EnhancedChatMessage>, String> {
    let source_path = Path::new(source_file);
    let parent = source_path
        .parent()
        .ok_or_else(|| "Cannot determine parent directory of source file".to_string())?;
    let conversation_path = parent.join("conversation.jsonl");

    if !conversation_path.exists() {
        return Err(format!(
            "Conversation file not found: {}",
            conversation_path.display()
        ));
    }

    let content = tokio::fs::read_to_string(&conversation_path)
        .await
        .map_err(|e| format!("Failed to read {}: {}", conversation_path.display(), e))?;

    let mut messages = Vec::new();
    for (i, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parsed: serde_json::Value = serde_json::from_str(line)
            .map_err(|e| format!("Failed to parse line {}: {}", i + 1, e))?;

        let role = parsed["role"].as_str().unwrap_or("unknown").to_string();
        let content_str = parsed["content"].as_str().unwrap_or("").to_string();
        let timestamp = parse_timestamp_field(&parsed["timestamp"]);

        messages.push(EnhancedChatMessage {
            id: format!("autohand-{}-{}", i, timestamp),
            role,
            content: content_str,
            timestamp,
            agent: "autohand".to_string(),
            metadata: ChatMessageMetadata {
                branch: None,
                working_dir: None,
                file_mentions: Vec::new(),
                session_id: String::new(),
            },
        });
    }
    Ok(messages)
}

/// Claude: source_file is a .jsonl file. Filter for user/assistant messages.
async fn parse_claude_messages(source_file: &str) -> Result<Vec<EnhancedChatMessage>, String> {
    let path = Path::new(source_file);
    if !path.exists() {
        return Err(format!("Source file not found: {}", source_file));
    }

    let content = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| format!("Failed to read {}: {}", source_file, e))?;

    let mut messages = Vec::new();
    for (i, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parsed: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue, // Skip malformed lines
        };

        let msg_type = parsed["type"].as_str().unwrap_or("");
        if msg_type != "user" && msg_type != "assistant" {
            continue;
        }

        // Content can be a string or an array of {type:"text", text:"..."} blocks
        let content_str = extract_claude_content(&parsed["message"]["content"]);
        let timestamp = parse_timestamp_field(&parsed["timestamp"]);

        messages.push(EnhancedChatMessage {
            id: format!("claude-{}-{}", i, timestamp),
            role: msg_type.to_string(),
            content: content_str,
            timestamp,
            agent: "claude".to_string(),
            metadata: ChatMessageMetadata {
                branch: None,
                working_dir: None,
                file_mentions: Vec::new(),
                session_id: String::new(),
            },
        });
    }
    Ok(messages)
}

/// Codex: source_file is a .jsonl. Filter for item_created where role is user/assistant.
async fn parse_codex_messages(source_file: &str) -> Result<Vec<EnhancedChatMessage>, String> {
    let path = Path::new(source_file);
    if !path.exists() {
        return Err(format!("Source file not found: {}", source_file));
    }

    let content = tokio::fs::read_to_string(path)
        .await
        .map_err(|e| format!("Failed to read {}: {}", source_file, e))?;

    let mut messages = Vec::new();
    for (i, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parsed: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let msg_type = parsed["type"].as_str().unwrap_or("");
        if msg_type != "item_created" {
            continue;
        }

        let role = parsed["payload"]["item"]["role"]
            .as_str()
            .unwrap_or("");
        if role != "user" && role != "assistant" {
            continue;
        }

        // Extract text from content array
        let content_str = extract_codex_content(&parsed["payload"]["item"]["content"]);
        let timestamp = parse_timestamp_field(&parsed["timestamp"]);

        messages.push(EnhancedChatMessage {
            id: format!("codex-{}-{}", i, timestamp),
            role: role.to_string(),
            content: content_str,
            timestamp,
            agent: "codex".to_string(),
            metadata: ChatMessageMetadata {
                branch: None,
                working_dir: None,
                file_mentions: Vec::new(),
                session_id: String::new(),
            },
        });
    }
    Ok(messages)
}

/// Gemini protobuf sessions can't be displayed directly
fn parse_gemini_placeholder(_source_file: &str) -> Result<Vec<EnhancedChatMessage>, String> {
    Ok(vec![EnhancedChatMessage {
        id: "gemini-placeholder".to_string(),
        role: "assistant".to_string(),
        content: "Gemini protobuf sessions cannot be displayed directly.".to_string(),
        timestamp: chrono::Utc::now().timestamp(),
        agent: "gemini".to_string(),
        metadata: ChatMessageMetadata {
            branch: None,
            working_dir: None,
            file_mentions: Vec::new(),
            session_id: String::new(),
        },
    }])
}

/// Extract text content from Claude's message content field.
/// Content may be a string or an array of {type:"text", text:"..."} blocks.
fn extract_claude_content(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => {
            let parts: Vec<String> = arr
                .iter()
                .filter_map(|block| {
                    if block["type"].as_str() == Some("text") {
                        block["text"].as_str().map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect();
            parts.join("\n")
        }
        _ => String::new(),
    }
}

/// Extract text content from Codex's item content array
fn extract_codex_content(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::Array(arr) => {
            let parts: Vec<String> = arr
                .iter()
                .filter_map(|block| block["text"].as_str().map(|s| s.to_string()))
                .collect();
            parts.join("\n")
        }
        serde_json::Value::String(s) => s.clone(),
        _ => String::new(),
    }
}

/// Parse a timestamp field that may be an RFC3339 string or a unix integer
fn parse_timestamp_field(value: &serde_json::Value) -> i64 {
    match value {
        serde_json::Value::Number(n) => n.as_i64().unwrap_or(0),
        serde_json::Value::String(s) => {
            // Try RFC3339 first
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                dt.timestamp()
            } else if let Ok(ts) = s.parse::<i64>() {
                ts
            } else {
                0
            }
        }
        _ => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_parse_autohand_messages() {
        let dir = TempDir::new().unwrap();
        let session_dir = dir.path().join("session1");
        std::fs::create_dir_all(&session_dir).unwrap();

        // Write metadata.json
        let metadata_path = session_dir.join("metadata.json");
        std::fs::write(&metadata_path, r#"{"id":"s1","agent":"autohand"}"#).unwrap();

        // Write conversation.jsonl
        let conv_path = session_dir.join("conversation.jsonl");
        std::fs::write(
            &conv_path,
            r#"{"role":"user","content":"Hello","timestamp":1709600000}
{"role":"assistant","content":"Hi there!","timestamp":1709600060}
"#,
        )
        .unwrap();

        let messages = parse_autohand_messages(metadata_path.to_str().unwrap())
            .await
            .unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].content, "Hello");
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].content, "Hi there!");
    }

    #[tokio::test]
    async fn test_parse_claude_messages() {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("session.jsonl");

        // Claude format: type=user/assistant with message.content
        std::fs::write(
            &file_path,
            r#"{"type":"user","message":{"content":"What is Rust?"},"timestamp":"2026-03-04T10:00:00Z"}
{"type":"assistant","message":{"content":[{"type":"text","text":"Rust is a systems language."}]},"timestamp":"2026-03-04T10:00:30Z"}
{"type":"tool_use","message":{"content":"ignored"},"timestamp":"2026-03-04T10:00:31Z"}
"#,
        )
        .unwrap();

        let messages = parse_claude_messages(file_path.to_str().unwrap())
            .await
            .unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].content, "What is Rust?");
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].content, "Rust is a systems language.");
    }

    #[tokio::test]
    async fn test_parse_claude_messages_string_content() {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("session.jsonl");

        std::fs::write(
            &file_path,
            r#"{"type":"assistant","message":{"content":"Plain string content"},"timestamp":1709600000}
"#,
        )
        .unwrap();

        let messages = parse_claude_messages(file_path.to_str().unwrap())
            .await
            .unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content, "Plain string content");
    }

    #[tokio::test]
    async fn test_parse_codex_messages() {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("session.jsonl");

        std::fs::write(
            &file_path,
            r#"{"type":"item_created","payload":{"item":{"role":"user","content":[{"text":"Fix the bug"}]}},"timestamp":1709600000}
{"type":"item_created","payload":{"item":{"role":"assistant","content":[{"text":"Done!"}]}},"timestamp":1709600060}
{"type":"other_event","payload":{},"timestamp":1709600070}
"#,
        )
        .unwrap();

        let messages = parse_codex_messages(file_path.to_str().unwrap())
            .await
            .unwrap();
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].content, "Fix the bug");
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].content, "Done!");
    }

    #[tokio::test]
    async fn test_parse_missing_file() {
        let result = parse_claude_messages("/nonexistent/path.jsonl").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("not found"));
    }

    #[tokio::test]
    async fn test_parse_malformed_lines_skipped() {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("session.jsonl");

        std::fs::write(
            &file_path,
            r#"not valid json
{"type":"user","message":{"content":"Valid line"},"timestamp":1709600000}
{broken json too
"#,
        )
        .unwrap();

        let messages = parse_claude_messages(file_path.to_str().unwrap())
            .await
            .unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content, "Valid line");
    }

    #[tokio::test]
    async fn test_parse_empty_file() {
        let dir = TempDir::new().unwrap();
        let file_path = dir.path().join("empty.jsonl");
        std::fs::write(&file_path, "").unwrap();

        let messages = parse_claude_messages(file_path.to_str().unwrap())
            .await
            .unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn test_gemini_placeholder() {
        let messages = parse_gemini_placeholder("/some/path").unwrap();
        assert_eq!(messages.len(), 1);
        assert!(messages[0].content.contains("protobuf"));
    }

    #[tokio::test]
    async fn test_load_messages_unknown_agent() {
        let result = load_messages_from_source("unknown_agent", "/some/file").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown agent"));
    }

    #[test]
    fn test_parse_timestamp_rfc3339() {
        let val = serde_json::json!("2026-03-04T10:00:00Z");
        let ts = parse_timestamp_field(&val);
        assert!(ts > 0);
    }

    #[test]
    fn test_parse_timestamp_unix_int() {
        let val = serde_json::json!(1709600000);
        let ts = parse_timestamp_field(&val);
        assert_eq!(ts, 1709600000);
    }

    #[test]
    fn test_parse_timestamp_unix_string() {
        let val = serde_json::json!("1709600000");
        let ts = parse_timestamp_field(&val);
        assert_eq!(ts, 1709600000);
    }

    #[test]
    fn test_extract_claude_content_array() {
        let val = serde_json::json!([
            {"type": "text", "text": "Part 1"},
            {"type": "tool_use", "id": "abc"},
            {"type": "text", "text": "Part 2"}
        ]);
        let result = extract_claude_content(&val);
        assert_eq!(result, "Part 1\nPart 2");
    }

    #[test]
    fn test_extract_codex_content_array() {
        let val = serde_json::json!([
            {"text": "Line 1"},
            {"text": "Line 2"}
        ]);
        let result = extract_codex_content(&val);
        assert_eq!(result, "Line 1\nLine 2");
    }
}
