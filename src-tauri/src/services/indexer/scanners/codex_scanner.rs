use crate::models::indexer::IndexedSession;
use crate::services::indexer::scanner::{AgentScanner, DiscoveredFile, ParseResult, truncate_summary};
use async_trait::async_trait;
use std::path::PathBuf;

pub struct CodexScanner {
    home: PathBuf,
}

impl CodexScanner {
    pub fn new() -> Self {
        let home = dirs::home_dir()
            .unwrap_or_default()
            .join(".codex");
        Self { home }
    }
}

#[async_trait]
impl AgentScanner for CodexScanner {
    fn agent_id(&self) -> &str {
        "codex"
    }

    fn display_name(&self) -> &str {
        "Codex"
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
        // Structure: sessions/YYYY/MM/DD/rollout-*.jsonl
        walk_jsonl_files(&sessions_dir, &mut files);
        Ok(files)
    }

    async fn parse_file(&self, path: &str) -> Result<ParseResult, String> {
        let content = tokio::fs::read_to_string(path)
            .await
            .map_err(|e| format!("Failed to read {}: {}", path, e))?;

        let file_mtime = std::fs::metadata(path)
            .and_then(|m| m.modified())
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
            .unwrap_or(0);

        let mut session_id: Option<String> = None;
        let mut session_start: Option<i64> = None;
        let mut session_end: Option<i64> = None;
        let mut cwd: Option<String> = None;
        let mut model: Option<String> = None;
        let mut message_count: u32 = 0;
        let mut summary: Option<String> = None;

        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                let entry_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");

                match entry_type {
                    "session_meta" => {
                        if let Some(payload) = val.get("payload") {
                            session_id = payload.get("id").and_then(|v| v.as_str()).map(String::from);
                            cwd = payload.get("cwd").and_then(|v| v.as_str()).map(String::from);

                            if let Some(ts_str) = payload.get("timestamp").and_then(|v| v.as_str()) {
                                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                                    session_start = Some(dt.timestamp());
                                }
                            }
                        }
                    }
                    "item_created" => {
                        // Count user and assistant messages
                        if let Some(item) = val.get("payload").and_then(|p| p.get("item")) {
                            let role = item.get("role").and_then(|r| r.as_str()).unwrap_or("");
                            if role == "user" || role == "assistant" {
                                message_count += 1;
                            }
                            // Extract first user message as summary
                            if summary.is_none() && role == "user" {
                                if let Some(content_arr) = item.get("content").and_then(|c| c.as_array()) {
                                    if let Some(text) = content_arr.iter().find_map(|b| b["text"].as_str()) {
                                        summary = Some(truncate_summary(text));
                                    }
                                }
                            }
                            // Extract model from assistant responses
                            if model.is_none() {
                                if let Some(m) = item.get("model").and_then(|m| m.as_str()) {
                                    model = Some(m.to_string());
                                }
                            }
                        }
                    }
                    _ => {}
                }

                // Track latest timestamp for session_end
                if let Some(ts_str) = val.get("timestamp").and_then(|t| t.as_str()) {
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts_str) {
                        let ts = dt.timestamp();
                        if session_end.is_none() || ts > session_end.unwrap() {
                            session_end = Some(ts);
                        }
                    }
                }
            }
        }

        let original_id = session_id.unwrap_or_else(|| {
            PathBuf::from(path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path.to_string())
        });

        if message_count == 0 && session_start.is_none() {
            return Ok(ParseResult { sessions: vec![] });
        }

        let sessions = vec![IndexedSession {
            id: 0,
            agent_id: "codex".into(),
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
}

fn walk_jsonl_files(dir: &std::path::Path, files: &mut Vec<DiscoveredFile>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_jsonl_files(&path, files);
        } else if path.extension().map_or(false, |e| e == "jsonl") {
            if let Ok(meta) = std::fs::metadata(&path) {
                let mtime = meta
                    .modified()
                    .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
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
