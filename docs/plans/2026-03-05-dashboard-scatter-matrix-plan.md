# Dashboard Session Scatter Matrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current dashboard with a dense Session Scatter Matrix (D3.js dot chart), a Metrics Strip with inline sparklines, and an Activity Timeline histogram bar.

**Architecture:** Three new components replace three existing ones. DashboardView orchestrates them with the same `useDashboardStats` hook. Session dots are synthesized from daily aggregates + agent ratios. All rendering uses D3.js v7 on SVG. Theme-adaptive via CSS variables.

**Tech Stack:** React 18, D3.js v7, TypeScript, TailwindCSS, Vitest + Testing Library

**Design doc:** `docs/plans/2026-03-05-dashboard-scatter-matrix-design.md`

---

### Task 1: Add new CSS variables for the expanded dashboard palette

**Files:**
- Modify: `src/index.css:37-43` (light mode vars) and `src/index.css:73-79` (dark mode vars)

**Step 1: Add the new CSS variables to light mode block**

In `src/index.css`, find the existing `--dashboard-*` vars in the `:root` (light) section (~line 37) and ADD after them:

```css
    --dashboard-chart-bg: #f8fafc;
    --dashboard-metrics-bg: #f1f5f9;
    --dashboard-timeline-bg: #e2e8f0;
    --dashboard-agent-claude: #3b82f6;
    --dashboard-agent-codex: #22c55e;
    --dashboard-agent-gemini: #8b5cf6;
    --dashboard-agent-ollama: #f59e0b;
    --dashboard-agent-default: #94a3b8;
```

**Step 2: Add the new CSS variables to dark mode block**

In the `.dark` section (~line 73), ADD after existing dashboard vars:

```css
    --dashboard-chart-bg: #0d1117;
    --dashboard-metrics-bg: #161b22;
    --dashboard-timeline-bg: #1c2333;
    --dashboard-agent-claude: #3b82f6;
    --dashboard-agent-codex: #22c55e;
    --dashboard-agent-gemini: #8b5cf6;
    --dashboard-agent-ollama: #f59e0b;
    --dashboard-agent-default: #94a3b8;
```

**Step 3: Verify CSS loads**

Run: `bun run build` (or check browser) — no CSS parse errors.

**Step 4: Commit**

```bash
git add src/index.css
git commit -m "feat(dashboard): add CSS variables for scatter matrix chart and metrics strip"
```

---

### Task 2: Create SessionScatterChart component with tests (TDD)

**Files:**
- Create: `src/components/dashboard/__tests__/SessionScatterChart.test.tsx`
- Create: `src/components/dashboard/SessionScatterChart.tsx`

**Step 1: Write the failing tests**

