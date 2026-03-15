#[cfg(test)]
mod tests {
    use crate::services::session_manager::{SessionManager, ActiveSession, PermissionResponse};
    use std::time::Instant;

    #[test]
    fn new_session_manager_is_empty() {
        let manager = SessionManager::new();
        assert!(manager.get_agent_session_id("nonexistent").is_none());
    }

    #[test]
    fn insert_and_get_session() {
        let mut manager = SessionManager::new();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let (abort_tx, _abort_rx) = tokio::sync::oneshot::channel();

        manager.insert(ActiveSession {
            session_id: "s1".into(),
            agent: "autohand".into(),
            protocol: Some(crate::models::protocol::ProtocolMode::Acp),
            agent_session_id: None,
            permission_sender: tx,
            abort_sender: Some(abort_tx),
            started_at: Instant::now(),
        });

        assert!(manager.get("s1").is_some());
        assert_eq!(manager.get("s1").unwrap().agent, "autohand");
    }

    #[test]
    fn set_and_get_agent_session_id() {
        let mut manager = SessionManager::new();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let (abort_tx, _abort_rx) = tokio::sync::oneshot::channel();

        manager.insert(ActiveSession {
            session_id: "s1".into(),
            agent: "autohand".into(),
            protocol: None,
            agent_session_id: None,
            permission_sender: tx,
            abort_sender: Some(abort_tx),
            started_at: Instant::now(),
        });

        assert!(manager.get_agent_session_id("s1").is_none());
        manager.set_agent_session_id("s1", "agent-xyz".into());
        assert_eq!(manager.get_agent_session_id("s1"), Some("agent-xyz".into()));
    }

    #[test]
    fn close_session_removes_it() {
        let mut manager = SessionManager::new();
        let (tx, _rx) = tokio::sync::mpsc::unbounded_channel();
        let (abort_tx, _abort_rx) = tokio::sync::oneshot::channel();

        manager.insert(ActiveSession {
            session_id: "s1".into(),
            agent: "autohand".into(),
            protocol: None,
            agent_session_id: None,
            permission_sender: tx,
            abort_sender: Some(abort_tx),
            started_at: Instant::now(),
        });

        manager.close_session("s1");
        assert!(manager.get("s1").is_none());
    }

    #[test]
    fn send_permission_works() {
        let mut manager = SessionManager::new();
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        let (abort_tx, _abort_rx) = tokio::sync::oneshot::channel();

        manager.insert(ActiveSession {
            session_id: "s1".into(),
            agent: "autohand".into(),
            protocol: None,
            agent_session_id: None,
            permission_sender: tx,
            abort_sender: Some(abort_tx),
            started_at: Instant::now(),
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
