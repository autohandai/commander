# Product Requirements Document: Chat Default View on Project Select

## Overview
- **Problem:** When a user selects or opens a project, the UI shows the Code tab by default, forcing extra interaction to reach the chat workspace.
- **Outcome:** Selecting, opening, or creating a project must land the user directly in the Chat tab so conversational workflows remain primary.
- **Success Metrics:** Zero additional clicks required to reach Chat immediately after any project activation flow.

## Requirements
- Switching to any project (recents list, open dialog, menu, CLI-start, post-create) must activate the Chat tab by default.
- Returning to Welcome must *not* alter the chat-first preference when re-entering a project.
- Active tab state persists within a project session; manual tab switches must still function.
- No regressions to breadcrumb, sidebar, or history functionality.

## Constraints & Assumptions
- Applies only once a project becomes active; welcome screen remains unchanged.
- Tabs component already supports controlled `value`; only state transitions need adjusting.
- No backend changes required; behavior is purely frontend state management.

## User Journey
1. User launches Commander, opens an existing project → Chat tab visible immediately.
2. User selects a recent project from welcome list → Chat tab already active.
3. User creates or clones a project → Chat tab shows after project loads.
4. User reopens Commander from CLI project flag → Chat tab displays on load.

## Open Questions
- None identified.

## Test Plan
- Add a UI test verifying that selecting a recent project results in the Chat tab trigger being active.
- Ensure regression tests confirming welcome recents rendering continue to pass.

