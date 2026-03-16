use crate::models::indexer::{DailyAgentStats, IndexedSession};
use crate::services::indexer::scanner::{AgentScanner, DiscoveredFile, ParseResult, truncate_summary};
use async_trait::async_trait;
use std::path::PathBuf;

pub struct ClaudeScanner {
    home: PathBuf,
}

impl ClaudeScanner {
    pub fn new() -> Self {
        let home = dirs::home_dir()
            .unwrap_or_default()
            .join(".claude");
        Self { home }
    }
}

#[async_trait]
impl AgentScanner for ClaudeScanner {
    fn agent_id(&self) -> &str {
        "claude"
    }

    fn display_name(&self) -> &str {
        "Claude"
    }

    fn home_dir(&self) -> String {
        self.home.to_string_lossy().to_string()
    }

    fn is_available(&self) -> bool {
        self.home.exists()
    }

    async fn discover_files(&self) -> Result<Vec<DiscoveredFile>, String> {
        let mut files = Vec::new();

        // stats-cache.json is the primary source for daily aggregates
        let stats_path = self.home.join("stats-cache.json");
        if stats_path.exists() {
            if let Ok(meta) = std::fs::metadata(&stats_path) {
                let mtime = meta
                    .modified()
                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
                    .unwrap_or(0);
                files.push(DiscoveredFile {
                    path: stats_path.to_string_lossy().to_string(),
                    mtime,
                    size: meta.len(),
                });
            }
        }

        // Scan projects/*/JSONL for per-session data
        let projects_dir = self.home.join("projects");
        if projects_dir.exists() {
            if let Ok(entries) = std::fs::read_dir(&projects_dir) {
                for entry in entries.flatten() {
                    let project_dir = entry.path();
                    if !project_dir.is_dir() {
                        continue;
                    }
                    if let Ok(sub_entries) = std::fs::read_dir(&project_dir) {
                        for sub_entry in sub_entries.flatten() {
                            let path = sub_entry.path();
                            if path.extension().map_or(false, |e| e == "jsonl") {
                                if let Ok(meta) = std::fs::metadata(&path) {
                                    let mtime = meta
                                        .modified()
                                        .map(|t| {
                                            t.duration_since(std::time::UNIX_EPOCH)
                                                .unwrap_or_default()
                                                .as_secs() as i64
                                        })
                                        .unwrap_or(0);
                                    files.push(DiscoveredFile {
                                        path: path.to_string_lossy().to_string(),
                                        mtime,
                                        size: meta.len(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(files)
    }

    async fn parse_file(&self, path: &str) -> Result<ParseResult, String> {
        let path_buf = PathBuf::from(path);

        // stats-cache.json is handled via parse_aggregate_stats
        if path_buf.file_name().map_or(false, |n| n == "stats-cache.json") {
            return Ok(ParseResult { sessions: vec![] });
        }

        // Parse JSONL transcript files from projects/
        let content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| format!("Failed to read {}: {}", path, e))?;

        let file_mtime = std::fs::metadata(path)
            .and_then(|m| m.modified())
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
            .unwrap_or(0);

        // Extract session info from JSONL
        // Claude JSONL files have one session per file, with conversation turns as lines
        let mut message_count: u32 = 0;
        let mut session_start: Option<i64> = None;
        let mut session_end: Option<i64> = None;
        let mut model: Option<String> = None;
        let mut cwd: Option<String> = None;
        let mut summary: Option<String> = None;

        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                let msg_type = val.get("type").and_then(|t| t.as_str());
                // Count messages
                if msg_type == Some("human")
                    || msg_type == Some("assistant")
                    || msg_type == Some("user")
                    || val.get("role").and_then(|r| r.as_str()).is_some()
                {
                    message_count += 1;
                }

                // Extract first user message as summary
                if summary.is_none()
                    && (msg_type == Some("human") || msg_type == Some("user"))
                {
                    // Content may be string or array of {type:"text", text:"..."} blocks
                    let content_val = val
                        .get("message")
                        .and_then(|m| m.get("content"))
                        .or_else(|| val.get("content"));
                    if let Some(cv) = content_val {
                        let text = match cv {
                            serde_json::Value::String(s) => s.clone(),
                            serde_json::Value::Array(arr) => {
                                arr.iter()
                                    .filter_map(|b| {
                                        if b["type"].as_str() == Some("text") {
                                            b["text"].as_str().map(String::from)
                                        } else {
                                            None
                                        }
                                    })
                                    .next()
                                    .unwrap_or_default()
                            }
                            _ => String::new(),
                        };
                        if !text.is_empty() {
                            summary = Some(truncate_summary(&text));
                        }
                    }
                }

                // Extract timestamp
                if let Some(ts_str) = val.get("timestamp").and_then(|t| t.as_str()) {
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                        let ts = dt.timestamp();
                        if session_start.is_none() || ts < session_start.unwrap() {
                            session_start = Some(ts);
                        }
                        if session_end.is_none() || ts > session_end.unwrap() {
                            session_end = Some(ts);
                        }
                    }
                }

                // Extract model
                if model.is_none() {
                    if let Some(m) = val.get("model").and_then(|m| m.as_str()) {
                        model = Some(m.to_string());
                    }
                }

                // Extract cwd
                if cwd.is_none() {
                    if let Some(c) = val.get("cwd").and_then(|c| c.as_str()) {
                        cwd = Some(c.to_string());
                    }
                }
            }
        }

        if message_count == 0 {
            return Ok(ParseResult { sessions: vec![] });
        }

        // Use filename as original_id
        let original_id = path_buf
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());

        let sessions = vec![IndexedSession {
            id: 0,
            agent_id: "claude".into(),
            original_id,
            source_agent: None,
            session_start: session_start.unwrap_or(file_mtime),
            session_end,
            project_path: cwd,
            model,
            message_count,
            source_file: path.to_string(),
            source_file_mtime: file_mtime,
            summary,
        }];

        Ok(ParseResult { sessions })
    }

    async fn parse_aggregate_stats(&self) -> Option<Vec<DailyAgentStats>> {
        let stats_path = self.home.join("stats-cache.json");
        if !stats_path.exists() {
            return None;
        }

        let content = tokio::fs::read_to_string(&stats_path).await.ok()?;
        let val: serde_json::Value = serde_json::from_str(&content).ok()?;

        let daily = val.get("dailyActivity")?.as_array()?;
        let mut stats = Vec::new();

        for entry in daily {
            let date = entry.get("date")?.as_str()?;
            let message_count = entry.get("messageCount").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let session_count = entry.get("sessionCount").and_then(|v| v.as_u64()).unwrap_or(0) as u32;

            stats.push(DailyAgentStats {
                date: date.to_string(),
                agent_id: "claude".into(),
                message_count,
                session_count,
                total_tokens: 0,
            });
        }

        Some(stats)
    }
}
