# Codex-ACP Sidecar Bundling — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle the `codex-acp` binary from zed-industries/codex-acp as a Tauri v2 sidecar so Commander ships with ACP support for Codex out of the box.

**Architecture:** A build-time script downloads the platform-appropriate `codex-acp` binary into `src-tauri/binaries/`. Tauri's `externalBin` bundler places it next to the main executable at build time. A new `sidecar.rs` module resolves bundled binaries at runtime (sidecar first, PATH fallback). The ACP executor accepts a pre-resolved binary path instead of doing its own `which::which` lookup.

**Tech Stack:** Rust, Tauri v2 (sidecar/externalBin), Bash (download script), `which` crate (fallback)

**Spec:** `docs/superpowers/specs/2026-03-16-codex-acp-sidecar-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src-tauri/scripts/download-codex-acp.sh` | Create | Download platform binary from GitHub releases |
| `src-tauri/src/services/sidecar.rs` | Create | Resolve bundled sidecar path (exe-relative → PATH fallback) |
| `src-tauri/src/tests/services/sidecar.rs` | Create | Unit tests for sidecar resolution |
| `src-tauri/tauri.conf.json` | Modify | Add `externalBin`, update build commands |
| `src-tauri/capabilities/default.json` | Modify | No changes needed — process spawning uses `tokio::process::Command`, not Tauri shell plugin |
| `src-tauri/src/services/mod.rs` | Modify | Add `pub mod sidecar` |
| `src-tauri/src/services/executors/acp_executor.rs` | Modify | Accept pre-resolved binary path instead of `which::which` |
| `src-tauri/src/commands/cli_commands.rs` | Modify | Map `"codex"` → `"codex-acp"` sidecar when ACP transport |
| `src-tauri/src/services/agent_status_service.rs` | Modify | Detect bundled sidecar for codex availability |
| `.gitignore` | Modify | Add `src-tauri/binaries/` |
| `src-tauri/src/tests/services/mod.rs` | Modify | Add `mod sidecar` |

---

## Chunk 1: Foundation — Sidecar Resolution Module + Tests

### Task 1: Add `src-tauri/binaries/` to `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add binaries directory exclusion**

Add at the end of `.gitignore`:

```
# Bundled sidecar binaries (downloaded at build time)
src-tauri/binaries/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: exclude sidecar binaries from version control"
```

---

### Task 2: Create sidecar resolution module with tests (TDD)

**Files:**
- Create: `src-tauri/src/services/sidecar.rs`
- Create: `src-tauri/src/tests/services/sidecar.rs`
- Modify: `src-tauri/src/services/mod.rs:20` (add `pub mod sidecar`)
- Modify: `src-tauri/src/tests/services/mod.rs` (add `mod sidecar`)

- [ ] **Step 1: Write failing tests**

Create `src-tauri/src/tests/services/sidecar.rs`:

```rust
#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use crate::services::sidecar::resolve_sidecar;

    #[cfg(unix)]
    #[test]
    fn test_resolve_sidecar_finds_binary_in_given_dir() {
        use std::fs;
        use std::os::unix::fs::PermissionsExt;

        let tmp = TempDir::new().unwrap();
        let binary = tmp.path().join("codex-acp");
        fs::write(&binary, b"#!/bin/sh\ntrue").unwrap();
        fs::set_permissions(&binary, fs::Permissions::from_mode(0o755)).unwrap();

        let result = resolve_sidecar("codex-acp", Some(tmp.path()));
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(result.unwrap(), binary);
    }

    #[test]
    fn test_resolve_sidecar_falls_back_to_path() {
        // Use a binary that definitely exists in PATH
        let result = resolve_sidecar("sh", Some(std::path::Path::new("/nonexistent")));
        assert!(result.is_ok(), "expected Ok via PATH fallback, got {:?}", result);
    }

    #[test]
    fn test_resolve_sidecar_returns_error_when_missing() {
        let result = resolve_sidecar(
            "definitely-not-a-real-binary-xyz",
            Some(std::path::Path::new("/nonexistent")),
        );
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("not found"),
            "error should mention 'not found', got: {}",
            err
        );
    }
}
```

