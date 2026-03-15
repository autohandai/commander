# Welcome Screen Activity Dashboard - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 3-button welcome screen with a GitHub-style developer activity dashboard showing stats, heatmap, and agent usage, while keeping recent projects.

**Architecture:** New Rust `get_dashboard_stats` command aggregates data across all recent projects in parallel. Frontend uses D3.js for the contribution heatmap, React components for stat cards and agent bars. Data flows from a `useDashboardStats` hook that invokes the Tauri command.

**Tech Stack:** Rust (Tauri commands, tokio async), D3.js v7, React 19, TypeScript, TailwindCSS

---

## Task 1: Add D3.js dependency

**Files:**
- Modify: `package.json`

**Step 1: Install d3 and types**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && bun add d3 && bun add -d @types/d3
```
Expected: packages added to package.json

**Step 2: Verify installation**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && ls node_modules/d3/package.json
```
Expected: file exists

**Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add d3.js dependency for dashboard heatmap"
```

---

## Task 2: Create DashboardStats Rust model

**Files:**
- Create: `src-tauri/src/models/dashboard.rs`
- Modify: `src-tauri/src/models/mod.rs` (line 11, add module)

**Step 1: Write the model file**

Create `src-tauri/src/models/dashboard.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Aggregated dashboard statistics across all recent projects
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_messages: usize,
    pub total_sessions: usize,
    pub total_tokens: u64,
    pub agents_used: HashMap<String, usize>,
    pub daily_activity: Vec<DailyActivity>,
    pub current_streak: u32,
    pub longest_streak: u32,
    pub memory_files_count: usize,
    pub available_agents: Vec<DashboardAgentInfo>,
}

/// Per-day message and token counts for heatmap rendering
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyActivity {
    pub date: String, // "2026-03-04" ISO format
    pub message_count: usize,
    pub token_count: u64,
}

/// Minimal agent info for dashboard display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardAgentInfo {
    pub name: String,
    pub available: bool,
    pub version: Option<String>,
}

impl Default for DashboardStats {
    fn default() -> Self {
        Self {
            total_messages: 0,
            total_sessions: 0,
            total_tokens: 0,
            agents_used: HashMap::new(),
            daily_activity: Vec::new(),
            current_streak: 0,
            longest_streak: 0,
            memory_files_count: 0,
            available_agents: Vec::new(),
        }
    }
}
```

**Step 2: Register the module**

In `src-tauri/src/models/mod.rs`, add after the `pub mod chat_history;` line (line 3):
```rust
pub mod dashboard;
```

And add to the re-exports section after `pub use file::*;` (around line 15):
```rust
pub use dashboard::*;
```

**Step 3: Verify compilation**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo check
```
Expected: compiles without errors

**Step 4: Commit**

```bash
git add src-tauri/src/models/dashboard.rs src-tauri/src/models/mod.rs
git commit -m "feat(models): add DashboardStats model for welcome screen activity data"
```

---

## Task 3: Add dashboard settings fields to AppSettings

**Files:**
- Modify: `src-tauri/src/models/project.rs` (AppSettings struct, lines 22-55)

**Step 1: Add default functions**

In `src-tauri/src/models/project.rs`, add after `fn default_has_completed_onboarding() -> bool { false }` (line 127):
```rust
fn default_dashboard_time_range() -> u32 { 30 }
fn default_time_saved_multiplier() -> f32 { 5.0 }
```

**Step 2: Add fields to AppSettings struct**

In the `AppSettings` struct, add after the `has_completed_onboarding` field (before the closing `}`):
```rust
    #[serde(default = "default_dashboard_time_range")]
    /// Dashboard time range in days: 7, 30, or 90
    pub dashboard_time_range: u32,
    #[serde(default = "default_time_saved_multiplier")]
    /// Minutes saved estimate per 1000 tokens
    pub time_saved_multiplier: f32,
```

**Step 3: Update Default impl**

In the `impl Default for AppSettings` block (line 140), add the new fields before the closing `}`:
```rust
            dashboard_time_range: default_dashboard_time_range(),
            time_saved_multiplier: default_time_saved_multiplier(),
```

**Step 4: Verify compilation**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo check
```
Expected: compiles without errors

**Step 5: Commit**

```bash
git add src-tauri/src/models/project.rs
git commit -m "feat(settings): add dashboard_time_range and time_saved_multiplier to AppSettings"
```

---

## Task 4: Create dashboard service with aggregation logic

**Files:**
- Create: `src-tauri/src/services/dashboard_service.rs`
- Modify: `src-tauri/src/services/mod.rs` (add module declaration)

**Step 1: Write tests inline in the service file**

Create `src-tauri/src/services/dashboard_service.rs`:
```rust
use crate::models::dashboard::{DailyActivity, DashboardAgentInfo, DashboardStats};
use crate::models::chat_history::ChatSession;
use chrono::{Duration, NaiveDate, Utc};
use std::collections::HashMap;
use std::path::Path;

