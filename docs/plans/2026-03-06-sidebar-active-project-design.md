# Design: Sidebar Active Project Styling + Task Indicator

**Date**: 2026-03-06
**Status**: Approved

## Problem

1. Active project in the sidebar uses `bg-primary text-primary-foreground` which renders as a harsh near-black background with white text in light mode. Dark mode looks fine because `--sidebar-primary` is blue.
2. No visual indication when an agent is actively running/streaming for a project.

## Design

### 1. Light Mode Active Project — Subtle Accent Tint

**Approach**: Replace the heavy `bg-primary` with a new `--sidebar-active` CSS variable that provides a soft, tinted background in both modes.

- **Light mode**: `--sidebar-active: 214 95% 93%` (soft blue tint, similar to macOS Finder selection)
- **Dark mode**: `--sidebar-active: 224 50% 18%` (subtle blue-tinted dark, complementing the existing sidebar background)
- **Active text**: Uses `--sidebar-accent-foreground` (dark text in light, light text in dark) — no change needed
- **Left indicator bar**: 2px left border using `hsl(var(--sidebar-primary))` for color accent
- Remove the existing invisible white indicator div

**CSS changes** (`index.css`):
```css
:root {
  --sidebar-active: 214 95% 93%;
  --sidebar-active-foreground: 240 5.9% 10%;
}
.dark {
  --sidebar-active: 224 50% 18%;
  --sidebar-active-foreground: 0 0% 98%;
}
```

**Component changes** (`app-sidebar.tsx`):
```tsx
// Replace: bg-primary text-primary-foreground
// With:    bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))] border-l-2 border-[hsl(var(--sidebar-primary))]
```

### 2. Mini Donut Task Indicator

**Data flow**:
1. `ChatInterface` already tracks `executingSessions: Set<string>`
2. Add `onExecutingChange?: (count: number) => void` prop to `ChatInterface`
3. `App.tsx` passes callback, stores `isProjectExecuting: boolean`
4. `App.tsx` passes `isProjectExecuting` to `AppSidebar`
5. `AppSidebar` renders a 14px SVG donut ring when active

**Donut spec**:
- **Size**: 14x14px SVG
- **Idle**: Hidden (no indicator)
- **Running**: Animated spinning ring (indeterminate — we don't have per-task granularity)
- **Color**: `hsl(var(--sidebar-primary))` — matches the accent blue
- **Animation**: CSS `@keyframes spin` on the ring, 1.2s infinite linear
- **Position**: Right side of the project row, before the edge

**Component**: Inline SVG in `app-sidebar.tsx` — no new files needed.

```tsx
{isExecuting && (
  <svg className="size-3.5 animate-spin shrink-0" viewBox="0 0 14 14">
    <circle cx="7" cy="7" r="5.5" fill="none" strokeWidth="2"
      stroke="hsl(var(--sidebar-primary))" strokeOpacity="0.25" />
    <circle cx="7" cy="7" r="5.5" fill="none" strokeWidth="2"
      stroke="hsl(var(--sidebar-primary))"
      strokeDasharray="20 14" strokeLinecap="round" />
  </svg>
)}
```

## Files Changed

| File | Change |
|------|--------|
| `src/index.css` | Add `--sidebar-active` and `--sidebar-active-foreground` CSS vars |
| `src/components/app-sidebar.tsx` | Replace active class, add donut indicator, accept `isProjectExecuting` prop |
| `src/components/ChatInterface.tsx` | Add `onExecutingChange` callback prop |
| `src/App.tsx` | Wire `isProjectExecuting` state between ChatInterface and AppSidebar |

## Out of Scope

- Per-project task completion progress (would require tracking tasks per project)
- Activity indicators for non-current projects
- Donut with actual completion percentage