- [ ] **Step 2: Register the test module**

In `src-tauri/src/tests/services/mod.rs`, add:

```rust
mod sidecar;
```

- [ ] **Step 3: Create stub sidecar module**

Create `src-tauri/src/services/sidecar.rs`:

```rust
use std::path::{Path, PathBuf};

/// Resolve the path to a bundled sidecar binary.
///
/// Resolution order:
/// 1. Check `exe_dir` (the directory next to the main executable, passed by caller)
/// 2. Fallback: check system PATH via `which`
///
/// Returns `Ok(path)` if found, `Err(message)` with diagnostic info if not.
pub fn resolve_sidecar(_name: &str, _exe_dir: Option<&Path>) -> Result<PathBuf, String> {
    Err("not implemented".to_string())
}
```

- [ ] **Step 4: Register the module in services/mod.rs**

In `src-tauri/src/services/mod.rs`, add after line 19:

```rust
pub mod sidecar;
```

- [ ] **Step 5: Run tests — verify they fail**

```bash
cd src-tauri && cargo test sidecar -- --nocapture
```

Expected: `test_resolve_sidecar_finds_binary_in_given_dir` FAILS (returns "not implemented").

- [ ] **Step 6: Implement `resolve_sidecar`**

Replace the stub in `src-tauri/src/services/sidecar.rs`:

```rust
use std::path::{Path, PathBuf};

/// Resolve the path to a bundled sidecar binary.
///
/// Resolution order:
/// 1. Check `exe_dir` (directory next to the main executable)
/// 2. Fallback: check system PATH via `which`
///
/// Returns `Ok(path)` if found, `Err(message)` with diagnostic info if not.
pub fn resolve_sidecar(name: &str, exe_dir: Option<&Path>) -> Result<PathBuf, String> {
    // 1. Check next to main executable (bundled sidecar)
    if let Some(dir) = exe_dir {
        let sidecar = dir.join(name);
        if sidecar.exists() {
            return Ok(sidecar);
        }
    }

    // 2. Fallback: check PATH
    if let Ok(path) = which::which(name) {
        return Ok(path);
    }

    Err(format!(
        "'{}' not found. Checked: app bundle (next to executable), system PATH. \
         Install it or ensure the Commander app bundle includes the sidecar.",
        name
    ))
}

/// Get the directory containing the current executable.
/// Returns `None` if the path cannot be determined.
pub fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
}
```

- [ ] **Step 7: Run tests — verify they pass**

```bash
cd src-tauri && cargo test sidecar -- --nocapture
```

Expected: All 3 tests PASS.

- [ ] **Step 8: Run full test suite — no regressions**

```bash
cd src-tauri && cargo test
```

Expected: All existing tests still pass.

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/services/sidecar.rs src-tauri/src/services/mod.rs src-tauri/src/tests/services/sidecar.rs src-tauri/src/tests/services/mod.rs
git commit -m "feat(sidecar): add sidecar resolution module with exe-dir + PATH fallback"
```

---

## Chunk 2: ACP Executor + CLI Commands Integration

### Task 3: Update ACP executor to accept pre-resolved binary path

**Files:**
- Modify: `src-tauri/src/services/executors/acp_executor.rs:240-243`

The ACP executor currently resolves the agent binary via `which::which(agent)` at line 241. We change this so the caller can pass a full path (from sidecar resolution) and the executor just validates it exists.

- [ ] **Step 1: Modify binary resolution in `execute()`**

In `src-tauri/src/services/executors/acp_executor.rs`, replace lines 240-243:

```rust
        // 1. Resolve agent binary path
        let agent_path = which::which(agent).map_err(|e| {
            CommanderError::command(agent, None, format!("agent not found in PATH: {}", e))
        })?;
```

With:

```rust
        // 1. Resolve agent binary path.
        // The caller may pass an absolute path (pre-resolved via sidecar module)
        // or a bare command name (resolved via PATH).
        let agent_path = {
            let candidate = std::path::PathBuf::from(agent);
            if candidate.is_absolute() && candidate.exists() {
                candidate
            } else {
                which::which(agent).map_err(|e| {
                    CommanderError::command(
                        agent,
                        None,
                        format!("agent not found in PATH: {}", e),
                    )
                })?
            }
        };