const MEMORY_FILES: &[&str] = &["AGENTS.md", "CLAUDE.md", "MEMORY.md", "GEMINI.md"];

/// Build daily activity buckets from a flat list of sessions within the given date range.
pub fn build_daily_activity(sessions: &[ChatSession], days: u32) -> Vec<DailyActivity> {
    let today = Utc::now().date_naive();
    let start = today - Duration::days(days as i64 - 1);

    // Pre-fill every day in the range with zero counts
    let mut day_map: HashMap<NaiveDate, (usize, u64)> = HashMap::new();
    let mut d = start;
    while d <= today {
        day_map.insert(d, (0, 0));
        d += Duration::days(1);
    }

    // Bucket each session's messages into the day of its start_time
    for session in sessions {
        if let Some(date) = chrono::DateTime::from_timestamp(session.start_time, 0) {
            let naive = date.date_naive();
            if let Some(entry) = day_map.get_mut(&naive) {
                entry.0 += session.message_count;
                // We don't have per-session token counts in ChatSession, so leave at 0
            }
        }
    }

    // Sort by date and convert to DailyActivity
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

/// Compute current streak and longest streak from daily activity.
/// A "streak" = consecutive days with message_count > 0, counting backwards from today.
pub fn compute_streaks(daily_activity: &[DailyActivity]) -> (u32, u32) {
    let mut current_streak: u32 = 0;
    let mut longest_streak: u32 = 0;
    let mut running: u32 = 0;
    let mut found_gap = false;

    // Iterate in reverse (most recent first) to compute current streak
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
    // current streak could also be the longest
    if current_streak > longest_streak {
        longest_streak = current_streak;
    }

    (current_streak, longest_streak)
}

/// Count memory files (AGENTS.md, CLAUDE.md, MEMORY.md, GEMINI.md) across project paths.
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

/// Aggregate agent usage maps from multiple projects into one.
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
        }
    }

    #[test]
    fn test_build_daily_activity_fills_all_days() {
        let activity = build_daily_activity(&[], 7);
        assert_eq!(activity.len(), 7, "Should have 7 days even with no sessions");
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
        assert_eq!(today_entry.message_count, 8, "Today should have 5+3=8 messages");
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
            DailyActivity { date: "2026-03-03".into(), message_count: 0, token_count: 0 }, // gap
            DailyActivity { date: "2026-03-04".into(), message_count: 1, token_count: 0 },
        ];
        let (current, longest) = compute_streaks(&activity);
        assert_eq!(current, 1, "Current streak is 1 (just today)");
        assert_eq!(longest, 2, "Longest streak is 2 (Mar 1-2)");
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
    fn test_count_memory_files_with_no_files() {
        let paths = vec!["/nonexistent/path".to_string()];
        assert_eq!(count_memory_files(&paths), 0);
    }
}
```

**Step 2: Register the module**

In `src-tauri/src/services/mod.rs`, add after `pub mod cli_command_builder;` (line 4):
```rust
pub mod dashboard_service;
```

**Step 3: Run the tests**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test dashboard
```
Expected: all 7 tests pass

**Step 4: Commit**

```bash
git add src-tauri/src/services/dashboard_service.rs src-tauri/src/services/mod.rs
git commit -m "feat(services): add dashboard_service with aggregation logic and tests"
```

---

## Task 5: Create dashboard Tauri command

**Files:**
- Create: `src-tauri/src/commands/dashboard_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs` (add module + re-export)
- Modify: `src-tauri/src/lib.rs` (register command in invoke_handler)

**Step 1: Write the command handler**

