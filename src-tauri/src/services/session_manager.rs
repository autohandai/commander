use std::collections::HashMap;
use std::time::Instant;
use crate::models::protocol::ProtocolMode;

/// Permission response forwarded from frontend to executor task.
#[derive(Debug)]
pub struct PermissionResponse {
    pub request_id: String,
    pub approved: bool,
}

/// Metadata for an active agent session.
/// The executor itself is NOT stored here — it lives in the spawned tokio task.
/// Communication happens via channels.
pub struct ActiveSession {
    pub session_id: String,
    pub agent: String,
    pub protocol: Option<ProtocolMode>,
    pub agent_session_id: Option<String>,
    pub permission_sender: tokio::sync::mpsc::UnboundedSender<PermissionResponse>,
    pub abort_sender: Option<tokio::sync::oneshot::Sender<()>>,
    pub started_at: Instant,
}

pub struct SessionManager {
    sessions: HashMap<String, ActiveSession>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self { sessions: HashMap::new() }
    }

    pub fn insert(&mut self, session: ActiveSession) {
        self.sessions.insert(session.session_id.clone(), session);
    }

    pub fn get(&self, session_id: &str) -> Option<&ActiveSession> {
        self.sessions.get(session_id)
    }

    pub fn get_agent_session_id(&self, session_id: &str) -> Option<String> {
        self.sessions.get(session_id)
            .and_then(|s| s.agent_session_id.clone())
    }

    pub fn set_agent_session_id(&mut self, session_id: &str, agent_sid: String) {
        if let Some(session) = self.sessions.get_mut(session_id) {
            session.agent_session_id = Some(agent_sid);
        }
    }

    pub fn send_permission(&self, session_id: &str, request_id: String, approved: bool) -> Result<(), String> {
        if let Some(session) = self.sessions.get(session_id) {
            session.permission_sender.send(PermissionResponse { request_id, approved })
                .map_err(|_| format!("Session {} executor not running", session_id))
        } else {
            Err(format!("No active session: {session_id}"))
        }
    }

    pub fn remove(&mut self, session_id: &str) -> Option<ActiveSession> {
        self.sessions.remove(session_id)
    }

    pub fn close_session(&mut self, session_id: &str) {
        if let Some(mut session) = self.sessions.remove(session_id) {
            if let Some(sender) = session.abort_sender.take() {
                let _ = sender.send(());
            }
        }
    }

    pub fn close_all(&mut self) {
        let ids: Vec<String> = self.sessions.keys().cloned().collect();
        for id in ids {
            self.close_session(&id);
        }
    }
}