```

- [ ] **Step 2: Verify compilation**

```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

- [ ] **Step 3: Run tests — no regressions**

```bash
cd src-tauri && cargo test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/executors/acp_executor.rs
git commit -m "feat(acp-executor): accept pre-resolved absolute paths for agent binary"
```

---

### Task 4: Map `"codex"` → `"codex-acp"` sidecar in CLI commands

**Files:**
- Modify: `src-tauri/src/commands/cli_commands.rs:948-951`

When the codex agent uses ACP transport, resolve the sidecar binary path and pass it to the executor. **Important:** The resolved binary path is only used for spawning. Session management and UI continue to use the original `agent_name` ("codex") for display and lookups.

- [ ] **Step 1: Add sidecar resolution for codex ACP**

In `src-tauri/src/commands/cli_commands.rs`, replace lines 948-951 (the `Some("acp")` arm):

```rust
            Some("acp") => {
                let flag = cache.get(&agent_name).and_then(|e| e.flag_variant.clone());
                Box::new(crate::services::executors::acp_executor::AcpExecutor::new(flag))
                    as Box<dyn AgentExecutor>
            }
```

With:

```rust
            Some("acp") => {
                let flag = cache.get(&agent_name).and_then(|e| e.flag_variant.clone());
                // For codex, resolve "codex-acp" sidecar binary (bundled or PATH).
                if agent_name.eq_ignore_ascii_case("codex") {
                    let resolved = crate::services::sidecar::resolve_sidecar(
                        "codex-acp",
                        crate::services::sidecar::exe_dir().as_deref(),
                    );
                    match resolved {
                        Ok(path) => {
                            resolved_binary_path = path.to_string_lossy().to_string();
                            sidecar_resolved = true;
                        }
                        Err(_) => {
                            // Fall through with "codex-acp" as bare name
                            // so the executor can try which::which or produce a clear error.
                            resolved_binary_path = "codex-acp".to_string();
                        }
                    }
                }
                Box::new(crate::services::executors::acp_executor::AcpExecutor::new(flag))
                    as Box<dyn AgentExecutor>
            }
```

This requires adding two variables before the match. Add these lines just before the `let mut executor = match ...` block (around line 941):

```rust
        // resolved_binary_path: the actual binary to spawn (may differ from agent_name for sidecars).
        // agent_name is preserved for session management, UI display, and lookups.
        let mut resolved_binary_path = agent_name.clone();
        let mut sidecar_resolved = false;
```

- [ ] **Step 2: Update the `executor.execute()` call site**

Find the `executor.execute()` call (around line 995-1003). Change **only** the `agent` argument from `&agent_name` to `&resolved_binary_path`. All other uses of `agent_name` (session management, UI events, ManagedSession) must stay as `agent_name`.

Before:
```rust
executor.execute(&app_clone, &session_id_clone, &agent_name, ...
```

After:
```rust
executor.execute(&app_clone, &session_id_clone, &resolved_binary_path, ...
```

- [ ] **Step 3: Also update the command availability check for codex+acp**

The `check_command_available(&agent_name)` at line 899 will fail for codex when the binary is `codex-acp` (bundled). Use the explicit `sidecar_resolved` flag to skip:

Move the `check_command_available` call to **after** the executor creation block (since `sidecar_resolved` is set during executor creation). Then wrap it:

```rust
        if !sidecar_resolved && !check_command_available(&agent_name).await {
            // ... existing error handling ...
        }
```

- [ ] **Step 4: Verify compilation**