Create `src-tauri/src/commands/dashboard_commands.rs`:
```rust
use crate::models::dashboard::{DashboardAgentInfo, DashboardStats};
use crate::services::chat_history_service::{
    get_chat_history_stats, load_chat_sessions,
};
use crate::services::dashboard_service::{
    build_daily_activity, compute_streaks, count_memory_files, merge_agent_maps,
};
use tauri::AppHandle;

/// Get aggregated dashboard statistics across all recent projects.
/// `days` controls the time range (7, 30, or 90).
#[tauri::command]
pub async fn get_dashboard_stats(app: AppHandle, days: u32) -> Result<DashboardStats, String> {
    // 1. Load recent projects
    let store = app
        .store("recent-projects.json")
        .map_err(|e| format!("Failed to access store: {}", e))?;

    let projects_val = store.get("projects").unwrap_or(serde_json::Value::Array(vec![]));
    let project_paths: Vec<String> = match projects_val {
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|v| v.get("path").and_then(|p| p.as_str()).map(String::from))
            .collect(),
        _ => vec![],
    };

    if project_paths.is_empty() {
        return Ok(DashboardStats::default());
    }

    // 2. Fetch stats from each project in parallel
    let mut stat_futures = Vec::new();
    for path in &project_paths {
        let p = path.clone();
        stat_futures.push(async move { get_chat_history_stats(&p).await });
    }
    let stats_results = futures::future::join_all(stat_futures).await;

    // 3. Fetch all sessions from each project for daily bucketing
    let mut session_futures = Vec::new();
    for path in &project_paths {
        let p = path.clone();
        session_futures.push(async move { load_chat_sessions(&p, None, None).await });
    }
    let session_results = futures::future::join_all(session_futures).await;

    // 4. Aggregate
    let mut total_messages = 0usize;
    let mut total_sessions = 0usize;
    let mut agent_maps = Vec::new();

    for result in &stats_results {
        if let Ok(stats) = result {
            total_messages += stats.total_messages;
            total_sessions += stats.total_sessions;
            agent_maps.push(stats.agents_used.clone());
        }
    }

    let agents_used = merge_agent_maps(&agent_maps);

    // 5. Collect all sessions into one list for daily bucketing
    let mut all_sessions = Vec::new();
    for result in session_results {
        if let Ok(sessions) = result {
            all_sessions.extend(sessions);
        }
    }

    let daily_activity = build_daily_activity(&all_sessions, days);
    let (current_streak, longest_streak) = compute_streaks(&daily_activity);

    // 6. Count memory files
    let memory_files_count = count_memory_files(&project_paths);

    // 7. Get agent availability
    let available_agents = get_available_agents();

    Ok(DashboardStats {
        total_messages,
        total_sessions,
        total_tokens: 0, // Token aggregation not yet tracked per-session
        agents_used,
        daily_activity,
        current_streak,
        longest_streak,
        memory_files_count,
        available_agents,
    })
}

/// Check which CLI agents are installed by looking for their binaries.
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
```

**Step 2: Register the module in commands/mod.rs**

In `src-tauri/src/commands/mod.rs`, add after `pub mod cli_commands;` (line 5):
```rust
pub mod dashboard_commands;
```

And add to re-exports after `pub use cli_commands::*;`:
```rust
pub use dashboard_commands::*;
```

**Step 3: Register the command in lib.rs**

In `src-tauri/src/lib.rs`, add `get_dashboard_stats,` inside the `tauri::generate_handler![...]` macro. Add it after `get_chat_history_stats,` (around line 232).

**Step 4: Add `futures` and `which` crate dependency**

Check if `futures` is already in Cargo.toml. If not:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo add futures which
```

**Step 5: Verify compilation**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo check
```
Expected: compiles without errors

**Step 6: Run all Rust tests**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test
```
Expected: all tests pass

**Step 7: Commit**

```bash
git add src-tauri/src/commands/dashboard_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(commands): add get_dashboard_stats Tauri command"
```

---

## Task 6: Create `useDashboardStats` hook with test

**Files:**
- Create: `src/hooks/__tests__/use-dashboard-stats.test.tsx`
- Create: `src/hooks/use-dashboard-stats.ts`

**Step 1: Write the failing test**

Create `src/hooks/__tests__/use-dashboard-stats.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => tauriCore)

import { useDashboardStats } from '@/hooks/use-dashboard-stats'

const MOCK_STATS = {
  total_messages: 150,
  total_sessions: 20,
  total_tokens: 50000,
  agents_used: { claude: 12, codex: 5, gemini: 3 },
  daily_activity: [
    { date: '2026-03-03', message_count: 5, token_count: 1000 },
    { date: '2026-03-04', message_count: 10, token_count: 2000 },
  ],
  current_streak: 2,
  longest_streak: 5,
  memory_files_count: 8,
  available_agents: [
    { name: 'claude', available: true, version: '1.0' },
    { name: 'codex', available: true, version: '0.44' },
    { name: 'gemini', available: false, version: null },
    { name: 'ollama', available: false, version: null },
  ],
}

