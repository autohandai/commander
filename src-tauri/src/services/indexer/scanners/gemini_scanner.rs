use crate::models::indexer::IndexedSession;
use crate::services::indexer::scanner::{AgentScanner, DiscoveredFile, ParseResult};
use async_trait::async_trait;
use std::path::PathBuf;

pub struct GeminiScanner {
    home: PathBuf,
}

impl GeminiScanner {
    pub fn new() -> Self {
        let home = dirs::home_dir()
            .unwrap_or_default()
            .join(".gemini");
        Self { home }
    }
}

#[async_trait]
impl AgentScanner for GeminiScanner {
    fn agent_id(&self) -> &str {
        "gemini"
    }

    fn display_name(&self) -> &str {
        "Gemini"
    }

    fn home_dir(&self) -> String {
        self.home.to_string_lossy().to_string()
    }

    fn is_available(&self) -> bool {
        self.home.join("antigravity").join("conversations").exists()
    }

    async fn discover_files(&self) -> Result<Vec<DiscoveredFile>, String> {
        let conv_dir = self.home.join("antigravity").join("conversations");
        if !conv_dir.exists() {
            return Ok(vec![]);
        }

        let mut files = Vec::new();
        let entries = std::fs::read_dir(&conv_dir)
            .map_err(|e| format!("Failed to read gemini conversations dir: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "pb") {
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

        Ok(files)
    }

    async fn parse_file(&self, path: &str) -> Result<ParseResult, String> {
        // Protobuf files cannot be meaningfully parsed without the schema.
        // We treat each .pb file as one session with file-count = 1 message.
        let path_buf = PathBuf::from(path);
        let file_mtime = std::fs::metadata(path)
            .and_then(|m| m.modified())
            .map(|t| t.duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() as i64)
            .unwrap_or(0);

        let original_id = path_buf
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());

        let session = IndexedSession {
            id: 0,
            agent_id: "gemini".into(),
            original_id,
            source_agent: None,
            session_start: file_mtime,
            session_end: None,
            project_path: None,
            model: None,
            message_count: 1, // We know it's a conversation but can't parse protobuf
            source_file: path.to_string(),
            source_file_mtime: file_mtime,
            summary: None, // Protobuf files can't be parsed for summary
        };

        Ok(ParseResult {
            sessions: vec![session],
        })
    }
}
