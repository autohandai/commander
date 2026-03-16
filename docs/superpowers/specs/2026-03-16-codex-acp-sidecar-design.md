# Bundle codex-acp as Tauri Sidecar

**Date:** 2026-03-16
**Status:** Draft
**Author:** Claude + Igor Costa

## Problem

Commander currently expects agent CLIs (claude, codex, gemini) to be installed globally in the user's PATH. For codex-acp specifically, this means users must separately install the binary before Commander can use ACP protocol with Codex. This creates friction and breaks the zero-install promise of a desktop app.

## Solution

Bundle the `codex-acp` binary from [zed-industries/codex-acp](https://github.com/zed-industries/codex-acp) as a Tauri v2 sidecar. The binary ships inside the Commander app bundle and is resolved at runtime next to the main executable.

## Key Design Decisions

- **Agent name mapping**: The agent is registered as `"codex"` in the UI and backend. When ACP transport is selected, Commander internally resolves `"codex"` to the `codex-acp` sidecar binary. This mapping is explicit in `cli_commands.rs` and `agent_status_service.rs`.
- **Resolution priority**: Bundled sidecar (next to main exe) is checked first, then PATH. This means the bundled version takes priority over a globally installed one.
- **Cross-compilation**: Not currently supported. The download script detects the host platform only. Cross-compilation would require passing the target triple as an argument.
- **Update strategy**: Version is pinned in the download script. Updates require a Commander rebuild and re-release. Users with a newer PATH-installed version should set transport to `cli-flags` to bypass the bundled sidecar.

## Architecture

### File Layout

```
src-tauri/
├── binaries/
│   ├── codex-acp-aarch64-apple-darwin      # macOS ARM
│   ├── codex-acp-x86_64-apple-darwin       # macOS Intel
│   ├── codex-acp-x86_64-pc-windows-msvc.exe  # Windows x64
│   ├── codex-acp-aarch64-pc-windows-msvc.exe  # Windows ARM
│   ├── codex-acp-x86_64-unknown-linux-gnu  # Linux x64
│   └── codex-acp-aarch64-unknown-linux-gnu # Linux ARM
├── tauri.conf.json   # externalBin config
├── capabilities/
│   └── default.json  # shell:allow-execute permission
└── scripts/
    └── download-codex-acp.sh  # Pre-build download script
```

Only the binary matching the build host's platform is downloaded. All platform entries are listed so Tauri's bundler knows which file to expect.

### Build-Time Flow

```
beforeBuildCommand
  ├── scripts/download-codex-acp.sh
  │     ├── Detect current target triple (host only)
  │     ├── Check if binary already cached → skip if so
  │     ├── Download from GitHub releases (v0.10.0)
  │     ├── Extract binary from tar.gz/zip
  │     ├── Validate extracted binary (file type check)
  │     └── Place in src-tauri/binaries/codex-acp-{triple}
  └── bun vite build (existing frontend build)
```

### Runtime Flow

```
User sends message to Codex agent (transport=acp)
  → execute_persistent_cli_command("codex", ...)
  → agent_settings.transport == "acp"
  → AcpExecutor created
  → resolve_agent_binary("codex" → "codex-acp")
      ├── 1. Check bundled sidecar (next to main exe) — priority
      ├── 2. Fallback: check PATH for "codex-acp"
      └── 3. Error with descriptive message if neither found
  → AcpExecutor spawns codex-acp binary
  → ndJSON stdin/stdout communication
```

## Changes Required

### 1. Download Script (`src-tauri/scripts/download-codex-acp.sh`)

Downloads the correct platform binary from GitHub releases. Validates the extracted binary.

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

# Skip if already downloaded
if [[ -f "$DEST" ]]; then
  echo "codex-acp already exists at ${DEST}, skipping download."
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

echo "codex-acp v${VERSION} installed to ${DEST}"
```

### 2. Tauri Configuration (`tauri.conf.json`)

Add `externalBin` to the bundle section:

```jsonc
// In "bundle":
"externalBin": ["binaries/codex-acp"]
```

Tauri automatically appends the target triple suffix and copies the matching binary into the app bundle.

### 3. Capabilities (`capabilities/default.json`)

Add shell execution permissions (currently missing — required for sidecar spawning):

```jsonc
// Add to existing "permissions" array:
"shell:allow-execute",
"shell:allow-spawn"
```

### 4. Sidecar Resolution (`src-tauri/src/services/sidecar.rs`)

New module to resolve bundled sidecar paths with descriptive error reporting:

```rust
use std::path::PathBuf;

/// Resolve the path to a bundled sidecar binary.
///
/// Resolution order:
/// 1. Next to main executable (bundled by Tauri)
/// 2. In the system PATH
///
/// Returns `Ok(path)` if found, `Err(message)` with diagnostic info if not.
pub fn resolve_sidecar(name: &str) -> Result<PathBuf, String> {
    // 1. Check next to main executable (bundled sidecar)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            let sidecar = exe_dir.join(name);
            if sidecar.exists() {
                return Ok(sidecar);
            }
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
```

Register in `src-tauri/src/services/mod.rs`:
```rust
pub mod sidecar;
```

### 5. Executor Integration (`src-tauri/src/commands/cli_commands.rs`)

Modify agent binary resolution to map `"codex"` → `"codex-acp"` when ACP transport is selected:

```rust
// Before creating the executor, resolve the binary path for ACP agents.
// The agent name "codex" maps to the "codex-acp" sidecar binary.
let resolved_agent = match agent_name.as_str() {
    "codex" if agent_settings.transport.as_deref() == Some("acp") => {
        match crate::services::sidecar::resolve_sidecar("codex-acp") {
            Ok(path) => path.to_string_lossy().to_string(),
            Err(_) => "codex-acp".to_string(), // fall through to spawn error
        }
    }
    _ => agent_name.clone(),
};
// Pass `resolved_agent` to the executor instead of `agent_name`
```

### 6. Agent Status Service (`src-tauri/src/services/agent_status_service.rs`)

Update codex availability check to also detect the bundled sidecar. This applies only to the `"codex"` agent:

```rust
// After the standard PATH check for each agent:
if !available && definition.id == "codex" {
    if crate::services::sidecar::resolve_sidecar("codex-acp").is_ok() {
        available = true;
        command_version = Some("codex-acp (bundled)".to_string());
    }
}
```

### 7. ACP Executor Binary Path

The `AcpExecutor` currently resolves the agent by name via `which::which(agent)`. Update it to accept a pre-resolved path. The caller (`cli_commands.rs`) passes the resolved binary path from step 5.

In `AcpExecutor::execute`, replace:
```rust
let agent_path = which::which(agent).map_err(|e| { ... })?;
```
with:
```rust
let agent_path = std::path::PathBuf::from(agent);
if !agent_path.exists() {
    return Err(CommanderError::command(
        agent, None,
        format!("agent binary not found at: {}", agent_path.display()),
    ));
}
```

### 8. Build Command Update (`tauri.conf.json`)

Run the download script as a separate step before the existing build commands. The `beforeDevCommand` starts the Vite dev server — the download must complete first but must not block the server:

```json
{
  "build": {
    "beforeBuildCommand": "bash src-tauri/scripts/download-codex-acp.sh && VITE_SKIP_TYPE_CHECK=1 bun vite build",
    "beforeDevCommand": "bash src-tauri/scripts/download-codex-acp.sh; bun run dev"
  }
}
```

Note: `beforeDevCommand` uses `;` (not `&&`) so that the dev server starts even if the download fails (e.g., offline development).

### 9. Gitignore

Add binaries directory to `.gitignore` (don't commit ~35MB binaries):

```
# Bundled sidecar binaries (downloaded at build time)
src-tauri/binaries/
```

## Testing

### Unit Tests

1. `test_resolve_sidecar_finds_bundled_binary` — create temp dir with sidecar, verify resolution
2. `test_resolve_sidecar_falls_back_to_path` — no bundled binary, verify PATH fallback
3. `test_resolve_sidecar_returns_error_when_missing` — neither bundled nor in PATH, verify error message

### Integration Tests

1. `test_codex_acp_executor_uses_sidecar_path` — verify AcpExecutor spawns the correct binary
2. `test_agent_status_shows_codex_available_via_sidecar` — status check finds bundled binary

### Manual Verification

1. Run download script: `bash src-tauri/scripts/download-codex-acp.sh`
2. Verify binary placed in `src-tauri/binaries/codex-acp-aarch64-apple-darwin`
3. Build the app: `bun tauri build`
4. Inspect bundle: `ls Commander.app/Contents/MacOS/codex-acp`
5. Launch app, verify codex shows "available" with "codex-acp (bundled)" version
6. Send a message to codex via ACP transport, verify streaming response

## Version Management

The codex-acp version is pinned in `download-codex-acp.sh` (`VERSION="0.10.0"`). To update:

1. Change `VERSION` in the script
2. Delete `src-tauri/binaries/` to force re-download
3. Run `bash src-tauri/scripts/download-codex-acp.sh` to fetch new version
4. Test with the new version
5. Commit the version bump

Security patches require a Commander release. Users who need a newer version immediately can install `codex-acp` globally and set the codex transport to `cli-flags` to bypass the bundled sidecar.

## Impact

- **App bundle size**: +~35MB (one platform binary, compressed)
- **Build time**: +5-10s first run (cached after)
- **No user-facing install step** for codex-acp
- **Backwards compatible**: PATH-installed codex-acp still works; bundled sidecar takes priority when ACP transport is selected

## Limitations

- Cross-compilation not supported (download script detects host platform only)
- No auto-update for bundled binary — requires Commander rebuild
- Only codex-acp is bundled; other agents (claude, gemini) remain PATH-dependent