```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

- [ ] **Step 5: Run tests — no regressions**

```bash
cd src-tauri && cargo test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/cli_commands.rs
git commit -m "feat(codex): resolve codex-acp sidecar binary for ACP transport"
```

---

### Task 5: Update agent status service for sidecar detection

**Files:**
- Modify: `src-tauri/src/services/agent_status_service.rs:178-186`

After the standard PATH check fails for codex, try the sidecar as a fallback.

- [ ] **Step 1: Add sidecar fallback in availability check**

In `src-tauri/src/services/agent_status_service.rs`, after the `Ok(false)` arm (line 178-181) and before `Err(err)` (line 183), the `available` variable is `false` at this point. After the entire `match self.probe.locate(...)` block (after line 187), add:

```rust
            // Sidecar fallback: for codex, check if codex-acp is bundled
            if !available && definition.id == "codex" {
                if crate::services::sidecar::resolve_sidecar(
                    "codex-acp",
                    crate::services::sidecar::exe_dir().as_deref(),
                )
                .is_ok()
                {
                    available = true;
                    command_version = Some("codex-acp (bundled)".to_string());
                    error_message = None;
                }
            }
```

- [ ] **Step 2: Verify compilation**

```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

- [ ] **Step 3: Run tests — no regressions**

```bash
cd src-tauri && cargo test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/services/agent_status_service.rs
git commit -m "feat(agent-status): detect bundled codex-acp sidecar for availability check"
```

---

## Chunk 3: Build Configuration + Download Script

### Task 6: Create the download script

**Files:**
- Create: `src-tauri/scripts/download-codex-acp.sh`

- [ ] **Step 1: Create the scripts directory and download script**

```bash
mkdir -p src-tauri/scripts
```

Create `src-tauri/scripts/download-codex-acp.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

VERSION="0.10.0"
REPO="zed-industries/codex-acp"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="${SCRIPT_DIR}/../binaries"

# Detect target triple (host platform only — cross-compilation not supported)
detect_target() {
  local arch os
  arch=$(uname -m)
  os=$(uname -s)

  case "$arch" in
    x86_64|amd64) arch="x86_64" ;;
    arm64|aarch64) arch="aarch64" ;;
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
  esac

  case "$os" in
    Darwin) echo "${arch}-apple-darwin" ;;
    Linux)  echo "${arch}-unknown-linux-gnu" ;;
    MINGW*|MSYS*|CYGWIN*) echo "${arch}-pc-windows-msvc" ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac
}

TARGET=$(detect_target)
BINARY_NAME="codex-acp-${TARGET}"
DEST="${TARGET_DIR}/${BINARY_NAME}"
VERSION_FILE="${TARGET_DIR}/.codex-acp-version"

# Skip if already downloaded at the correct version.
# Cache invalidation: changing VERSION above will trigger a re-download.
if [[ -f "$DEST" && -f "$VERSION_FILE" ]] && [[ "$(cat "$VERSION_FILE")" == "$VERSION" ]]; then
  echo "codex-acp v${VERSION} already exists at ${DEST}, skipping download."
  exit 0
fi

mkdir -p "$TARGET_DIR"

# Download and extract
ARCHIVE="codex-acp-${VERSION}-${TARGET}"
case "$TARGET" in
  *windows*) EXT="zip" ;;
  *)         EXT="tar.gz" ;;
esac

URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ARCHIVE}.${EXT}"
echo "Downloading codex-acp v${VERSION} for ${TARGET}..."
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

curl -fSL "$URL" -o "${TMPDIR}/archive.${EXT}"

case "$EXT" in
  tar.gz) tar -xzf "${TMPDIR}/archive.${EXT}" -C "$TMPDIR" ;;
  zip)    unzip -q "${TMPDIR}/archive.${EXT}" -d "$TMPDIR" ;;
esac

# Find the binary in extracted contents
EXTRACTED=$(find "$TMPDIR" -type f \( -name "codex-acp" -o -name "codex-acp.exe" \) | head -1)
if [[ -z "$EXTRACTED" ]]; then
  echo "ERROR: codex-acp binary not found in archive" >&2
  exit 1
fi

# Validate it's an executable binary (not a text file or symlink)
if [[ "$(uname -s)" != MINGW* ]] && ! file "$EXTRACTED" | grep -qiE "executable|Mach-O|ELF"; then
  echo "ERROR: extracted file does not appear to be an executable binary" >&2
  exit 1
fi

cp "$EXTRACTED" "$DEST"
chmod +x "$DEST"

# Write version marker for cache invalidation
echo "$VERSION" > "$VERSION_FILE"

echo "codex-acp v${VERSION} installed to ${DEST}"
```

