use crate::models::indexer::{
    AgentRecord, DailyAgentStats, IndexedSession, ScanRecord,
};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Mutex;

pub struct IndexDb {
    conn: Mutex<Connection>,
}

impl IndexDb {
    pub fn open(db_path: &Path) -> Result<Self, String> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create db dir: {}", e))?;
        }
        let conn =
            Connection::open(db_path).map_err(|e| format!("Failed to open database: {}", e))?;

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| format!("Failed to set pragmas: {}", e))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.init_schema()?;
        Ok(db)
    }

    fn init_schema(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY
            );

            CREATE TABLE IF NOT EXISTS agents (
                id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                home_dir TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                original_id TEXT NOT NULL,
                source_agent TEXT,
                session_start INTEGER NOT NULL,
                session_end INTEGER,
                project_path TEXT,
                model TEXT,
                message_count INTEGER NOT NULL DEFAULT 0,
                source_file TEXT NOT NULL,
                source_file_mtime INTEGER NOT NULL DEFAULT 0,
                summary TEXT,
                UNIQUE(agent_id, original_id)
            );

            CREATE TABLE IF NOT EXISTS daily_stats (
                date TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                message_count INTEGER NOT NULL DEFAULT 0,
                session_count INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (date, agent_id)
            );

            CREATE TABLE IF NOT EXISTS scan_metadata (
                source_file TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                file_mtime INTEGER NOT NULL,
                file_size INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (source_file, agent_id)
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(session_start);
            CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);
            CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);",
        )
        .map_err(|e| format!("Failed to init schema: {}", e))?;

        // Set initial schema version
        conn.execute(
            "INSERT OR IGNORE INTO schema_version (version) VALUES (?1)",
            params![1],
        )
        .map_err(|e| format!("Failed to set schema version: {}", e))?;

        // Migration: add summary column if missing (v2)
        let has_summary: bool = conn
            .prepare("SELECT summary FROM sessions LIMIT 0")
            .is_ok();
        if !has_summary {
            conn.execute_batch("ALTER TABLE sessions ADD COLUMN summary TEXT;")
                .map_err(|e| format!("Failed to add summary column: {}", e))?;
        }

        // Force re-scan of sessions that are missing a summary so the indexer
        // can populate the field from the source files.
        conn.execute_batch(
            "DELETE FROM scan_metadata WHERE source_file IN (
                SELECT DISTINCT source_file FROM sessions WHERE summary IS NULL
            )",
        )
        .map_err(|e| format!("Failed to clear stale scan records: {}", e))?;

        Ok(())
    }

    // --- Agent operations ---

    pub fn upsert_agent(&self, agent: &AgentRecord) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "INSERT INTO agents (id, display_name, home_dir, enabled)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
                display_name = excluded.display_name,
                home_dir = excluded.home_dir,
                enabled = excluded.enabled",
            params![agent.id, agent.display_name, agent.home_dir, agent.enabled],
        )
        .map_err(|e| format!("Failed to upsert agent: {}", e))?;
        Ok(())
    }

    // --- Session operations ---

    pub fn upsert_session(&self, session: &IndexedSession) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "INSERT INTO sessions (agent_id, original_id, source_agent, session_start, session_end, project_path, model, message_count, source_file, source_file_mtime, summary)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
             ON CONFLICT(agent_id, original_id) DO UPDATE SET
                session_start = excluded.session_start,
                session_end = excluded.session_end,
                project_path = excluded.project_path,
                model = excluded.model,
                message_count = excluded.message_count,
                source_file = excluded.source_file,
                source_file_mtime = excluded.source_file_mtime,
                summary = excluded.summary",
            params![
                session.agent_id,
                session.original_id,
                session.source_agent,
                session.session_start,
                session.session_end,
                session.project_path,
                session.model,
                session.message_count,
                session.source_file,
                session.source_file_mtime,
                session.summary,
            ],
        )
        .map_err(|e| format!("Failed to upsert session: {}", e))?;
        Ok(())
    }

    /// Check if a session already exists for the given source_agent + original_id
    /// Used for deduplication (e.g., autohand imports from claude/codex)
    pub fn session_exists(&self, agent_id: &str, original_id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sessions WHERE agent_id = ?1 AND original_id = ?2",
                params![agent_id, original_id],
                |row| row.get(0),
            )
            .map_err(|e| format!("Failed to check session: {}", e))?;
        Ok(count > 0)
    }

    /// Remove sessions whose source_file no longer exists (cleanup deleted files)
    pub fn remove_orphaned_sessions(&self, agent_id: &str, active_files: &[String]) -> Result<u64, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        if active_files.is_empty() {
            return Ok(0);
        }
        let placeholders: String = active_files.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "DELETE FROM sessions WHERE agent_id = ?1 AND source_file NOT IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| format!("Prepare error: {}", e))?;
        let mut param_idx = 1;
        stmt.raw_bind_parameter(param_idx, agent_id)
            .map_err(|e| format!("Bind error: {}", e))?;
        for file in active_files {
            param_idx += 1;
            stmt.raw_bind_parameter(param_idx, file)
                .map_err(|e| format!("Bind error: {}", e))?;
        }
        let deleted = stmt.raw_execute().map_err(|e| format!("Delete error: {}", e))?;
        Ok(deleted as u64)
    }

    /// Query sessions filtered by project path and/or agent, with pagination
    pub fn get_sessions_for_project(
        &self,
        project_path: Option<&str>,
        agent_filter: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<IndexedSession>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let mut stmt = conn
            .prepare(
                "SELECT id, agent_id, original_id, source_agent, session_start, session_end,
                        project_path, model, message_count, source_file, source_file_mtime, summary
                 FROM sessions
                 WHERE (?1 IS NULL OR project_path = ?1)
                   AND (?2 IS NULL OR agent_id = ?2)
                 ORDER BY session_start DESC
                 LIMIT ?3 OFFSET ?4",
            )
            .map_err(|e| format!("Prepare error: {}", e))?;

        let rows = stmt
            .query_map(params![project_path, agent_filter, limit as i64, offset as i64], |row| {
                Ok(IndexedSession {
                    id: row.get(0)?,
                    agent_id: row.get(1)?,
                    original_id: row.get(2)?,
                    source_agent: row.get(3)?,
                    session_start: row.get(4)?,
                    session_end: row.get(5)?,
                    project_path: row.get(6)?,
                    model: row.get(7)?,
                    message_count: row.get(8)?,
                    source_file: row.get(9)?,
                    source_file_mtime: row.get(10)?,
                    summary: row.get(11)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(results)
    }

    // --- Daily stats operations ---

    pub fn upsert_daily_stats(&self, stats: &DailyAgentStats) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "INSERT INTO daily_stats (date, agent_id, message_count, session_count, total_tokens)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(date, agent_id) DO UPDATE SET
                message_count = excluded.message_count,
                session_count = excluded.session_count,
                total_tokens = excluded.total_tokens",
            params![
                stats.date,
                stats.agent_id,
                stats.message_count,
                stats.session_count,
                stats.total_tokens,
            ],
        )
        .map_err(|e| format!("Failed to upsert daily stats: {}", e))?;
        Ok(())
    }

    // --- Scan metadata operations ---

    pub fn get_scan_record(&self, source_file: &str, agent_id: &str) -> Result<Option<ScanRecord>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let result = conn
            .query_row(
                "SELECT source_file, agent_id, file_mtime, file_size FROM scan_metadata
                 WHERE source_file = ?1 AND agent_id = ?2",
                params![source_file, agent_id],
                |row| {
                    Ok(ScanRecord {
                        source_file: row.get(0)?,
                        agent_id: row.get(1)?,
                        file_mtime: row.get(2)?,
                        file_size: row.get(3)?,
                    })
                },
            )
            .optional()
            .map_err(|e| format!("Failed to get scan record: {}", e))?;
        Ok(result)
    }

    pub fn upsert_scan_record(&self, record: &ScanRecord) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        conn.execute(
            "INSERT INTO scan_metadata (source_file, agent_id, file_mtime, file_size)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(source_file, agent_id) DO UPDATE SET
                file_mtime = excluded.file_mtime,
                file_size = excluded.file_size",
            params![
                record.source_file,
                record.agent_id,
                record.file_mtime,
                record.file_size,
            ],
        )
        .map_err(|e| format!("Failed to upsert scan record: {}", e))?;
        Ok(())
    }

    pub fn remove_scan_records_for_agent(&self, agent_id: &str, active_files: &[String]) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        if active_files.is_empty() {
            return Ok(());
        }
        let placeholders: String = active_files.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "DELETE FROM scan_metadata WHERE agent_id = ?1 AND source_file NOT IN ({})",
            placeholders
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| format!("Prepare error: {}", e))?;
        let mut param_idx = 1;
        stmt.raw_bind_parameter(param_idx, agent_id)
            .map_err(|e| format!("Bind error: {}", e))?;
        for file in active_files {
            param_idx += 1;
            stmt.raw_bind_parameter(param_idx, file)
                .map_err(|e| format!("Bind error: {}", e))?;
        }
        stmt.raw_execute().map_err(|e| format!("Delete error: {}", e))?;
        Ok(())
    }

    // --- Query operations for dashboard ---

    pub fn get_total_sessions(&self) -> Result<u64, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
            .map_err(|e| format!("Query error: {}", e))?;
        Ok(count as u64)
    }

    pub fn get_total_messages(&self) -> Result<u64, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let sum: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(message_count), 0) FROM sessions",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("Query error: {}", e))?;
        Ok(sum as u64)
    }

    pub fn get_total_tokens(&self) -> Result<u64, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let sum: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(total_tokens), 0) FROM daily_stats",
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("Query error: {}", e))?;
        Ok(sum as u64)
    }

    pub fn get_agents_used(&self) -> Result<std::collections::HashMap<String, usize>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let mut stmt = conn
            .prepare("SELECT agent_id, COUNT(*) FROM sessions GROUP BY agent_id")
            .map_err(|e| format!("Prepare error: {}", e))?;
        let mut map = std::collections::HashMap::new();
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|e| format!("Query error: {}", e))?;
        for row in rows {
            let (agent, count) = row.map_err(|e| format!("Row error: {}", e))?;
            map.insert(agent, count as usize);
        }
        Ok(map)
    }

    /// Get daily activity for the last N days, aggregated from daily_stats + sessions
    pub fn get_daily_activity(&self, days: u32) -> Result<Vec<crate::models::dashboard::DailyActivity>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        // Get the start date
        let today = chrono::Utc::now().date_naive();
        let start = today - chrono::Duration::days(days as i64 - 1);
        let start_str = start.format("%Y-%m-%d").to_string();

        // First try daily_stats table (has pre-aggregated data from Claude stats-cache)
        let mut stmt = conn
            .prepare(
                "SELECT date, SUM(message_count) as msgs, SUM(total_tokens) as tokens
                 FROM daily_stats
                 WHERE date >= ?1
                 GROUP BY date",
            )
            .map_err(|e| format!("Prepare error: {}", e))?;

        let mut day_map: std::collections::HashMap<String, (usize, u64)> = std::collections::HashMap::new();

        // Fill all days with zeros
        let mut d = start;
        while d <= today {
            day_map.insert(d.format("%Y-%m-%d").to_string(), (0, 0));
            d += chrono::Duration::days(1);
        }

        // Overlay daily_stats
        let rows = stmt
            .query_map(params![start_str], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })
            .map_err(|e| format!("Query error: {}", e))?;
        for row in rows {
            let (date, msgs, tokens) = row.map_err(|e| format!("Row error: {}", e))?;
            if let Some(entry) = day_map.get_mut(&date) {
                entry.0 = msgs as usize;
                entry.1 = tokens as u64;
            }
        }

        // Also aggregate from sessions table for agents without daily_stats
        let mut stmt2 = conn
            .prepare(
                "SELECT DATE(session_start, 'unixepoch') as d, SUM(message_count)
                 FROM sessions
                 WHERE session_start >= ?1
                   AND agent_id NOT IN (SELECT DISTINCT agent_id FROM daily_stats WHERE date >= ?2)
                 GROUP BY d",
            )
            .map_err(|e| format!("Prepare error: {}", e))?;

        let start_ts = start
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp();

        let rows2 = stmt2
            .query_map(params![start_ts, start_str], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|e| format!("Query error: {}", e))?;
        for row in rows2 {
            let (date, msgs) = row.map_err(|e| format!("Row error: {}", e))?;
            if let Some(entry) = day_map.get_mut(&date) {
                entry.0 += msgs as usize;
            }
        }

        let mut result: Vec<crate::models::dashboard::DailyActivity> = day_map
            .into_iter()
            .map(|(date, (count, tokens))| crate::models::dashboard::DailyActivity {
                date,
                message_count: count,
                token_count: tokens,
            })
            .collect();
        result.sort_by(|a, b| a.date.cmp(&b.date));
        Ok(result)
    }

    pub fn get_indexed_agents(&self) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;
        let mut stmt = conn
            .prepare("SELECT DISTINCT agent_id FROM sessions")
            .map_err(|e| format!("Prepare error: {}", e))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| format!("Query error: {}", e))?;
        let mut agents = Vec::new();
        for row in rows {
            agents.push(row.map_err(|e| format!("Row error: {}", e))?);
        }
        Ok(agents)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_db() -> (IndexDb, TempDir) {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let db = IndexDb::open(&db_path).unwrap();
        (db, dir)
    }

    #[test]
    fn test_open_and_init_schema() {
        let (db, _dir) = test_db();
        assert_eq!(db.get_total_sessions().unwrap(), 0);
    }

    #[test]
    fn test_upsert_agent() {
        let (db, _dir) = test_db();
        let agent = AgentRecord {
            id: "claude".into(),
            display_name: "Claude".into(),
            home_dir: "/home/user/.claude".into(),
            enabled: true,
        };
        db.upsert_agent(&agent).unwrap();
        // Upsert again should not fail
        db.upsert_agent(&agent).unwrap();
    }

    #[test]
    fn test_upsert_and_query_session() {
        let (db, _dir) = test_db();
        let session = IndexedSession {
            id: 0,
            agent_id: "claude".into(),
            original_id: "sess-001".into(),
            source_agent: None,
            session_start: 1709600000,
            session_end: Some(1709603600),
            project_path: Some("/projects/test".into()),
            model: Some("opus".into()),
            message_count: 42,
            source_file: "/home/.claude/projects/test.jsonl".into(),
            source_file_mtime: 1709600000,
            summary: None,
        };
        db.upsert_session(&session).unwrap();
        assert_eq!(db.get_total_sessions().unwrap(), 1);
        assert_eq!(db.get_total_messages().unwrap(), 42);
        assert!(db.session_exists("claude", "sess-001").unwrap());
        assert!(!db.session_exists("claude", "sess-999").unwrap());
    }

    #[test]
    fn test_upsert_daily_stats() {
        let (db, _dir) = test_db();
        let stats = DailyAgentStats {
            date: "2026-03-04".into(),
            agent_id: "claude".into(),
            message_count: 100,
            session_count: 5,
            total_tokens: 50000,
        };
        db.upsert_daily_stats(&stats).unwrap();
        assert_eq!(db.get_total_tokens().unwrap(), 50000);
    }

    #[test]
    fn test_scan_record_round_trip() {
        let (db, _dir) = test_db();
        let record = ScanRecord {
            source_file: "/test/file.jsonl".into(),
            agent_id: "codex".into(),
            file_mtime: 1709600000,
            file_size: 4096,
        };
        db.upsert_scan_record(&record).unwrap();
        let fetched = db.get_scan_record("/test/file.jsonl", "codex").unwrap();
        assert!(fetched.is_some());
        let fetched = fetched.unwrap();
        assert_eq!(fetched.file_mtime, 1709600000);
        assert_eq!(fetched.file_size, 4096);
    }

    #[test]
    fn test_agents_used_aggregation() {
        let (db, _dir) = test_db();
        for i in 0..3 {
            db.upsert_session(&IndexedSession {
                id: 0,
                agent_id: "claude".into(),
                original_id: format!("s-{}", i),
                source_agent: None,
                session_start: 1709600000 + i,
                session_end: None,
                project_path: None,
                model: None,
                message_count: 10,
                source_file: format!("/file-{}.jsonl", i),
                source_file_mtime: 0,
                summary: None,
            })
            .unwrap();
        }
        db.upsert_session(&IndexedSession {
            id: 0,
            agent_id: "codex".into(),
            original_id: "s-0".into(),
            source_agent: None,
            session_start: 1709600000,
            session_end: None,
            project_path: None,
            model: None,
            message_count: 5,
            source_file: "/codex-file.jsonl".into(),
            source_file_mtime: 0,
            summary: None,
        })
        .unwrap();

        let used = db.get_agents_used().unwrap();
        assert_eq!(used["claude"], 3);
        assert_eq!(used["codex"], 1);
    }

    #[test]
    fn test_get_sessions_for_project_no_filter() {
        let (db, _dir) = test_db();
        // Insert sessions with different project paths
        for i in 0..3 {
            db.upsert_session(&IndexedSession {
                id: 0,
                agent_id: "claude".into(),
                original_id: format!("proj-s-{}", i),
                source_agent: None,
                session_start: 1709600000 + i * 100,
                session_end: None,
                project_path: Some("/projects/myapp".into()),
                model: Some("opus".into()),
                message_count: 10,
                source_file: format!("/file-{}.jsonl", i),
                source_file_mtime: 0,
                summary: None,
            })
            .unwrap();
        }
        db.upsert_session(&IndexedSession {
            id: 0,
            agent_id: "codex".into(),
            original_id: "other-s-0".into(),
            source_agent: None,
            session_start: 1709600000,
            session_end: None,
            project_path: Some("/projects/other".into()),
            model: None,
            message_count: 5,
            source_file: "/other-file.jsonl".into(),
            source_file_mtime: 0,
            summary: None,
        })
        .unwrap();

        // Query all sessions (no project filter)
        let all = db.get_sessions_for_project(None, None, 100, 0).unwrap();
        assert_eq!(all.len(), 4);

        // Query by project path
        let myapp = db.get_sessions_for_project(Some("/projects/myapp"), None, 100, 0).unwrap();
        assert_eq!(myapp.len(), 3);
        assert!(myapp.iter().all(|s| s.project_path.as_deref() == Some("/projects/myapp")));

        // Query by agent
        let codex_sessions = db.get_sessions_for_project(None, Some("codex"), 100, 0).unwrap();
        assert_eq!(codex_sessions.len(), 1);
        assert_eq!(codex_sessions[0].agent_id, "codex");

        // Query by both
        let claude_myapp = db.get_sessions_for_project(Some("/projects/myapp"), Some("claude"), 100, 0).unwrap();
        assert_eq!(claude_myapp.len(), 3);
    }

    #[test]
    fn test_get_sessions_for_project_pagination() {
        let (db, _dir) = test_db();
        for i in 0..5 {
            db.upsert_session(&IndexedSession {
                id: 0,
                agent_id: "claude".into(),
                original_id: format!("pag-s-{}", i),
                source_agent: None,
                session_start: 1709600000 + i * 100,
                session_end: None,
                project_path: Some("/projects/test".into()),
                model: None,
                message_count: 1,
                source_file: format!("/pag-file-{}.jsonl", i),
                source_file_mtime: 0,
                summary: None,
            })
            .unwrap();
        }

        // Limit 2
        let page1 = db.get_sessions_for_project(Some("/projects/test"), None, 2, 0).unwrap();
        assert_eq!(page1.len(), 2);
        // They should be sorted by session_start DESC, so the first one has the highest timestamp
        assert!(page1[0].session_start > page1[1].session_start);

        // Offset 2, limit 2
        let page2 = db.get_sessions_for_project(Some("/projects/test"), None, 2, 2).unwrap();
        assert_eq!(page2.len(), 2);

        // No overlap between pages
        assert!(page1[1].session_start > page2[0].session_start);

        // Offset beyond data
        let empty = db.get_sessions_for_project(Some("/projects/test"), None, 2, 10).unwrap();
        assert!(empty.is_empty());
    }

    #[test]
    fn test_get_sessions_for_project_empty() {
        let (db, _dir) = test_db();
        let result = db.get_sessions_for_project(Some("/no/such/project"), None, 100, 0).unwrap();
        assert!(result.is_empty());
    }
}