Create `src/components/dashboard/__tests__/SessionScatterChart.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionScatterChart } from '@/components/dashboard/SessionScatterChart'

const mockActivity = [
  { date: '2026-02-03', message_count: 0, token_count: 0 },
  { date: '2026-02-04', message_count: 3, token_count: 100 },
  { date: '2026-02-05', message_count: 0, token_count: 0 },
  { date: '2026-02-06', message_count: 10, token_count: 500 },
  { date: '2026-02-07', message_count: 1, token_count: 50 },
]

const mockAgentsUsed = { claude: 12, codex: 5, gemini: 3 }

describe('SessionScatterChart', () => {
  it('renders an SVG element', () => {
    const { container } = render(
      <SessionScatterChart dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders circles for active days with data-date attributes', () => {
    const { container } = render(
      <SessionScatterChart dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    const circles = container.querySelectorAll('circle[data-date]')
    // Active days (Feb 4, 6, 7) should produce multiple dots each (6-12 per day)
    expect(circles.length).toBeGreaterThanOrEqual(10)
  })

  it('renders y-axis scale labels', () => {
    render(
      <SessionScatterChart dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('1K')).toBeInTheDocument()
    expect(screen.getByText('50K')).toBeInTheDocument()
  })

  it('renders agent legend pills', () => {
    render(
      <SessionScatterChart dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('codex')).toBeInTheDocument()
    expect(screen.getByText('gemini')).toBeInTheDocument()
  })

  it('handles empty data gracefully', () => {
    const { container } = render(
      <SessionScatterChart dailyActivity={[]} agentsUsed={{}} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders muted dots for inactive days', () => {
    const { container } = render(
      <SessionScatterChart dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    // Feb 3 and Feb 5 have zero activity — should still have muted dots
    const mutedDots = container.querySelectorAll('circle[data-date="2026-02-03"]')
    expect(mutedDots.length).toBeGreaterThanOrEqual(1)
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun run test -- src/components/dashboard/__tests__/SessionScatterChart.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement SessionScatterChart**

Create `src/components/dashboard/SessionScatterChart.tsx`.

Key implementation notes:
- Use `useRef<SVGSVGElement>` and `useEffect` with D3 (same pattern as current `ActivityHeatmap`)
- Read CSS variables via `getComputedStyle()` for theme-adaptive colors
- Constants: `ROWS = 16`, `COL_STEP = 16`, `ROW_STEP = 18`, `MARGIN = { top: 24, left: 52, bottom: 28, right: 14 }`
- Y-axis labels: `['0', '500', '1K', '5K', '10K', '50K']`
- **Session synthesis algorithm:**
  1. Compute global agent ratios from `agentsUsed` (e.g., claude=60%, codex=25%, gemini=15%)
  2. For each active day, multiply day totals by agent ratios
  3. For each agent share, split into `Math.max(1, Math.ceil(ratio * 4))` sub-sessions
  4. Position each sub-session at `y = logScale(tokenShare)` with `stableJitter` offset
  5. For inactive days, render 2-3 small muted dots at baseline
- **Agent colors map**: `{ claude: var(--dashboard-agent-claude), codex: ..., gemini: ..., ollama: ..., default: var(--dashboard-agent-default) }`
- **Dot radius**: `r = 2 + Math.log2(messages + 1) * 1.5` clamped to [2, 8]
- **Dot opacity**: 0.85 for active, 0.4 for muted
- **Dark mode glow**: Apply `filter: url(#glow)` with SVG `<defs>` containing a `<feGaussianBlur>` and `<feMerge>` (check `window.matchMedia('(prefers-color-scheme: dark)')` or read a CSS variable)
- **Staggered entry animation**: Set initial opacity 0, then transition with D3 `.transition().delay((_, i) => i * 8).duration(400).attr('opacity', finalOpacity)`
- **Tooltip**: Fixed-position div (same pattern as current ActivityHeatmap), show on mouseenter: `"${agent} · ${date} · ${tokens.toLocaleString()} tokens · ${messages} msgs"`
- **Legend**: Render below SVG as a flex row of small pills with colored dots and agent names
- Expose `data-testid="session-scatter-chart"` on the outer wrapper div

```tsx
interface SessionScatterChartProps {
  dailyActivity: DailyActivity[]
  agentsUsed: Record<string, number>
}
```

**Step 4: Run tests to verify they pass**

Run: `bun run test -- src/components/dashboard/__tests__/SessionScatterChart.test.tsx`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/components/dashboard/SessionScatterChart.tsx src/components/dashboard/__tests__/SessionScatterChart.test.tsx
git commit -m "feat(dashboard): add SessionScatterChart with D3 dot matrix and agent-colored sessions"
```

---

### Task 3: Create MetricsStrip component with tests (TDD)

**Files:**
- Create: `src/components/dashboard/__tests__/MetricsStrip.test.tsx`
- Create: `src/components/dashboard/MetricsStrip.tsx`

**Step 1: Write the failing tests**

Create `src/components/dashboard/__tests__/MetricsStrip.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricsStrip } from '@/components/dashboard/MetricsStrip'

const defaultProps = {
  totalSessions: 1802,
  totalTokens: 438000,
  timeSavedMinutes: 720,
  currentStreak: 5,
  longestStreak: 12,
  agentsUsed: { claude: 67, codex: 22, gemini: 8, ollama: 3 },
  dailyActivity: [
    { date: '2026-03-01', message_count: 5, token_count: 1000 },
    { date: '2026-03-02', message_count: 8, token_count: 2000 },
    { date: '2026-03-03', message_count: 3, token_count: 500 },
    { date: '2026-03-04', message_count: 12, token_count: 4000 },
    { date: '2026-03-05', message_count: 0, token_count: 0 },
    { date: '2026-03-06', message_count: 7, token_count: 1500 },
    { date: '2026-03-07', message_count: 10, token_count: 3000 },
  ],
}

