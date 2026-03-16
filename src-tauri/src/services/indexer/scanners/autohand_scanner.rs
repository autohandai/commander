use crate::models::indexer::IndexedSession;
use crate::services::indexer::scanner::{AgentScanner, DiscoveredFile, ParseResult, truncate_summary};
use async_trait::async_trait;
use std::path::PathBuf;

pub struct AutohandScanner {
    home: PathBuf,
}

impl AutohandScanner {
    pub fn new() -> Self {
        let home = dirs::home_dir()
            .unwrap_or_default()
            .join(".autohand");
        Self { home }
    }
}

#[async_trait]
impl AgentScanner for AutohandScanner {
    fn agent_id(&self) -> &str {
        "autohand"
    }

    fn display_name(&self) -> &str {
        "Autohand"
    }

    fn home_dir(&self) -> String {
        self.home.to_string_lossy().to_string()
    }

    fn is_available(&self) -> bool {
        self.home.join("sessions").exists()
    }

    async fn discover_files(&self) -> Result<Vec<DiscoveredFile>, String> {
        let sessions_dir = self.home.join("sessions");
        if !sessions_dir.exists() {
            return Ok(vec![]);
        }

        let mut files = Vec::new();
        let entries = std::fs::read_dir(&sessions_dir)
            .map_err(|e| format!("Failed to read autohand sessions dir: {}", e))?;

        for entry in entries.flatten() {
            let meta_path = entry.path().join("metadata.json");
            if meta_path.exists() {
                if let Ok(meta) = std::fs::metadata(&meta_path) {
                    let mtime = meta
                        .modified()
                        .map(|t| {
                            t.duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs() as i64
                        })
                        .unwrap_or(0);
                    files.push(DiscoveredFile {
                        path: meta_path.to_string_lossy().to_string(),
                        mtime,
                        size: meta.len(),
                    });
                }
            }
        }

        Ok(files)
    }

    async fn parse_file(&self, path: &str) -> Result<ParseResult, String> {
        let content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| format!("Failed to read {}: {}", path, e))?;

        let val: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse {}: {}", path, e))?;

        let session_id = val
            .get("sessionId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        if session_id.is_empty() {
            return Ok(ParseResult { sessions: vec![] });
        }

        let created_at = val
            .get("createdAt")
            .and_then(|v| v.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.timestamp())
            .unwrap_or(0);

        let closed_at = val
            .get("closedAt")
            .and_then(|v| v.as_str())
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.timestamp());

        let project_path = val
            .get("projectPath")
            .and_then(|v| v.as_str())
            .map(String::from);

        let model = val
            .get("model")
            .and_then(|v| v.as_str())
            .map(String::from);

        let message_count = val
            .get("messageCount")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;

        // Deduplication: check if this session was imported from another agent
        let source_agent = val
            .get("importedFrom")
            .and_then(|imp| imp.get("source"))
            .and_then(|v| v.as_str())
            .map(String::from);

        let file_mtime = std::fs::metadata(path)
            .and_then(|m| m.modified())
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
            .unwrap_or(0);

        // Extract first user message as summary from conversation.jsonl
        let summary = {
            let parent = std::path::Path::new(path).parent();
            let conv_path = parent.map(|p| p.join("conversation.jsonl"));
            conv_path
                .and_then(|cp| std::fs::read_to_string(&cp).ok())
                .and_then(|content| {
                    content.lines().find_map(|line| {
                        let v: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
                        if v["role"].as_str() == Some("user") {
                            let text = v["content"].as_str()?;
                            Some(truncate_summary(text))
                        } else {
                            None
                        }
                    })
                })
        };

        let session = IndexedSession {
            id: 0,
            agent_id: "autohand".into(),
            original_id: session_id,
            source_agent: source_agent.clone(),
            session_start: created_at,
            session_end: closed_at,
            project_path,
            model,
            message_count,
            source_file: path.to_string(),
            source_file_mtime: file_mtime,
            summary,
        };

        Ok(ParseResult {
            sessions: vec![session],
        })
    }
}
