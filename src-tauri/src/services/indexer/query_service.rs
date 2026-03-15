use crate::models::dashboard::{DashboardAgentInfo, DashboardStats};
use crate::services::dashboard_service::{compute_streaks, count_memory_files};
use crate::services::indexer::db::IndexDb;

/// Get dashboard stats from the SQLite index database
pub fn get_dashboard_stats_from_db(
    db: &IndexDb,
    days: u32,
    project_paths: &[String],
) -> Result<DashboardStats, String> {
    let total_messages = db.get_total_messages()? as usize;
    let total_sessions = db.get_total_sessions()? as usize;
    let total_tokens = db.get_total_tokens()?;
    let agents_used = db.get_agents_used()?;
    let daily_activity = db.get_daily_activity(days)?;
    let (current_streak, longest_streak) = compute_streaks(&daily_activity);
    let memory_files_count = count_memory_files(project_paths);
    let available_agents = get_available_agents();

    Ok(DashboardStats {
        total_messages,
        total_sessions,
        total_tokens,
        agents_used,
        daily_activity,
        current_streak,
        longest_streak,
        memory_files_count,
        available_agents,
    })
}

fn get_available_agents() -> Vec<DashboardAgentInfo> {
    let agents = ["claude", "codex", "gemini", "ollama"];
    agents
        .iter()
        .map(|name| {
            let available = which::which(name).is_ok();
            DashboardAgentInfo {
                name: name.to_string(),
                available,
                version: None,
            }
        })
        .collect()
}
