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
        if sidecar.is_file() {
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
