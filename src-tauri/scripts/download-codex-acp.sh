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
