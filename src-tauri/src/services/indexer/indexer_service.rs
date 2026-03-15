use crate::models::indexer::{AgentRecord, ScanRecord};
use crate::services::indexer::db::IndexDb;
use crate::services::indexer::scanner::AgentScanner;
use crate::services::indexer::scanners::build_scanner_registry;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

static IS_RUNNING: AtomicBool = AtomicBool::new(false);
static LAST_ERROR: once_cell::sync::Lazy<std::sync::Mutex<Option<String>>> =
    once_cell::sync::Lazy::new(|| std::sync::Mutex::new(None));

pub fn is_indexer_running() -> bool {
    IS_RUNNING.load(Ordering::Relaxed)
}

pub fn last_indexer_error() -> Option<String> {
    LAST_ERROR.lock().ok().and_then(|e| e.clone())
}

/// Run the indexer loop: full scan on startup, then incremental every 3 minutes.
/// Emits "indexer://scan-complete" event to the frontend after each scan.
pub async fn run_indexer_loop(db: Arc<IndexDb>, app_handle: tauri::AppHandle) {
    let scanners = build_scanner_registry();

    // Initial full scan
    IS_RUNNING.store(true, Ordering::Relaxed);
    match run_parallel_scan(&db, &scanners).await {
        Ok(_) => {
            if let Ok(mut err) = LAST_ERROR.lock() {
                *err = None;
            }
        }
        Err(e) => {
            eprintln!("[indexer] Initial scan error: {}", e);
            if let Ok(mut err) = LAST_ERROR.lock() {
                *err = Some(e);
            }
        }
    }
    IS_RUNNING.store(false, Ordering::Relaxed);
    let _ = app_handle.emit("indexer://scan-complete", ());

    // Periodic incremental scans
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(180)).await;

        IS_RUNNING.store(true, Ordering::Relaxed);
        match run_parallel_scan(&db, &scanners).await {
            Ok(_) => {
                if let Ok(mut err) = LAST_ERROR.lock() {
                    *err = None;
                }
            }
            Err(e) => {
                eprintln!("[indexer] Scan error: {}", e);
                if let Ok(mut err) = LAST_ERROR.lock() {
                    *err = Some(e);
                }
            }
        }
        IS_RUNNING.store(false, Ordering::Relaxed);
        let _ = app_handle.emit("indexer://scan-complete", ());
    }
}

/// Trigger a one-off re-index
pub async fn trigger_reindex(db: Arc<IndexDb>) -> Result<(), String> {
    let scanners = build_scanner_registry();
    IS_RUNNING.store(true, Ordering::Relaxed);
    let result = run_parallel_scan(&db, &scanners).await;
    IS_RUNNING.store(false, Ordering::Relaxed);
    result
}

/// Scan all agents in parallel using tokio tasks, then write results to db sequentially.
/// This avoids holding the db lock across async boundaries while maximizing I/O parallelism.
async fn run_parallel_scan(
    db: &IndexDb,
    scanners: &[Box<dyn AgentScanner>],
) -> Result<(), String> {
    for scanner in scanners {
        if !scanner.is_available() {
            continue;
        }

        // Register agent (lightweight, ok to do sequentially)
        db.upsert_agent(&AgentRecord {
            id: scanner.agent_id().to_string(),
            display_name: scanner.display_name().to_string(),
            home_dir: scanner.home_dir(),
            enabled: true,
        })?;

        // Gather aggregate stats + discover + parse in parallel per agent.
        // Since AgentScanner is not Clone/Send across spawn boundaries easily,
        // we do discovery and parsing inline but use tokio::spawn for file I/O.
        let agent_id = scanner.agent_id().to_string();

        // Ingest pre-aggregated daily stats (e.g., Claude stats-cache.json)
        if let Some(daily_stats) = scanner.parse_aggregate_stats().await {
            for stats in &daily_stats {
                db.upsert_daily_stats(stats)?;
            }
        }

        // Discover files
        let discovered = match scanner.discover_files().await {
            Ok(files) => files,
            Err(e) => {
                // macOS permission denied or directory not readable - skip gracefully
                eprintln!(
                    "[indexer] Cannot read {} data (permission denied?): {}",
                    agent_id, e
                );
                continue;
            }
        };

        let active_files: Vec<String> = discovered.iter().map(|f| f.path.clone()).collect();

        // Parse files concurrently using tokio::spawn for I/O parallelism
        let mut parse_handles = Vec::new();
        for file in discovered {
            // Check if file has changed since last scan (skip unchanged)
            if let Ok(Some(existing)) = db.get_scan_record(&file.path, &agent_id) {
                if existing.file_mtime == file.mtime && existing.file_size == file.size {
                    continue;
                }
            }

            let file_path = file.path.clone();
            let aid = agent_id.clone();
            let mtime = file.mtime;
            let size = file.size;

            // Spawn file parsing as a tokio task for I/O parallelism
            let handle = tokio::spawn(async move {
                let content = match tokio::fs::read_to_string(&file_path).await {
                    Ok(c) => c,
                    Err(e) => {
                        // Permission denied on individual file - skip it
                        if e.kind() == std::io::ErrorKind::PermissionDenied {
                            eprintln!(
                                "[indexer] Permission denied reading {}, skipping",
                                file_path
                            );
                        }
                        return (aid, file_path, mtime, size, None);
                    }
                };
                (aid, file_path, mtime, size, Some(content))
            });
            parse_handles.push((handle, scanner));
        }

        // Collect parsed results and write to db
        for (handle, scanner) in parse_handles {
            if let Ok((aid, file_path, mtime, size, maybe_content)) = handle.await {
                if maybe_content.is_none() {
                    continue; // File read failed, skip
                }

                // Parse via scanner
                match scanner.parse_file(&file_path).await {
                    Ok(result) => {
                        for session in &result.sessions {
                            // Deduplication for autohand imports
                            if let Some(ref src_agent) = session.source_agent {
                                if let Ok(true) =
                                    db.session_exists(src_agent, &session.original_id)
                                {
                                    continue;
                                }
                            }
                            db.upsert_session(session)?;
                        }

                        db.upsert_scan_record(&ScanRecord {
                            source_file: file_path,
                            agent_id: aid,
                            file_mtime: mtime,
                            file_size: size,
                        })?;
                    }
                    Err(e) => {
                        eprintln!("[indexer] Failed to parse {}: {}", file_path, e);
                    }
                }
            }
        }

        // Cleanup orphaned records for this agent
        if !active_files.is_empty() {
            let _ = db.remove_orphaned_sessions(&agent_id, &active_files);
            let _ = db.remove_scan_records_for_agent(&agent_id, &active_files);
        }
    }

    Ok(())
}
