# Product Requirements Document: App Settings File Persistence

## 1. Overview
- **Problem:** Only a small subset of user preferences are mirrored into `~/.commander/settings.json`, leaving most Settings panel changes trapped inside the plugin store. Users editing or backing up the JSON file cannot recover their preferences after reinstalling the app.
- **Goal:** Persist the full application settings payload to the user-facing JSON file while preserving backwards compatibility with the existing partial schema.
- **Outcome:** Every Settings change remains configurable through the Settings panel, survives restarts and reinstalls, and is inspectable/editable via the JSON config without manual intervention.

## 2. Context
- Frontend defaults are seeded from hardcoded values in `settings-context.tsx`.
- Rust `AppSettings` currently writes to the plugin store and only mirrors two booleans into the JSON file.
- Existing integration tests cover welcome screen toggles and auto-collapse but do not assert full-file persistence or schema migration.

## 3. Requirements
### Functional
1. Saving settings must write the complete `AppSettings` struct (including nested `code_settings` and `default_cli_agent`) to `~/.commander/settings.json`.
2. Loading settings must merge values from the JSON file, falling back to defaults for missing fields and sanitising invalid values.
3. Maintain compatibility with legacy files containing only `general.show_recent_projects_welcome_screen` and `code.auto_collapse_sidebar`, but write back a single `app_settings` object without legacy duplicates.
4. Ensure serialized JSON ends with a newline so shell viewers do not append `%` sentinels and tooling treats the file as well-formed.

### Non-Functional
- Writes must be idempotent and resilient to partial files (e.g., invalid JSON resets gracefully to defaults).
- Operations should not degrade load/save performance perceptibly (<50ms overhead).
- Tests must validate save/load behaviour and migration from legacy schema.

## 4. User Experience
- Settings panel remains the single point for updates; users can still hand-edit the JSON file when needed.
- No visual changes expected; success measured via persistence accuracy across relaunches and reinstalls.

## 5. Risks & Mitigations
- **Risk:** Overwriting user-customised fields not represented in `AppSettings`.
  - *Mitigation:* Preserve unknown top-level keys when writing back to the JSON file.
- **Risk:** Legacy files missing the new structure could cause panics during deserialisation.
  - *Mitigation:* Implement tolerant parsing with defaults and integration tests covering upgrade path.

## 6. Deliverables
- Updated Rust services/commands that synchronise settings between the plugin store and JSON.
- Migration-aware loader/saver with unit + integration tests.
- Documentation (this PRD and accompanying TDD) describing behaviours and test coverage expectations.
