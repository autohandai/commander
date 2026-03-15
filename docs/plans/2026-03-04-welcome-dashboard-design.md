# Welcome Screen Activity Dashboard Design

## Goal

Replace the 3 action buttons (New Project, Open Project, Clone) on the welcome screen with a GitHub-style developer activity dashboard. The 3 actions are now accessible via the Project Chooser Modal (Cmd+N / sidebar + button). The Recent Projects section remains at the bottom.

## Layout

```
┌──────────────────────────────────────────────────────────┐
│           Welcome to Commander                            │
│    "Your AI coding command center..."                     │
│                                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│  │  Total   │ │ Sessions │ │   Time   │                 │
│  │ Messages │ │  Count   │ │  Saved   │                 │
│  │  1,247   │ │    89    │ │  ~14h    │                 │
│  ├──────────┤ ├──────────┤ ├──────────┤                 │
│  │  Active  │ │ Memories │ │   Top    │                 │
│  │  Streak  │ │  Saved   │ │  Agent   │                 │
│  │  5 days  │ │    12    │ │  Claude  │                 │
│  └──────────┘ └──────────┘ └──────────┘                 │
│                                                           │
│  Activity (Last 30 days)                    [▼ 30 days]  │
│  ┌────────────────────────────┬─────────────────────┐    │
│  │  Mon [░][░][▓][ ][▓][▓]  │  Agent Usage         │    │
│  │  Wed [▓][▓][ ][▓][ ][▓]  │  claude ████████ 67% │    │
│  │  Fri [ ][▓][▓][ ][▓][ ]  │  codex  ████░░░ 22%  │    │
│  │                            │  gemini ██░░░░░  8%  │    │
│  │  Less [_][░][▒][▓][█] More│  ollama █░░░░░░  3%  │    │
│  └────────────────────────────┴─────────────────────┘    │
│                                                           │
│  Recent                                                   │
│  📁 my-project          ~/dev/my-project                 │
│  📁 api-server          ~/dev/api-server                 │
└──────────────────────────────────────────────────────────┘
```

## Stat Cards (6 metrics)

| Card | Source | Calculation |
|------|--------|-------------|
| Total Messages | `ChatHistoryStats.total_messages` aggregated across projects | Sum |
| Sessions | `ChatHistoryStats.total_sessions` aggregated | Sum |
| Time Saved | Token-based estimate | `total_tokens / 1000 * 5` min (configurable multiplier) |
| Active Streak | Computed from `daily_activity` | Consecutive days with messages > 0 |
| Memories Saved | File scan | Count of AGENTS.md, CLAUDE.md, MEMORY.md, GEMINI.md across projects |
| Top Agent | `agents_used` map | Agent with highest message count |

## Backend Changes

### New Rust Struct: `DashboardStats`

Location: `src-tauri/src/models/dashboard.rs`

```rust
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
    pub available_agents: Vec<AgentInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyActivity {
    pub date: String,       // "2026-03-04"
    pub message_count: usize,
    pub token_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInfo {
    pub name: String,
    pub available: bool,
    pub version: Option<String>,
}
```

### New Tauri Command: `get_dashboard_stats`

Location: `src-tauri/src/commands/dashboard_commands.rs`

```rust
#[tauri::command]
pub async fn get_dashboard_stats(app: AppHandle, days: u32) -> Result<DashboardStats, String>
```

Logic:
1. List all recent projects via existing service
2. For each project, call `get_chat_history_stats` in parallel (tokio::join or futures::join_all)
3. Aggregate: sum messages, sessions, tokens across projects
4. Build daily_activity by iterating session timestamps and bucketing by date
5. Compute streak from daily_activity (consecutive days with count > 0)
6. Scan each project for memory files (AGENTS.md, CLAUDE.md, MEMORY.md, GEMINI.md)
7. Get agent availability via existing `check_ai_agents`

### Settings Addition

Add to `AppSettings`:
```rust
pub dashboard_time_range: Option<u32>, // default 30, options: 7, 30, 90
pub time_saved_multiplier: Option<f32>, // default 5.0 (minutes per 1000 tokens)
```

## Frontend Changes

### New Files

| File | Purpose |
|------|---------|
| `src/components/dashboard/DashboardView.tsx` | Main dashboard orchestrator, replaces 3-button section |
| `src/components/dashboard/StatCards.tsx` | 6 metric cards in responsive grid |
| `src/components/dashboard/ActivityHeatmap.tsx` | D3.js GitHub-style contribution heatmap |
| `src/components/dashboard/AgentUsageBars.tsx` | Horizontal percentage bars per agent |
| `src/hooks/use-dashboard-stats.ts` | Hook to invoke `get_dashboard_stats` command |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Replace 3-button welcome section with `<DashboardView>` |

### D3.js Dependency

Add `d3` and `@types/d3` to package.json.

### ActivityHeatmap Component

- Uses D3 to render SVG cells in a grid: 7 rows (Mon-Sun) x N columns (weeks)
- Color scale: 5 levels from neutral-900 (no activity) to green-400 (high activity)
- Day-of-week labels on left
- Month labels on top when month changes
- Tooltip on hover showing date and count
- Legend at bottom: "Less [cells] More"

### AgentUsageBars Component

- Simple horizontal bars with percentage labels
- Color-coded per agent (claude: blue, codex: green, gemini: purple, ollama: orange)
- Shows only agents that have been used (>0 sessions)

### StatCards Component

- 3x2 grid (responsive to 2x3 on narrow)
- Each card: icon, label, value, optional subtitle
- Subtle border, bg-neutral-900/50 matching existing card style

### use-dashboard-stats Hook

- Calls `invoke('get_dashboard_stats', { days })` on mount and when `days` changes
- Returns `{ stats, loading, error, refresh }`
- Memoizes to avoid unnecessary re-fetches

## Data Flow

```
User opens app (no project selected)
  → App.tsx renders DashboardView
    → useDashboardStats(30) hook fires
      → invoke('get_dashboard_stats', { days: 30 })
        → Rust iterates all recent projects in parallel
        → Aggregates stats, computes streaks, counts memory files
        → Returns DashboardStats
      → DashboardView renders StatCards + ActivityHeatmap + AgentUsageBars
    → Recent projects section renders below (unchanged)
```

## Empty State

When no data exists (new user):
- Stat cards show 0/empty values
- Heatmap shows all empty cells with muted colors
- Agent bars show "No activity yet"
- Subtitle: "Start a project to see your activity here"

## Testing

- `src/components/dashboard/__tests__/DashboardView.test.tsx` - renders with mock data
- `src/components/dashboard/__tests__/StatCards.test.tsx` - displays correct values
- `src/components/dashboard/__tests__/ActivityHeatmap.test.tsx` - renders SVG cells
- `src/components/dashboard/__tests__/AgentUsageBars.test.tsx` - renders bars with percentages
- `src/hooks/__tests__/use-dashboard-stats.test.tsx` - hook invokes command correctly
- Rust unit tests for `get_dashboard_stats` aggregation logic
