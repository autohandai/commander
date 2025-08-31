# Autohand.ai Commander

Native desktop application built with Tauri v2, React, and TypeScript. Commander streamlines developer workflows with project automation, Git operations, and AI‑assisted tooling — packaged as a secure, lightweight desktop app.

This repo follows strict modular architecture and test‑driven development. All contributions must preserve existing tests and structure.

## Features

- Native Tauri v2 backend with focused services
- Modern React UI with Vite and Tailwind
- Git and filesystem operations (service‑layer only)
- Clear error modeling and messages
- Cross‑platform builds (Apple Silicon, Intel macOS, Windows)

## Architecture

Backend (Rust) strictly follows a modular layout:

```
src-tauri/src/
├── models/          # Data structures only
├── services/        # Business logic only  
├── commands/        # Tauri command handlers (thin)
├── tests/           # Comprehensive tests (MANDATORY)
├── lib.rs           # Minimal entry point
└── error.rs         # Error types
```

Rules:
- No business logic in `commands/` or `lib.rs`
- Add new logic in `services/` with corresponding `models/`
- All changes must be covered by tests in `tests/`

## Prerequisites

- Rust (stable) and Cargo
- Bun (recommended) or Node.js
- macOS or Windows build tools (Xcode for macOS; Visual Studio Build Tools on Windows runners are preinstalled)

## Local Development

- Install dependencies: `bun install`
- Start in dev mode: `bun tauri dev`

The Tauri config runs the frontend with Vite and bundles assets from `dist/`:

- `src-tauri/tauri.conf.json` → `build.beforeDevCommand` = `bun run dev`
- `src-tauri/tauri.conf.json` → `build.beforeBuildCommand` = `bun run build`

## Tests (TDD required)

We practice strict TDD:

1) Write failing tests (success + failure + edge cases) in `src-tauri/src/tests/`
2) Implement minimal code in `services/` and `models/`
3) Keep command handlers thin and delegating to services
4) Verify all tests pass before submitting

Run tests:

```
cd src-tauri
cargo test
```

## Build

Local release build:

```
# From repo root
bun run tauri build
```

Artifacts are emitted under `src-tauri/target/release/bundle/`.

## CI (GitHub Actions)

This repository includes a cross‑platform workflow that:

- Runs Rust tests on Linux
- Builds notarization‑ready artifacts for:
  - Apple Silicon (`macos-14`)
  - Intel macOS (`macos-13`)
  - Windows (`windows-latest`)

Unsigned artifacts are uploaded for each platform. You can add signing credentials later via repository secrets (see comments in workflow file).

## Contributing

Please read `CODE_OF_CONDUCT.md` before contributing. PRs must:

- Preserve existing tests (no regressions)
- Include tests for any change
- Follow the architecture pattern

## License

This project is open source. If a `LICENSE` file is not yet present, contributions are accepted under the project’s intended license to be clarified during the initial public release.