describe('useDashboardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches stats on mount and returns data', async () => {
    tauriCore.invoke.mockResolvedValueOnce(MOCK_STATS)

    const { result } = renderHook(() => useDashboardStats(30))

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(tauriCore.invoke).toHaveBeenCalledWith('get_dashboard_stats', { days: 30 })
    expect(result.current.stats).toEqual(MOCK_STATS)
    expect(result.current.error).toBeNull()
  })

  it('handles errors gracefully', async () => {
    tauriCore.invoke.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useDashboardStats(30))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.stats).toBeNull()
    expect(result.current.error).toBe('Network error')
  })

  it('refetches when days parameter changes', async () => {
    tauriCore.invoke.mockResolvedValue(MOCK_STATS)

    const { result, rerender } = renderHook(
      ({ days }) => useDashboardStats(days),
      { initialProps: { days: 30 } }
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    rerender({ days: 7 })

    await waitFor(() => {
      expect(tauriCore.invoke).toHaveBeenCalledWith('get_dashboard_stats', { days: 7 })
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/hooks/__tests__/use-dashboard-stats.test.tsx
```
Expected: FAIL (module not found)

**Step 3: Write the hook**

Create `src/hooks/use-dashboard-stats.ts`:
```typescript
import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface DailyActivity {
  date: string
  message_count: number
  token_count: number
}

export interface DashboardAgentInfo {
  name: string
  available: boolean
  version: string | null
}

export interface DashboardStats {
  total_messages: number
  total_sessions: number
  total_tokens: number
  agents_used: Record<string, number>
  daily_activity: DailyActivity[]
  current_streak: number
  longest_streak: number
  memory_files_count: number
  available_agents: DashboardAgentInfo[]
}

export function useDashboardStats(days: number) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await invoke<DashboardStats>('get_dashboard_stats', { days })
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return { stats, loading, error, refresh: fetchStats }
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/hooks/__tests__/use-dashboard-stats.test.tsx
```
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/hooks/use-dashboard-stats.ts src/hooks/__tests__/use-dashboard-stats.test.tsx
git commit -m "feat(hooks): add useDashboardStats hook with tests"
```

---

## Task 7: Create StatCards component with test

**Files:**
- Create: `src/components/dashboard/__tests__/StatCards.test.tsx`
- Create: `src/components/dashboard/StatCards.tsx`

**Step 1: Write the failing test**

Create `src/components/dashboard/__tests__/StatCards.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCards } from '@/components/dashboard/StatCards'

describe('StatCards', () => {
  const defaultProps = {
    totalMessages: 1247,
    totalSessions: 89,
    timeSavedMinutes: 250,
    currentStreak: 5,
    longestStreak: 12,
    memoryFilesCount: 8,
    topAgent: 'claude',
  }

  it('renders all six stat cards', () => {
    render(<StatCards {...defaultProps} />)

    expect(screen.getByText('1,247')).toBeInTheDocument()
    expect(screen.getByText('89')).toBeInTheDocument()
    expect(screen.getByText('~4h 10m')).toBeInTheDocument() // 250 min
    expect(screen.getByText('5 days')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('claude')).toBeInTheDocument()
  })

  it('renders labels for each card', () => {
    render(<StatCards {...defaultProps} />)

    expect(screen.getByText('Messages')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('Time Saved')).toBeInTheDocument()
    expect(screen.getByText('Active Streak')).toBeInTheDocument()
    expect(screen.getByText('Memories')).toBeInTheDocument()
    expect(screen.getByText('Top Agent')).toBeInTheDocument()
  })

  it('handles zero values gracefully', () => {
    render(
      <StatCards
        totalMessages={0}
        totalSessions={0}
        timeSavedMinutes={0}
        currentStreak={0}
        longestStreak={0}
        memoryFilesCount={0}
        topAgent=""
      />
    )

    expect(screen.getAllByText('0')).toHaveLength(3) // messages, sessions, memories
    expect(screen.getByText('0m')).toBeInTheDocument() // time
    expect(screen.getByText('0 days')).toBeInTheDocument()
    expect(screen.getByText('--')).toBeInTheDocument() // no top agent
  })
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/components/dashboard/__tests__/StatCards.test.tsx
```
Expected: FAIL (module not found)

**Step 3: Write the component**

Create `src/components/dashboard/StatCards.tsx`:
```tsx
import { MessageCircle, Activity, Clock, Flame, Brain, Bot } from 'lucide-react'

interface StatCardsProps {
  totalMessages: number
  totalSessions: number
  timeSavedMinutes: number
  currentStreak: number
  longestStreak: number
  memoryFilesCount: number
  topAgent: string
}

function formatTime(minutes: number): string {
  if (minutes === 0) return '0m'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `~${hours}h ${mins}m`
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

interface CardProps {
  icon: React.ReactNode
  label: string
  value: string
  subtitle?: string
}

function Card({ icon, label, value, subtitle }: CardProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-neutral-800 bg-neutral-900/50">
      <div className="p-2 rounded-md bg-neutral-800 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold leading-tight">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  )
}

export function StatCards({
  totalMessages,
  totalSessions,
  timeSavedMinutes,
  currentStreak,
  longestStreak,
  memoryFilesCount,
  topAgent,
}: StatCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-3" data-testid="stat-cards">
      <Card
        icon={<MessageCircle className="h-4 w-4" />}
        label="Messages"
        value={formatNumber(totalMessages)}
      />
      <Card
        icon={<Activity className="h-4 w-4" />}
        label="Sessions"
        value={formatNumber(totalSessions)}
      />
      <Card
        icon={<Clock className="h-4 w-4" />}
        label="Time Saved"
        value={formatTime(timeSavedMinutes)}
      />
      <Card
        icon={<Flame className="h-4 w-4" />}
        label="Active Streak"
        value={`${currentStreak} days`}
        subtitle={longestStreak > 0 ? `Best: ${longestStreak}` : undefined}
      />
      <Card
        icon={<Brain className="h-4 w-4" />}
        label="Memories"
        value={formatNumber(memoryFilesCount)}
      />
      <Card
        icon={<Bot className="h-4 w-4" />}
        label="Top Agent"
        value={topAgent || '--'}
      />
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/components/dashboard/__tests__/StatCards.test.tsx
```
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/components/dashboard/StatCards.tsx src/components/dashboard/__tests__/StatCards.test.tsx
git commit -m "feat(dashboard): add StatCards component with tests"
```

---

## Task 8: Create ActivityHeatmap D3 component with test

**Files:**
- Create: `src/components/dashboard/__tests__/ActivityHeatmap.test.tsx`
- Create: `src/components/dashboard/ActivityHeatmap.tsx`

**Step 1: Write the failing test**

Create `src/components/dashboard/__tests__/ActivityHeatmap.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityHeatmap } from '@/components/dashboard/ActivityHeatmap'

const mockActivity = [
  { date: '2026-02-03', message_count: 0, token_count: 0 },
  { date: '2026-02-04', message_count: 3, token_count: 100 },
  { date: '2026-02-05', message_count: 0, token_count: 0 },
  { date: '2026-02-06', message_count: 10, token_count: 500 },
  { date: '2026-02-07', message_count: 1, token_count: 50 },
]

describe('ActivityHeatmap', () => {
  it('renders an SVG element', () => {
    const { container } = render(
      <ActivityHeatmap dailyActivity={mockActivity} />
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('renders rect cells for each day', () => {
    const { container } = render(
      <ActivityHeatmap dailyActivity={mockActivity} />
    )
    const rects = container.querySelectorAll('rect[data-date]')
    expect(rects.length).toBe(mockActivity.length)
  })

  it('renders the legend', () => {
    render(<ActivityHeatmap dailyActivity={mockActivity} />)
    expect(screen.getByText('Less')).toBeInTheDocument()
    expect(screen.getByText('More')).toBeInTheDocument()
  })

  it('handles empty data', () => {
    const { container } = render(
      <ActivityHeatmap dailyActivity={[]} />
    )
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/components/dashboard/__tests__/ActivityHeatmap.test.tsx
```
Expected: FAIL (module not found)

**Step 3: Write the component**

Create `src/components/dashboard/ActivityHeatmap.tsx`:
```tsx
import { useRef, useEffect } from 'react'
import * as d3 from 'd3'
import type { DailyActivity } from '@/hooks/use-dashboard-stats'

interface ActivityHeatmapProps {
  dailyActivity: DailyActivity[]
}

const CELL_SIZE = 13
const CELL_GAP = 3
const DAY_LABEL_WIDTH = 28
const MONTH_LABEL_HEIGHT = 16

const COLOR_EMPTY = '#1a1a1a'
const COLOR_SCALE = ['#0e4429', '#006d32', '#26a641', '#39d353'] // GitHub green scale

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']

export function ActivityHeatmap({ dailyActivity }: ActivityHeatmapProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (dailyActivity.length === 0) return

    // Parse dates and build lookup
    const dateMap = new Map<string, number>()
    let maxCount = 0
    for (const d of dailyActivity) {
      dateMap.set(d.date, d.message_count)
      if (d.message_count > maxCount) maxCount = d.message_count
    }

    // Determine the date range
    const dates = dailyActivity.map((d) => new Date(d.date + 'T00:00:00'))
    const startDate = d3.min(dates)!
    const endDate = d3.max(dates)!

    // Build the grid: columns = weeks, rows = day-of-week (0=Sun..6=Sat -> remap to Mon=0)
    const dayOfWeekMon = (d: Date) => (d.getDay() + 6) % 7 // Mon=0, Sun=6

    // Calculate week index relative to start
    const startWeek = d3.timeMonday.count(d3.timeYear(startDate), startDate)
    const weekOf = (d: Date) => {
      const diffDays = Math.floor(
        (d.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)
      )
      return Math.floor((diffDays + dayOfWeekMon(startDate)) / 7)
    }

    const numWeeks = weekOf(endDate) + 1
    const gridWidth = DAY_LABEL_WIDTH + numWeeks * (CELL_SIZE + CELL_GAP)
    const gridHeight = MONTH_LABEL_HEIGHT + 7 * (CELL_SIZE + CELL_GAP)

    svg.attr('width', gridWidth).attr('height', gridHeight + 28) // extra for legend

    // Color scale
    const colorScale = (count: number): string => {
      if (count === 0) return COLOR_EMPTY
      if (maxCount === 0) return COLOR_EMPTY
      const ratio = count / maxCount
      if (ratio <= 0.25) return COLOR_SCALE[0]
      if (ratio <= 0.5) return COLOR_SCALE[1]
      if (ratio <= 0.75) return COLOR_SCALE[2]
      return COLOR_SCALE[3]
    }

    // Draw day labels
    const g = svg.append('g')
    DAY_LABELS.forEach((label, i) => {
      if (label) {
        g.append('text')
          .attr('x', DAY_LABEL_WIDTH - 4)
          .attr('y', MONTH_LABEL_HEIGHT + i * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 2)
          .attr('text-anchor', 'end')
          .attr('fill', '#666')
          .attr('font-size', '10px')
          .text(label)
      }
    })

    // Draw month labels
    let lastMonth = -1
    for (const d of dates) {
      const month = d.getMonth()
      if (month !== lastMonth) {
        const week = weekOf(d)
        g.append('text')
          .attr('x', DAY_LABEL_WIDTH + week * (CELL_SIZE + CELL_GAP))
          .attr('y', MONTH_LABEL_HEIGHT - 4)
          .attr('fill', '#666')
          .attr('font-size', '10px')
          .text(d.toLocaleString('default', { month: 'short' }))
        lastMonth = month
      }
    }

    // Draw cells
    const tooltip = d3
      .select('body')
      .append('div')
      .attr('class', 'heatmap-tooltip')
      .style('position', 'fixed')
      .style('pointer-events', 'none')
      .style('background', '#222')
      .style('color', '#eee')
      .style('padding', '4px 8px')
      .style('border-radius', '4px')
      .style('font-size', '11px')
      .style('z-index', '9999')
      .style('opacity', '0')

    for (const d of dates) {
      const dateStr = d.toISOString().slice(0, 10)
      const count = dateMap.get(dateStr) ?? 0
      const week = weekOf(d)
      const dow = dayOfWeekMon(d)

      g.append('rect')
        .attr('data-date', dateStr)
        .attr('x', DAY_LABEL_WIDTH + week * (CELL_SIZE + CELL_GAP))
        .attr('y', MONTH_LABEL_HEIGHT + dow * (CELL_SIZE + CELL_GAP))
        .attr('width', CELL_SIZE)
        .attr('height', CELL_SIZE)
        .attr('rx', 2)
        .attr('fill', colorScale(count))
        .on('mouseenter', (event) => {
          tooltip
            .style('opacity', '1')
            .html(`<strong>${count} messages</strong><br/>${dateStr}`)
            .style('left', `${event.clientX + 10}px`)
            .style('top', `${event.clientY - 30}px`)
        })
        .on('mousemove', (event) => {
          tooltip
            .style('left', `${event.clientX + 10}px`)
            .style('top', `${event.clientY - 30}px`)
        })
        .on('mouseleave', () => {
          tooltip.style('opacity', '0')
        })
    }

    // Draw legend
    const legendY = gridHeight + 6
    const legendColors = [COLOR_EMPTY, ...COLOR_SCALE]

    g.append('text')
      .attr('x', DAY_LABEL_WIDTH)
      .attr('y', legendY + CELL_SIZE - 2)
      .attr('fill', '#666')
      .attr('font-size', '10px')
      .text('Less')

    legendColors.forEach((color, i) => {
      g.append('rect')
        .attr('x', DAY_LABEL_WIDTH + 30 + i * (CELL_SIZE + 2))
        .attr('y', legendY)
        .attr('width', CELL_SIZE)
        .attr('height', CELL_SIZE)
        .attr('rx', 2)
        .attr('fill', color)
    })

    g.append('text')
      .attr(
        'x',
        DAY_LABEL_WIDTH + 30 + legendColors.length * (CELL_SIZE + 2) + 4
      )
      .attr('y', legendY + CELL_SIZE - 2)
      .attr('fill', '#666')
      .attr('font-size', '10px')
      .text('More')

    return () => {
      tooltip.remove()
    }
  }, [dailyActivity])

  return <svg ref={svgRef} data-testid="activity-heatmap" />
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/components/dashboard/__tests__/ActivityHeatmap.test.tsx
```
Expected: 4 tests PASS

**Step 5: Commit**

```bash
git add src/components/dashboard/ActivityHeatmap.tsx src/components/dashboard/__tests__/ActivityHeatmap.test.tsx
git commit -m "feat(dashboard): add ActivityHeatmap D3 component with tests"
```

---

## Task 9: Create AgentUsageBars component with test

**Files:**
- Create: `src/components/dashboard/__tests__/AgentUsageBars.test.tsx`
- Create: `src/components/dashboard/AgentUsageBars.tsx`

**Step 1: Write the failing test**

Create `src/components/dashboard/__tests__/AgentUsageBars.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AgentUsageBars } from '@/components/dashboard/AgentUsageBars'

describe('AgentUsageBars', () => {
  it('renders bars for each agent with percentages', () => {
    const agents = { claude: 67, codex: 22, gemini: 8, ollama: 3 }
    render(<AgentUsageBars agentsUsed={agents} />)

    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('codex')).toBeInTheDocument()
    expect(screen.getByText('gemini')).toBeInTheDocument()
    expect(screen.getByText('ollama')).toBeInTheDocument()
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('only renders agents with usage > 0', () => {
    const agents = { claude: 10, codex: 0, gemini: 5, ollama: 0 }
    render(<AgentUsageBars agentsUsed={agents} />)

    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('gemini')).toBeInTheDocument()
    expect(screen.queryByText('codex')).not.toBeInTheDocument()
    expect(screen.queryByText('ollama')).not.toBeInTheDocument()
  })

  it('shows empty state when no agents used', () => {
    render(<AgentUsageBars agentsUsed={{}} />)
    expect(screen.getByText('No activity yet')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/components/dashboard/__tests__/AgentUsageBars.test.tsx
```
Expected: FAIL

**Step 3: Write the component**

Create `src/components/dashboard/AgentUsageBars.tsx`:
```tsx
interface AgentUsageBarsProps {
  agentsUsed: Record<string, number>
}

const AGENT_COLORS: Record<string, string> = {
  claude: 'bg-blue-500',
  codex: 'bg-green-500',
  gemini: 'bg-purple-500',
  ollama: 'bg-orange-500',
}

export function AgentUsageBars({ agentsUsed }: AgentUsageBarsProps) {
  const entries = Object.entries(agentsUsed)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)

  const total = entries.reduce((sum, [, count]) => sum + count, 0)

  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        No activity yet
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col justify-center gap-2.5">
      <p className="text-xs font-medium text-muted-foreground">Agent Usage</p>
      {entries.map(([agent, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0
        const colorClass = AGENT_COLORS[agent] || 'bg-neutral-500'
        return (
          <div key={agent} className="flex items-center gap-2">
            <span className="text-xs w-14 text-right text-muted-foreground">{agent}</span>
            <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${colorClass}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs w-8 text-muted-foreground">{pct}%</span>
          </div>
        )
      })}
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/components/dashboard/__tests__/AgentUsageBars.test.tsx
```
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/components/dashboard/AgentUsageBars.tsx src/components/dashboard/__tests__/AgentUsageBars.test.tsx
git commit -m "feat(dashboard): add AgentUsageBars component with tests"
```

---

## Task 10: Create DashboardView orchestrator with test

**Files:**
- Create: `src/components/dashboard/__tests__/DashboardView.test.tsx`
- Create: `src/components/dashboard/DashboardView.tsx`

**Step 1: Write the failing test**

Create `src/components/dashboard/__tests__/DashboardView.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

const MOCK_STATS = {
  total_messages: 150,
  total_sessions: 20,
  total_tokens: 50000,
  agents_used: { claude: 12, codex: 5 },
  daily_activity: [
    { date: '2026-03-04', message_count: 5, token_count: 1000 },
  ],
  current_streak: 3,
  longest_streak: 7,
  memory_files_count: 4,
  available_agents: [],
}

vi.mock('@/hooks/use-dashboard-stats', () => ({
  useDashboardStats: () => ({
    stats: MOCK_STATS,
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}))

import { DashboardView } from '@/components/dashboard/DashboardView'

describe('DashboardView', () => {
  it('renders stat cards when data is loaded', () => {
    render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)

    expect(screen.getByText('150')).toBeInTheDocument() // total messages
    expect(screen.getByText('20')).toBeInTheDocument()  // sessions
    expect(screen.getByText('3 days')).toBeInTheDocument() // streak
  })

  it('renders the heatmap section', () => {
    const { container } = render(
      <DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />
    )
    expect(container.querySelector('[data-testid="activity-heatmap"]')).toBeInTheDocument()
  })

  it('renders agent usage bars', () => {
    render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)
    expect(screen.getByText('claude')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/components/dashboard/__tests__/DashboardView.test.tsx
```
Expected: FAIL

**Step 3: Write the component**

Create `src/components/dashboard/DashboardView.tsx`:
```tsx
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { StatCards } from './StatCards'
import { ActivityHeatmap } from './ActivityHeatmap'
import { AgentUsageBars } from './AgentUsageBars'

interface DashboardViewProps {
  timeSavedMultiplier: number
  days: number
  onDaysChange: (days: number) => void
}

export function DashboardView({ timeSavedMultiplier, days, onDaysChange }: DashboardViewProps) {
  const { stats, loading, error } = useDashboardStats(days)

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-neutral-800/50" />
          ))}
        </div>
        <div className="h-40 rounded-lg bg-neutral-800/50" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        Failed to load dashboard data
      </div>
    )
  }

  if (!stats) return null

  // Compute derived values
  const timeSavedMinutes = Math.round((stats.total_tokens / 1000) * timeSavedMultiplier)

  const agentEntries = Object.entries(stats.agents_used)
  const topAgent = agentEntries.length > 0
    ? agentEntries.sort(([, a], [, b]) => b - a)[0][0]
    : ''

  return (
    <div className="space-y-6">
      <StatCards
        totalMessages={stats.total_messages}
        totalSessions={stats.total_sessions}
        timeSavedMinutes={timeSavedMinutes}
        currentStreak={stats.current_streak}
        longestStreak={stats.longest_streak}
        memoryFilesCount={stats.memory_files_count}
        topAgent={topAgent}
      />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-muted-foreground">
            Activity
          </h3>
          <select
            value={days}
            onChange={(e) => onDaysChange(Number(e.target.value))}
            className="text-xs bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-muted-foreground"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        <div className="flex gap-6 items-start rounded-lg border border-neutral-800 bg-neutral-900/30 p-4">
          <div className="overflow-x-auto">
            <ActivityHeatmap dailyActivity={stats.daily_activity} />
          </div>
          <AgentUsageBars agentsUsed={stats.agents_used} />
        </div>
      </div>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/components/dashboard/__tests__/DashboardView.test.tsx
```
Expected: 3 tests PASS

**Step 5: Commit**

```bash
git add src/components/dashboard/DashboardView.tsx src/components/dashboard/__tests__/DashboardView.test.tsx
git commit -m "feat(dashboard): add DashboardView orchestrator component with tests"
```

---

## Task 11: Integrate DashboardView into App.tsx welcome screen

**Files:**
- Modify: `src/App.tsx` (replace 3-button section with DashboardView, keep recent projects)

**Step 1: Add import**

At top of `src/App.tsx`, add after the `ProjectChooserModal` import:
```tsx
import { DashboardView } from "@/components/dashboard/DashboardView"
```

**Step 2: Add days state**

Inside `AppContent`, after `const [welcomePhrase, setWelcomePhrase] = useState<string>("")` (line 118), add:
```tsx
const [dashboardDays, setDashboardDays] = useState<number>(settings.dashboard_time_range ?? 30)
```

Note: `settings.dashboard_time_range` may not exist on the TS type yet, so use optional chaining with fallback.

**Step 3: Replace the 3-button section**

In `src/App.tsx`, find the `<div className="flex flex-col sm:flex-row gap-4 justify-center">` block (lines ~555-596) that contains the 3 buttons (New Project, Open Project, Clone). **Replace that entire `<div>` and its children** with:

```tsx
<DashboardView
  timeSavedMultiplier={settings.time_saved_multiplier ?? 5}
  days={dashboardDays}
  onDaysChange={setDashboardDays}
/>
```

Keep everything else: the welcome heading, the random phrase, and the recent projects section below.

**Step 4: Update AppSettings TypeScript type**

In `src/types/settings.ts`, add to the `AppSettings` interface:
```typescript
  dashboard_time_range?: number;
  time_saved_multiplier?: number;
```

Also update the settings-context if it references AppSettings directly.

**Step 5: Run full test suite**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run
```
Expected: all tests pass (existing tests may need `dashboard_time_range` added to mock settings objects)

**Step 6: Verify app compiles**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx tsc --noEmit
```
Expected: no type errors

**Step 7: Commit**

```bash
git add src/App.tsx src/types/settings.ts
git commit -m "feat: integrate DashboardView into welcome screen, replace 3-button section"
```

---

## Task 12: Final integration test and cleanup

**Step 1: Run complete Rust test suite**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test
```
Expected: all tests pass

**Step 2: Run complete frontend test suite**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run
```
Expected: all tests pass

**Step 3: Run the app**

Run:
```bash
cd /Users/igorcosta/Documents/autohand/new/commander && bun tauri dev
```
Expected: App launches. Welcome screen shows stat cards, heatmap, agent bars, and recent projects. No 3-button section.

**Step 4: Verify Cmd+N still opens the project chooser**

Press Cmd+N → Project Chooser Modal with 3 options should appear.

**Step 5: Verify sidebar + button still works**

Click the "+" next to "Projects" in sidebar → Same Project Chooser Modal.

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete welcome screen activity dashboard with D3 heatmap, stat cards, and agent usage bars"
```