- [ ] **Step 2: Make script executable**

```bash
chmod +x src-tauri/scripts/download-codex-acp.sh
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/scripts/download-codex-acp.sh
git commit -m "feat(build): add download script for codex-acp sidecar binary"
```

---

### Task 7: Update Tauri configuration

**Files:**
- Modify: `src-tauri/tauri.conf.json:6-11` (build commands)
- Modify: `src-tauri/tauri.conf.json:41-54` (bundle section — add `externalBin`)

- [ ] **Step 1: Add `externalBin` to bundle section**

In `src-tauri/tauri.conf.json`, add `externalBin` inside the `"bundle"` object (after line 53, before the closing `}`):

```jsonc
    "externalBin": [
      "binaries/codex-acp"
    ]
```

Tauri automatically appends the target triple suffix (`-aarch64-apple-darwin`, etc.) and copies the matching binary into the app bundle.

- [ ] **Step 2: Update build commands**

In `src-tauri/tauri.conf.json`, update the build section (lines 7 and 9):

Line 7 — `beforeDevCommand`:
```json
"beforeDevCommand": "bash src-tauri/scripts/download-codex-acp.sh; bun run dev"
```

Line 9 — `beforeBuildCommand`:
```json
"beforeBuildCommand": "bash src-tauri/scripts/download-codex-acp.sh && VITE_SKIP_TYPE_CHECK=1 bun vite build"
```

Note: `beforeDevCommand` uses `;` (not `&&`) so the dev server starts even if download fails (offline dev).

- [ ] **Step 3: Verify compilation**

Note: Shell permissions (`shell:allow-execute`, `shell:allow-spawn`) are NOT needed because the ACP executor spawns processes via `tokio::process::Command`, which bypasses Tauri's shell plugin. No changes to `capabilities/default.json` required.

- [ ] **Step 4: Verify compilation**

```bash
cd src-tauri && cargo check
```

Expected: Compiles without errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(tauri): configure externalBin for codex-acp sidecar bundling"
```

---

### Task 8: Test the download script

**Files:**
- Run: `src-tauri/scripts/download-codex-acp.sh`

- [ ] **Step 1: Run the download script**

```bash
bash src-tauri/scripts/download-codex-acp.sh
```

Expected output: `Downloading codex-acp v0.10.0 for aarch64-apple-darwin...` (or matching arch), then `codex-acp v0.10.0 installed to ...`.

- [ ] **Step 2: Verify binary exists and is executable**

```bash
ls -la src-tauri/binaries/codex-acp-*
file src-tauri/binaries/codex-acp-*
```

Expected: Binary file, Mach-O executable (on macOS ARM: `Mach-O 64-bit executable arm64`).

- [ ] **Step 3: Run script again — verify skip**

```bash
bash src-tauri/scripts/download-codex-acp.sh
```

Expected: `codex-acp already exists at ..., skipping download.`

- [ ] **Step 4: Verify the binary is gitignored**

```bash
git status src-tauri/binaries/
```

Expected: No files shown (directory is gitignored).

---

### Task 9: Full integration verification

- [ ] **Step 1: Run full Rust test suite**

```bash
cd src-tauri && cargo test
```

Expected: All tests pass, including new sidecar tests.

- [ ] **Step 2: Check compilation of entire project**

```bash
cd src-tauri && cargo check
```

Expected: No errors.

- [ ] **Step 3: Run dev mode to verify build pipeline**

```bash
cd /Users/igorcosta/Documents/autohand/new/commander && bun tauri dev
```

Expected: Download script runs (or skips), then dev server starts, app launches. Codex shows as available with "codex-acp (bundled)" version if the sidecar is present.

- [ ] **Step 4: Manual verification in the app**

1. Open Settings → Agent Registry → Codex
2. Verify transport dropdown shows "ACP"
3. Verify Codex shows as "available" with "codex-acp (bundled)" version
4. Send a test message to Codex via ACP transport
5. Verify streaming response works

- [ ] **Step 5: Final commit if any remaining changes**

```bash
git add -A && git status
# Only commit if there are changes
```
