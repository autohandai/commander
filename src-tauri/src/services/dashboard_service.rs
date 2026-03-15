use crate::models::dashboard::DailyActivity;
use std::path::Path;

#[cfg(test)]
use crate::models::chat_history::ChatSession;
#[cfg(test)]
use chrono::{Duration, NaiveDate, Utc};
#[cfg(test)]
use std::collections::HashMap;

const MEMORY_FILES: &[&str] = &["AGENTS.md", "CLAUDE.md", "MEMORY.md", "GEMINI.md"];

#[cfg(test)]
pub fn build_daily_activity(sessions: &[ChatSession], days: u32) -> Vec<DailyActivity> {
    let today = Utc::now().date_naive();
    let start = today - Duration::days(days as i64 - 1);
    let mut day_map: HashMap<NaiveDate, (usize, u64)> = HashMap::new();
    let mut d = start;
    while d <= today {
        day_map.insert(d, (0, 0));
        d += Duration::days(1);
    }
    for session in sessions {
        if let Some(date) = chrono::DateTime::from_timestamp(session.start_time, 0) {
            let naive = date.date_naive();
            if let Some(entry) = day_map.get_mut(&naive) {
                entry.0 += session.message_count;
            }
        }
    }
    let mut result: Vec<_> = day_map
        .into_iter()
        .map(|(date, (count, tokens))| DailyActivity {
            date: date.format("%Y-%m-%d").to_string(),
            message_count: count,
            token_count: tokens,
        })
        .collect();
    result.sort_by(|a, b| a.date.cmp(&b.date));
    result
}

pub fn compute_streaks(daily_activity: &[DailyActivity]) -> (u32, u32) {
    let mut current_streak: u32 = 0;
    let mut longest_streak: u32 = 0;
    let mut running: u32 = 0;
    let mut found_gap = false;
    for day in daily_activity.iter().rev() {
        if day.message_count > 0 {
            running += 1;
            if !found_gap {
                current_streak += 1;
            }
        } else {
            if running > longest_streak {
                longest_streak = running;
            }
            running = 0;
            found_gap = true;
        }
    }
    if running > longest_streak {
        longest_streak = running;
    }
    if current_streak > longest_streak {
        longest_streak = current_streak;
    }
    (current_streak, longest_streak)
}

pub fn count_memory_files(project_paths: &[String]) -> usize {
    let mut count = 0;
    for path in project_paths {
        for filename in MEMORY_FILES {
            if Path::new(path).join(filename).exists() {
                count += 1;
            }
        }
    }
    count
}

#[cfg(test)]
pub fn merge_agent_maps(maps: &[HashMap<String, usize>]) -> HashMap<String, usize> {
    let mut merged = HashMap::new();
    for map in maps {
        for (agent, count) in map {
            *merged.entry(agent.clone()).or_insert(0) += count;
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_session(agent: &str, start: i64, msgs: usize) -> ChatSession {
        ChatSession {
            id: format!("s-{}", start),
            start_time: start,
            end_time: start + 300,
            agent: agent.to_string(),
            branch: None,
            message_count: msgs,
            summary: "test".to_string(),
            archived: false,
            custom_title: None,
            ai_summary: None,
            forked_from: None,
            source: "local".to_string(),
            source_file: None,
            model: None,
        }
    }

    #[test]
    fn test_build_daily_activity_fills_all_days() {
        let activity = build_daily_activity(&[], 7);
        assert_eq!(activity.len(), 7);
        assert!(activity.iter().all(|d| d.message_count == 0));
    }

    #[test]
    fn test_build_daily_activity_buckets_messages() {
        let now = Utc::now().timestamp();
        let sessions = vec![
            make_session("claude", now - 100, 5),
            make_session("codex", now - 50, 3),
        ];
        let activity = build_daily_activity(&sessions, 7);
        let today_entry = activity.last().unwrap();
        assert_eq!(today_entry.message_count, 8);
    }

    #[test]
    fn test_compute_streaks_all_active() {
        let activity: Vec<DailyActivity> = (0..5)
            .map(|i| DailyActivity {
                date: format!("2026-03-0{}", i + 1),
                message_count: 1,
                token_count: 0,
            })
            .collect();
        let (current, longest) = compute_streaks(&activity);
        assert_eq!(current, 5);
        assert_eq!(longest, 5);
    }

    #[test]
    fn test_compute_streaks_with_gap() {
        let activity = vec![
            DailyActivity { date: "2026-03-01".into(), message_count: 3, token_count: 0 },
            DailyActivity { date: "2026-03-02".into(), message_count: 2, token_count: 0 },
            DailyActivity { date: "2026-03-03".into(), message_count: 0, token_count: 0 },
            DailyActivity { date: "2026-03-04".into(), message_count: 1, token_count: 0 },
        ];
        let (current, longest) = compute_streaks(&activity);
        assert_eq!(current, 1);
        assert_eq!(longest, 2);
    }

    #[test]
    fn test_compute_streaks_empty() {
        let (current, longest) = compute_streaks(&[]);
        assert_eq!(current, 0);
        assert_eq!(longest, 0);
    }

    #[test]
    fn test_merge_agent_maps() {
        let m1: HashMap<String, usize> = [("claude".into(), 10), ("codex".into(), 5)].into();
        let m2: HashMap<String, usize> = [("claude".into(), 3), ("gemini".into(), 2)].into();
        let merged = merge_agent_maps(&[m1, m2]);
        assert_eq!(merged["claude"], 13);
        assert_eq!(merged["codex"], 5);
        assert_eq!(merged["gemini"], 2);
    }

    #[test]
    fn test_count_memory_files_no_files() {
        let paths = vec!["/nonexistent/path".to_string()];
        assert_eq!(count_memory_files(&paths), 0);
    }
}
