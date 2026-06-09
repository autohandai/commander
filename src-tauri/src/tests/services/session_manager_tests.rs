#[cfg(test)]
mod tests {
    use crate::services::session_manager::{SessionManager, ActiveSession, PermissionResponse};

    #[test]
    fn new_session_manager_is_empty() {
        let mut manager = SessionManager::new();
        assert!(manager.remove("nonexistent").is_none());
    }

    #[test]
    fn insert_and_get_session() {
        let mut manager = SessionManager::new();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let (abort_tx, _abort_rx) = tokio::sync::oneshot::channel();

        manager.insert(ActiveSession {
            session_id: "s1".into(),
            permission_sender: tx,
            abort_sender: Some(abort_tx),
        });

        let session = manager.remove("s1").expect("session should be inserted");
        assert!(session.abort_sender.is_some());
    }

    #[test]
    fn close_session_removes_it() {
        let mut manager = SessionManager::new();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let (abort_tx, _abort_rx) = tokio::sync::oneshot::channel();

        manager.insert(ActiveSession {
            session_id: "s1".into(),
            permission_sender: tx,
            abort_sender: Some(abort_tx),
        });

        manager.close_session("s1");
        assert!(manager.remove("s1").is_none());
    }

    #[test]
    fn send_permission_works() {
        let mut manager = SessionManager::new();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let (abort_tx, _abort_rx) = tokio::sync::oneshot::channel();

        manager.insert(ActiveSession {
            session_id: "s1".into(),
            permission_sender: tx,
            abort_sender: Some(abort_tx),
        });

        assert!(manager.send_permission("s1", "req-1".into(), true).is_ok());
        let resp = rx.try_recv().unwrap();
        assert_eq!(resp.request_id, "req-1");
        assert!(resp.approved);
    }

    #[test]
    fn send_permission_fails_for_unknown_session() {
        let manager = SessionManager::new();
        assert!(manager.send_permission("unknown", "req-1".into(), true).is_err());
    }
}