describe('MetricsStrip', () => {
  it('renders all 5 metric labels', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
    expect(screen.getByText('Time Saved')).toBeInTheDocument()
    expect(screen.getByText('Streak')).toBeInTheDocument()
    expect(screen.getByText('Agent Mix')).toBeInTheDocument()
  })

  it('renders formatted session count', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('1,802')).toBeInTheDocument()
  })

  it('renders formatted token count with K suffix', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('438K')).toBeInTheDocument()
  })

  it('renders time saved value', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('~12h')).toBeInTheDocument()
  })

  it('renders streak value', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('5 days')).toBeInTheDocument()
  })

  it('renders agent count', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('4 active')).toBeInTheDocument()
  })

  it('renders inline SVG sparklines', () => {
    const { container } = render(<MetricsStrip {...defaultProps} />)
    const inlineSvgs = container.querySelectorAll('svg.metric-sparkline')
    expect(inlineSvgs.length).toBe(5)
  })

  it('handles zero values', () => {
    render(
      <MetricsStrip
        totalSessions={0}
        totalTokens={0}
        timeSavedMinutes={0}
        currentStreak={0}
        longestStreak={0}
        agentsUsed={{}}
        dailyActivity={[]}
      />
    )
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('0K')).toBeInTheDocument()
    expect(screen.getByText('0m')).toBeInTheDocument()
    expect(screen.getByText('0 days')).toBeInTheDocument()
    expect(screen.getByText('0 active')).toBeInTheDocument()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun run test -- src/components/dashboard/__tests__/MetricsStrip.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement MetricsStrip**

Create `src/components/dashboard/MetricsStrip.tsx`.

Key implementation notes:
- Horizontal flex row, 5 widgets, each ~120px min-width
- Each widget: icon (Lucide, 14px) + label (muted, 10px) + large number (18px semibold) + inline SVG sparkline (~60px wide, 20px tall, class `metric-sparkline`)
- **SessionsWidget**: Bar sparkline — take last 7 entries of `dailyActivity`, render tiny `<rect>` bars proportional to `message_count`
- **TokensWidget**: Stacked horizontal bars — render agent proportions as colored segments in a 60px wide bar, colors from CSS variables
- **TimeSavedWidget**: Line sparkline — take last 7 `dailyActivity` entries, compute cumulative time saved (messages * multiplier ratio), render as `<path>` with D3 line generator
- **StreakWidget**: Pulse bars — render last 7 days as thin bars, filled if `message_count > 0`, empty/muted otherwise
- **AgentMixWidget**: Colored block segments — render proportional colored blocks for each agent
- Formatting: `formatTokens(n)`: `n >= 1_000_000 ? '${(n/1_000_000).toFixed(1)}M' : n >= 1000 ? '${Math.round(n/1000)}K' : '${n}'`
- Formatting: `formatTime(m)`: same logic as current StatCards
- Responsive: `flex-wrap` so it wraps to 2 rows on narrow screens
- Use `data-testid="metrics-strip"` on outer wrapper

```tsx
interface MetricsStripProps {
  totalSessions: number
  totalTokens: number
  timeSavedMinutes: number
  currentStreak: number
  longestStreak: number
  agentsUsed: Record<string, number>
  dailyActivity: { date: string; message_count: number; token_count: number }[]
}
```

**Step 4: Run tests to verify they pass**

Run: `bun run test -- src/components/dashboard/__tests__/MetricsStrip.test.tsx`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/components/dashboard/MetricsStrip.tsx src/components/dashboard/__tests__/MetricsStrip.test.tsx
git commit -m "feat(dashboard): add MetricsStrip with 5 inline sparkline widgets"
```

---

### Task 4: Create ActivityTimeline component with tests (TDD)

**Files:**
- Create: `src/components/dashboard/__tests__/ActivityTimeline.test.tsx`
- Create: `src/components/dashboard/ActivityTimeline.tsx`

**Step 1: Write the failing tests**

Create `src/components/dashboard/__tests__/ActivityTimeline.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityTimeline } from '@/components/dashboard/ActivityTimeline'

