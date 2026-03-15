# Dashboard Tooltips & Bug Fixes Design

Date: 2026-03-05

## Problems

1. ActivityTimeline and MetricsStrip charts have no tooltips — users can't see exact values
2. Palette changes in settings don't reflect on charts until page reload
3. SessionScatterChart redraws on every pixel of window resize (no debounce)

## Solution

### 1. Shared Tooltip Hook (`useChartTooltip`)

Create `src/hooks/useChartTooltip.ts` — returns a fixed-position DOM tooltip element with `show(event, content)` and `hide()` helpers. All three charts use the same hook for consistent styling.

Tooltip style: `#0f172a` background, `#f8fafc` text, 6px border-radius, 11px font, positioned at cursor + 12px offset.

### 2. ActivityTimeline Tooltips

- Histogram bars: hover shows `"Mar 5 — 1,200 tokens (8 messages)"`
- Agent segment bars: hover shows `"claude — 67%"`
- Add mouse event handlers to SVG rect elements

### 3. MetricsStrip Tooltips

- BarSparkline: per-bar day value
- StackedBarSparkline / BlockSparkline: agent name + count
- LineSparkline: per-point value
- PulseSparkline: active/inactive status per day

### 4. SessionScatterChart Tooltip Unification

Refactor to use the shared `useChartTooltip` hook instead of manual DOM element creation.

### 5. Palette Reactivity Fix

Pass `paletteKey` prop from DashboardView to all chart components. React will re-render them when the key changes, causing `readAgentColor()` to read updated CSS vars.

### 6. Resize Debounce

Add 150ms debounce to ResizeObserver in SessionScatterChart. Only call `setContainerWidth` after resizing stops.

## Files

| File | Change |
|------|--------|
| `src/hooks/useChartTooltip.ts` | NEW — shared tooltip hook |
| `src/components/dashboard/ActivityTimeline.tsx` | Add tooltips via hook |
| `src/components/dashboard/MetricsStrip.tsx` | Add tooltips via hook |
| `src/components/dashboard/SessionScatterChart.tsx` | Use shared hook, debounce resize |
| `src/components/dashboard/DashboardView.tsx` | Pass paletteKey prop |
