use crate::models::auth::{AuthUser, StoredAuth};
use crate::services::auth_service;
use tempfile::TempDir;

#[test]
fn test_save_and_load_auth_token() {
    let temp = TempDir::new().unwrap();
    let sessions_dir = temp.path().join(".autohand").join("sessions");

    let stored = StoredAuth {
        token: "test-token-123".to_string(),
        user: AuthUser {
            id: "user-1".to_string(),
            email: "test@example.com".to_string(),
            name: "Test User".to_string(),
            avatar_url: Some("https://example.com/avatar.png".to_string()),
        },
        device_id: "commander-dev-1".to_string(),
        created_at: "2026-02-24T00:00:00Z".to_string(),
    };

    auth_service::save_auth_to_file(&sessions_dir, &stored).unwrap();
    let loaded = auth_service::load_auth_from_file(&sessions_dir).unwrap();

    assert!(loaded.is_some());
    let loaded = loaded.unwrap();
    assert_eq!(loaded.token, "test-token-123");
    assert_eq!(loaded.user.email, "test@example.com");
    assert_eq!(loaded.device_id, "commander-dev-1");
}

#[test]
fn test_load_returns_none_when_no_file() {
    let temp = TempDir::new().unwrap();
    let sessions_dir = temp.path().join(".autohand").join("sessions");

    let loaded = auth_service::load_auth_from_file(&sessions_dir).unwrap();
    assert!(loaded.is_none());
}

#[test]
fn test_clear_auth_file() {
    let temp = TempDir::new().unwrap();
    let sessions_dir = temp.path().join(".autohand").join("sessions");

    let stored = StoredAuth {
        token: "tok".to_string(),
        user: AuthUser {
            id: "1".to_string(),
            email: "a@b.com".to_string(),
            name: "A".to_string(),
            avatar_url: None,
        },
        device_id: "dev".to_string(),
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };

    auth_service::save_auth_to_file(&sessions_dir, &stored).unwrap();
    auth_service::clear_auth_file(&sessions_dir).unwrap();

    let loaded = auth_service::load_auth_from_file(&sessions_dir).unwrap();
    assert!(loaded.is_none());
}
