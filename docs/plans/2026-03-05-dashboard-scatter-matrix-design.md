# Dashboard Session Scatter Matrix Redesign

**Date:** 2026-03-05
**Status:** Approved

## Overview

Replace the current dashboard welcome visualization with a dense, visually stunning **Session Scatter Matrix** chart inspired by the reference dot-matrix design. The redesign includes a bottom **Metrics Strip** with inline sparkline widgets and an **Activity Timeline** histogram bar.

## Goals

- Create a visually impressive first screen that showcases all AI coding agent activity
- Each dot represents a session, positioned by date and token volume, colored by agent
- Dense dot rendering (6-12 dots per active day) for visual richness
- Theme-adaptive: dark mode matches the reference closely, light mode adapts gracefully
- No backend changes required — synthesize session-level data from existing daily aggregates

## Data Model (Unchanged)

```typescript
interface DashboardStats {
  total_messages: number
  total_sessions: number
  total_tokens: number
  agents_used: Record<string, number>        // agent name → session count
  daily_activity: DailyActivity[]            // per-day aggregates
  current_streak: number
  longest_streak: number
  memory_files_count: number
  available_agents: DashboardAgentInfo[]
}
```

## Component Architecture

```
DashboardView (orchestrator)
├── SessionScatterChart (replaces ActivityHeatmap)
│   ├── D3 SVG dot matrix chart
│   ├── Agent color legend (bottom-right pills)
│   └── Tooltip overlay (fixed position)
├── MetricsStrip (replaces StatCards)
│   ├── SessionsWidget — bar sparkline of last 7 days
│   ├── TokensWidget — agent-colored stacked bars
│   ├── TimeSavedWidget — trend line sparkline
│   ├── StreakWidget — pulse/activity bars (filled vs empty)
│   └── AgentMixWidget — colored proportional segments
├── ActivityTimeline (replaces AgentUsageBars)
│   └── Full-width mini histogram of daily token usage
└── Time range selector (unchanged <select>)
```

## Session Scatter Chart Design

### Layout
- Full-width SVG inside a themed card
- X-axis: date timeline with month labels at top
- Y-axis: token volume, logarithmic scale (0, 500, 1K, 5K, 10K, 50K)
- Subtle horizontal grid lines

### Dot Rendering
- **Position X**: Day column (COL_STEP spacing)
- **Position Y**: Token volume for that sub-session (log scale)
- **Size**: `r = 2 + log(messages + 1) * 2` (range ~2px–7px)
- **Color**: By agent (Claude=#3b82f6, Codex=#22c55e, Gemini=#8b5cf6, Ollama=#f59e0b, default=#94a3b8)
- **Opacity**: 0.85 for active dots
- **Glow**: Dark mode only — `drop-shadow(0 0 2px agentColor)` at 30%

### Data Synthesis (High Density)
Since backend provides day-level aggregates, not per-session:
1. For each active day, distribute tokens/messages across agents using `agents_used` global ratios
2. For each agent's daily share, split into 2-4 sub-sessions using deterministic hash-based splitting (stable across re-renders)
3. Each sub-session gets its own y-position with jitter via `stableJitter()`
4. Result: ~6-12 dots per active day
5. Inactive days: small muted baseline dots (keeps grid full)

### Interactions
- Hover: Tooltip "Claude · Mar 4 · 1,234 tokens · 12 msgs"
- Hover: Dot scales to 1.3x
- Entry animation: Staggered fade-in (bottom-up, ~20ms per row)
- Time range change: Cross-fade opacity transition

## Metrics Strip Design

Horizontal row of 5 compact widgets below the chart:

| # | Metric | Display | Mini Visualization |
|---|--------|---------|-------------------|
| 1 | Sessions | `1,802` | Tiny bar chart (last 7 days counts) |
| 2 | Tokens | `438K` | Stacked horizontal bars (agent-colored) |
| 3 | Time Saved | `~12h` | Line sparkline (trend over period) |
| 4 | Streak | `5 days` | Pulse bars (daily activity filled/empty) |
| 5 | Agent Mix | `4 active` | Colored segment blocks (proportional) |

Each widget: icon + label (small muted) + large number + ~60px inline SVG viz.
Responsive: wraps to 2 rows on narrow screens.

## Activity Timeline Bar

Full-width thin bar at the bottom:
- Mini histogram of daily token usage across the full period
- Tiny vertical bars colored by the dominant agent for that day
- Acts as an overview strip for the main chart
- Height: ~32px

## Theme-Adaptive Colors

### Dark Mode
- Chart bg: `#0d1117`
- Grid: `rgba(148, 163, 184, 0.12)`
- Axis text: `#64748b`
- Dot glow: `drop-shadow` matching dot color at 30%
- Metrics strip bg: `#161b22`
- Timeline bg: `#1c2333`

### Light Mode
- Chart bg: `#f8fafc`
- Grid: `rgba(100, 116, 139, 0.15)`
- Axis text: `#94a3b8`
- No dot glow (flat look)
- Metrics strip bg: `#f1f5f9`
- Timeline bg: `#e2e8f0`

## CSS Variables (New/Updated in index.css)

```css
/* Dark mode additions */
--dashboard-chart-bg: #0d1117;
--dashboard-metrics-bg: #161b22;
--dashboard-timeline-bg: #1c2333;

/* Agent colors */
--dashboard-agent-claude: #3b82f6;
--dashboard-agent-codex: #22c55e;
--dashboard-agent-gemini: #8b5cf6;
--dashboard-agent-ollama: #f59e0b;
--dashboard-agent-default: #94a3b8;

/* Light mode overrides */
--dashboard-chart-bg: #f8fafc;
--dashboard-metrics-bg: #f1f5f9;
--dashboard-timeline-bg: #e2e8f0;
```

## Files Changed

| File | Action |
|------|--------|
| `src/components/dashboard/SessionScatterChart.tsx` | **New** — replaces ActivityHeatmap |
| `src/components/dashboard/MetricsStrip.tsx` | **New** — replaces StatCards |
| `src/components/dashboard/ActivityTimeline.tsx` | **New** — replaces AgentUsageBars |
| `src/components/dashboard/DashboardView.tsx` | **Modified** — updated imports and layout |
| `src/index.css` | **Modified** — new CSS variables |
| `src/components/dashboard/ActivityHeatmap.tsx` | **Removed** (replaced) |
| `src/components/dashboard/StatCards.tsx` | **Removed** (replaced) |
| `src/components/dashboard/AgentUsageBars.tsx` | **Removed** (replaced) |

## What Stays Unchanged

- `useDashboardStats` hook
- `DashboardStats` Rust backend model
- `dashboard_commands.rs` and `dashboard_service.rs`
- Empty state component
- Settings integration (time_saved_multiplier, dashboard_time_range, show_dashboard_activity)
- Existing test infrastructure for data flow

## Success Criteria

- [ ] Dense dot matrix renders with 6-12 dots per active day
- [ ] Dots colored by agent, sized by message volume
- [ ] Theme-adaptive (dark matches reference, light is clean)
- [ ] 5 metrics with inline sparklines render below chart
- [ ] Activity timeline bar renders at bottom
- [ ] Hover tooltips work on dots
- [ ] Entry animations are smooth and staggered
- [ ] Responsive layout works on narrow screens
- [ ] No regressions in existing functionality
- [ ] All existing tests continue to pass
