# Commander

![Commander Demo](./Commander.gif)

Commander is a native Tauri v2 desktop app that orchestrates multiple CLI coding agents against any Git project. It keeps every workflow local, manages agent workspaces with Git worktrees, and wraps advanced Git + filesystem automation inside a React/Vite interface.

## What Works Today
- Multi-agent chat surface for Claude Code CLI, OpenAI Codex CLI, Gemini CLI, and a local test harness – each with live streaming, plan mode, and parallel session tracking.
- Workspace-aware execution that spins up Git worktrees under `.commander/` so every agent operates in an isolated branch without touching your main tree.
- Project lifecycle management: clone repos with progress streaming, validate Git remotes, open existing repositories, and persist a capped MRU list with branch/status metadata.
- Deep Git tooling: commit DAG visualization, diff viewer, branch/worktree selectors, and Git config/alias inspection exposed through the Tauri commands layer.
- Persistent chat history, provider settings, execution modes, and prompts stored locally via `tauri-plugin-store`, so every project resumes exactly where you left off.
- Settings modal backed by tests for loading/saving provider configuration, global system prompt management, agent enablement, and automatic CLI detection feedback.
- Shadcn/ui-based desktop interface with file mentions, autocomplete for slash (`/`) and at (`@`) commands, rotating prompts, and a session control bar for replaying or clearing runs.

## Requirements
- macOS (Apple Silicon or Intel) or Windows 11 with Git installed and on the `PATH`.
- Rust stable toolchain + Cargo.
- Bun (preferred) or Node.js 18+.
- CLI agents you want to use:
  - [Claude Code CLI](https://www.npmjs.com/package/@anthropic-ai/claude-code)
  - [OpenAI Codex CLI](https://github.com/openai/codex)
  - [Google Gemini CLI](https://ai.google.dev/gemini-api/docs/gemini-cli)
  - (Optional) GitHub CLI for repo metadata in the sidebar.

## Quick Start
1. Install dependencies: `bun install`
2. Launch the desktop app: `bun tauri dev`
3. Point Commander at an existing Git repository or use the clone flow from the project launcher.
4. Start a chat with `/claude`, `/codex`, or `/gemini` – Commander will stream output, create worktrees when needed, and persist the conversation per project.

### Agent Setup Cheatsheet
```bash
# Claude Code CLI
npm install -g @anthropic-ai/claude-code
claude  # run once and authenticate with /login inside the shell

# OpenAI Codex CLI
npm install -g @openai/codex
codex  # follow the interactive auth flow

# Gemini CLI
npm install -g @google/gemini-cli@latest
# or follow the official docs for your platform
```
Commander detects installed CLIs on launch and surfaces their status in **Settings → LLM Providers**. Disabled agents can be toggled per-session; missing installs display remediation tips.

## Workspaces & Git Automation
- When workspace mode is enabled, Commander creates worktrees under `<project>/.commander/<workspace-name>` and routes all CLI commands there.
- Workspaces can be selected or created from the chat header; automatic naming uses the first words of your prompt, while manual creation offers curated name suggestions.
- Git validation, branch detection, and status summaries are handled inside `src-tauri/src/services/git_service.rs` and exposed through thin Tauri commands.
- The History view renders a commit graph (lane assignment + edge connections), lets you diff commits or compare a workspace against main, and refreshes branches/worktrees on demand.

## Settings, Prompts, and Persistence
- Provider settings (API keys, models, flags) are merged from system defaults, user config, and per-project overrides using the `agent_cli_settings_service`.
- Global system prompt lives in the General tab; agent-specific prompts are removed for simplicity and backwards compatibility is handled with serde defaults.
- Execution modes (`chat`, `collab`, `full`) and safety toggles persist via `execution_mode_service`, ensuring consistent behaviour between app restarts.
- Chat transcripts are stored per project so you can close Commander and resume conversations later without losing streaming context.

## Testing & Quality Gates
Commander follows strict TDD.
- Backend tests: `cd src-tauri && cargo test` (12+ tests covering services, commands, and error handling must stay green).
- Frontend tests: `bun run test`
- Combined helper: `./run_tests.sh`
Before submitting changes, also run `cargo check` and, when relevant, `bun tauri build` to ensure the desktop bundle compiles.

## What's Next
- Harden multi-agent orchestration and connect additional CLI agents.
- Export commands and chat history to a local proxy server for auditing.
- Refine the diff view with richer context, comparisons, and navigation.
- Handshake local model routing so on-device models run locally before falling back to remote agents.

## Architecture Overview
```
src-tauri/src/
├── models/          # Data structures only
├── services/        # Business logic (Git, agents, workspaces, settings, prompts)
├── commands/        # Thin Tauri handlers delegating to services
├── tests/           # Integration + service tests (TDD-required)
├── lib.rs           # Entry point wiring commands/plugins
└── error.rs         # Shared error types
```

The React front end (see `src/`) is organized by feature domains (chat, settings, history, ui primitives). State is handled with hooks (`useChatExecution`, `useAgentEnablement`, `useChatPersistence`, etc.) so business rules stay testable at the service layer.

## Contributing
- Follow the architecture rules in `AGENTS.md` and the Commander TDD checklist.
- Add failing tests first, keep command handlers thin, and never regress the 12 baseline tests.
- Use `user_prompts/` to document product context or feature briefs before shipping significant changes.

## Privacy & Data Handling
All automation happens locally. Commander never uploads your code or chat history; only the CLI agents you enable communicate with their respective providers, following their opt-in policies.
