#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionMode {
    Chat,   // read-only, no writes
    Collab, // asks for approval
    Full,   // auto execute (low friction)
}

impl ExecutionMode {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "chat" => Some(Self::Chat),
            "collab" => Some(Self::Collab),
            "full" => Some(Self::Full),
            _ => None,
        }
    }
}

/// Compute additional CLI flags for the Codex CLI based on an execution mode.
/// When `unsafe_full` is true and `mode` is Full, we use the fully unsandboxed flag.
pub fn codex_flags_for_mode(mode: ExecutionMode, unsafe_full: bool) -> Vec<String> {
    match mode {
        ExecutionMode::Chat => vec!["--sandbox".into(), "read-only".into()],
        ExecutionMode::Collab => vec!["--sandbox".into(), "workspace-write".into()],
        ExecutionMode::Full => {
            if unsafe_full {
                vec!["--dangerously-bypass-approvals-and-sandbox".into()]
            } else {
                vec!["--full-auto".into()]
            }
        }
    }
}
