#[cfg(test)]
mod tests {
    use tempfile::TempDir;

    use crate::services::sidecar::resolve_sidecar;

    #[test]
    fn test_resolve_sidecar_finds_binary_in_given_dir() {
        let tmp = TempDir::new().unwrap();
        let binary = tmp.path().join("codex-acp");
        std::fs::write(&binary, b"#!/bin/sh\ntrue").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();
        }

        let result = resolve_sidecar("codex-acp", Some(tmp.path()));
        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(result.unwrap(), binary);
    }

    #[test]
    fn test_resolve_sidecar_falls_back_to_path() {
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