const mockActivity = [
  { date: '2026-03-01', message_count: 5, token_count: 1000 },
  { date: '2026-03-02', message_count: 0, token_count: 0 },
  { date: '2026-03-03', message_count: 10, token_count: 5000 },
  { date: '2026-03-04', message_count: 3, token_count: 800 },
]

const mockAgentsUsed = { claude: 10, codex: 5 }

describe('ActivityTimeline', () => {
  it('renders an SVG element', () => {
    const { container } = render(
      <ActivityTimeline dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders histogram bars for each day', () => {
    const { container } = render(
      <ActivityTimeline dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    const bars = container.querySelectorAll('rect[data-date]')
    expect(bars.length).toBe(4)
  })

  it('renders the total token label', () => {
    render(
      <ActivityTimeline dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} totalTokens={6800} />
    )
    expect(screen.getByText('Activity')).toBeInTheDocument()
  })

  it('renders a colored progress segment bar below histogram', () => {
    const { container } = render(
      <ActivityTimeline dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    const segments = container.querySelectorAll('rect.agent-segment')
    expect(segments.length).toBeGreaterThanOrEqual(1)
  })

  it('handles empty data', () => {
    const { container } = render(
      <ActivityTimeline dailyActivity={[]} agentsUsed={{}} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `bun run test -- src/components/dashboard/__tests__/ActivityTimeline.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement ActivityTimeline**

Create `src/components/dashboard/ActivityTimeline.tsx`.

Key implementation notes:
- Full-width bar, ~40px height total
- Top section: Label "Activity" + total token count (left-aligned, small text)
- Middle: SVG histogram — tiny `<rect>` bars for each day, height proportional to `token_count` (linear scale, max height 24px)
- Bar color: Dominant agent color for that day (compute from global agent ratios — same as scatter chart)
- Bottom: Thin (4px) horizontal progress bar showing agent proportions as colored segments (like the reference's bottom bar)
  - Each `<rect>` has `class="agent-segment"` and `data-agent` attribute
- Background: `var(--dashboard-timeline-bg)`
- Expose `data-testid="activity-timeline"` on outer wrapper

```tsx
interface ActivityTimelineProps {
  dailyActivity: { date: string; message_count: number; token_count: number }[]
  agentsUsed: Record<string, number>
  totalTokens?: number
}
```

**Step 4: Run tests to verify they pass**

Run: `bun run test -- src/components/dashboard/__tests__/ActivityTimeline.test.tsx`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/components/dashboard/ActivityTimeline.tsx src/components/dashboard/__tests__/ActivityTimeline.test.tsx
git commit -m "feat(dashboard): add ActivityTimeline histogram bar with agent-colored segments"
```

---

### Task 5: Update DashboardView to use new components

**Files:**
- Modify: `src/components/dashboard/DashboardView.tsx`
- Modify: `src/components/dashboard/__tests__/DashboardView.test.tsx`

**Step 1: Update the DashboardView test to match new component structure**

Modify `src/components/dashboard/__tests__/DashboardView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

const MOCK_STATS = {
  total_messages: 150, total_sessions: 20, total_tokens: 50000,
  agents_used: { claude: 12, codex: 5 },
  daily_activity: [{ date: '2026-03-04', message_count: 5, token_count: 1000 }],
  current_streak: 3, longest_streak: 7, memory_files_count: 4,
  available_agents: [],
}

vi.mock('@/hooks/use-dashboard-stats', () => ({
  useDashboardStats: () => ({ stats: MOCK_STATS, loading: false, error: null, refresh: vi.fn() }),
}))

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { show_dashboard_activity: true } }),
}))

import { DashboardView } from '@/components/dashboard/DashboardView'

describe('DashboardView', () => {
  it('renders the scatter chart', () => {
    const { container } = render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)
    expect(container.querySelector('[data-testid="session-scatter-chart"]')).toBeInTheDocument()
  })

  it('renders the metrics strip', () => {
    const { container } = render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)
    expect(container.querySelector('[data-testid="metrics-strip"]')).toBeInTheDocument()
  })

  it('renders the activity timeline', () => {
    const { container } = render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)
    expect(container.querySelector('[data-testid="activity-timeline"]')).toBeInTheDocument()
  })

  it('renders session and token counts in metrics strip', () => {
    render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)
    expect(screen.getByText('20')).toBeInTheDocument()   // sessions
    expect(screen.getByText('50K')).toBeInTheDocument()   // tokens
  })

  it('uses theme-safe card tokens for chart sections', () => {
    const { container } = render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)
    const section = container.querySelector('[class*="bg-card"]')
    expect(section).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- src/components/dashboard/__tests__/DashboardView.test.tsx`
Expected: FAIL — old assertions no longer match

**Step 3: Update DashboardView component**

Modify `src/components/dashboard/DashboardView.tsx`:
- Replace imports: `StatCards` → `MetricsStrip`, `ActivityHeatmap` → `SessionScatterChart`, `AgentUsageBars` → `ActivityTimeline`
- Update the render section to use new components:

```tsx
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { useSettings } from '@/contexts/settings-context'
import { SessionScatterChart } from './SessionScatterChart'
import { MetricsStrip } from './MetricsStrip'
import { ActivityTimeline } from './ActivityTimeline'
import { Terminal, Download } from 'lucide-react'
```

In the return JSX (replacing the current StatCards + ActivityHeatmap + AgentUsageBars block):

```tsx
{/* Scatter chart */}
<div className="bg-[var(--dashboard-chart-bg)] border-border rounded-xl border p-4 shadow-sm">
  <SessionScatterChart
    dailyActivity={stats.daily_activity}
    agentsUsed={stats.agents_used}
  />
</div>

{/* Metrics strip */}
<MetricsStrip
  totalSessions={stats.total_sessions}
  totalTokens={stats.total_tokens}
  timeSavedMinutes={timeSavedMinutes}
  currentStreak={stats.current_streak}
  longestStreak={stats.longest_streak}
  agentsUsed={stats.agents_used}
  dailyActivity={stats.daily_activity}
/>

{/* Activity timeline */}
<ActivityTimeline
  dailyActivity={stats.daily_activity}
  agentsUsed={stats.agents_used}
  totalTokens={stats.total_tokens}
/>
```

Remove the `computeTopAgent` function (no longer needed — MetricsStrip shows agent count instead).

**Step 4: Run tests to verify they pass**

Run: `bun run test -- src/components/dashboard/__tests__/DashboardView.test.tsx`
Expected: ALL PASS

**Step 5: Run ALL dashboard tests to verify no regressions**

Run: `bun run test -- src/components/dashboard/`
Expected: New tests pass. Old tests for removed components will now fail — that's expected (handled in Task 6).

**Step 6: Commit**

```bash
git add src/components/dashboard/DashboardView.tsx src/components/dashboard/__tests__/DashboardView.test.tsx
git commit -m "feat(dashboard): wire DashboardView to new scatter chart, metrics strip, and timeline"
```

---

### Task 6: Remove old components and update test suite

**Files:**
- Delete: `src/components/dashboard/ActivityHeatmap.tsx`
- Delete: `src/components/dashboard/StatCards.tsx`
- Delete: `src/components/dashboard/AgentUsageBars.tsx`
- Delete: `src/components/dashboard/__tests__/ActivityHeatmap.test.tsx`
- Delete: `src/components/dashboard/__tests__/StatCards.test.tsx`
- Delete: `src/components/dashboard/__tests__/AgentUsageBars.test.tsx`

**Step 1: Delete old component files**

```bash
rm src/components/dashboard/ActivityHeatmap.tsx
rm src/components/dashboard/StatCards.tsx
rm src/components/dashboard/AgentUsageBars.tsx
rm src/components/dashboard/__tests__/ActivityHeatmap.test.tsx
rm src/components/dashboard/__tests__/StatCards.test.tsx
rm src/components/dashboard/__tests__/AgentUsageBars.test.tsx
```

**Step 2: Verify no remaining imports to deleted files**

Search for any remaining imports of the removed components across the codebase. Fix any found.

Run: `grep -r "ActivityHeatmap\|StatCards\|AgentUsageBars" src/ --include="*.ts" --include="*.tsx"`
Expected: Zero results (DashboardView was already updated in Task 5)

**Step 3: Run full test suite**

Run: `bun run test`
Expected: ALL PASS — no regressions

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(dashboard): remove old ActivityHeatmap, StatCards, and AgentUsageBars components"
```

---

### Task 7: Visual polish and entry animations

**Files:**
- Modify: `src/components/dashboard/SessionScatterChart.tsx` (add staggered entry animation and glow)

**Step 1: Add SVG glow filter definition**

In `SessionScatterChart.tsx`, inside the D3 `useEffect`, after creating the SVG, add a `<defs>` block:

```tsx
// Add glow filter for dark mode
const defs = svg.append('defs')
const filter = defs.append('filter').attr('id', 'dot-glow')
filter.append('feGaussianBlur').attr('stdDeviation', '1.5').attr('result', 'blur')
const merge = filter.append('feMerge')
merge.append('feMergeNode').attr('in', 'blur')
merge.append('feMergeNode').attr('in', 'SourceGraphic')
```

Apply to active dots only in dark mode: check `document.documentElement.classList.contains('dark')` and if so, `.attr('filter', 'url(#dot-glow)')`.

**Step 2: Add staggered entry animation**

When rendering circles, set initial opacity to 0, then:

```tsx
circle
  .attr('opacity', 0)
  .transition()
  .delay((_, i) => i * 8)
  .duration(400)
  .ease(d3.easeCubicOut)
  .attr('opacity', finalOpacity)
```

**Step 3: Add hover scale effect**

On mouseenter, scale the dot:

```tsx
.on('mouseenter', function(event) {
  d3.select(this).transition().duration(150).attr('r', radius * 1.3)
  // ... tooltip logic
})
.on('mouseleave', function() {
  d3.select(this).transition().duration(150).attr('r', radius)
  // ... tooltip hide
})
```

**Step 4: Run all tests**

Run: `bun run test`
Expected: ALL PASS

**Step 5: Manual visual check**

Run: `bun tauri dev` and verify:
- Dots fade in with staggered animation
- Dark mode: dots have subtle glow
- Light mode: no glow, clean flat look
- Hover: dots scale up smoothly
- Tooltips appear correctly

**Step 6: Commit**

```bash
git add src/components/dashboard/SessionScatterChart.tsx
git commit -m "feat(dashboard): add dot glow, staggered entry animation, and hover scale effect"
```

---

### Task 8: Final integration test and full verification

**Step 1: Run full test suite**

Run: `bun run test`
Expected: ALL PASS

**Step 2: Type check**

Run: `bun run build` (or `npx tsc --noEmit`)
Expected: No TypeScript errors

**Step 3: Visual verification in app**

Run: `bun tauri dev`

Verify:
- [ ] Dense dot matrix renders with 6-12 dots per active day
- [ ] Dots are colored by agent (blue=Claude, green=Codex, purple=Gemini, amber=Ollama)
- [ ] Dot sizes vary by message volume
- [ ] Y-axis labels show token scale (0, 500, 1K, 5K, 10K, 50K)
- [ ] Month labels appear at top
- [ ] Agent legend pills render below chart
- [ ] 5 metrics strip widgets render below chart with sparklines
- [ ] Activity timeline histogram renders at bottom
- [ ] Dark mode: deep navy bg, dot glow, bright colors
- [ ] Light mode: light bg, no glow, adapted colors
- [ ] Hover tooltips work on dots
- [ ] Entry animations play on load
- [ ] Time range selector (7/30/90 days) still works
- [ ] Empty state still renders when no data
- [ ] Responsive layout works on narrow window

**Step 4: Final commit (if any adjustments were made)**

```bash
git add -A
git commit -m "feat(dashboard): complete session scatter matrix dashboard redesign"
```

---

## Task Dependency Order

```
Task 1 (CSS vars) → Task 2 (ScatterChart) → Task 5 (Wire DashboardView)
                  → Task 3 (MetricsStrip) → Task 5
                  → Task 4 (Timeline)     → Task 5 → Task 6 (Cleanup) → Task 7 (Polish) → Task 8 (Verify)
```

Tasks 2, 3, 4 can run in **parallel** (no dependencies between them).
Tasks 5, 6, 7, 8 must run **sequentially**.
