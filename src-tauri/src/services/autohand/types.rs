/// RPC method names matching autohand CLI (src/modes/rpc/types.ts).
/// All methods use the `autohand.` prefix.
pub mod rpc_methods {
    pub const PROMPT: &str = "autohand.prompt";
    pub const ABORT: &str = "autohand.abort";
    pub const RESET: &str = "autohand.reset";
    pub const PERMISSION_RESPONSE: &str = "autohand.permissionResponse";
    pub const SHUTDOWN: &str = "autohand.shutdown";
}

/// RPC notification names sent by the autohand CLI.
/// All notifications use the `autohand.` prefix with dot notation.
pub mod rpc_notifications {
    pub const AGENT_START: &str = "autohand.agentStart";
    pub const AGENT_END: &str = "autohand.agentEnd";
    pub const TURN_START: &str = "autohand.turnStart";
    pub const TURN_END: &str = "autohand.turnEnd";
    pub const MESSAGE_START: &str = "autohand.messageStart";
    pub const MESSAGE_UPDATE: &str = "autohand.messageUpdate";
    pub const MESSAGE_END: &str = "autohand.messageEnd";
    pub const TOOL_START: &str = "autohand.toolStart";
    pub const TOOL_UPDATE: &str = "autohand.toolUpdate";
    pub const TOOL_END: &str = "autohand.toolEnd";
    pub const PERMISSION_REQUEST: &str = "autohand.permissionRequest";
    pub const ERROR: &str = "autohand.error";
    pub const STATE_CHANGE: &str = "autohand.stateChange";
    pub const HOOK_PRE_TOOL: &str = "autohand.hook.preTool";
    pub const HOOK_POST_TOOL: &str = "autohand.hook.postTool";
    pub const HOOK_FILE_MODIFIED: &str = "autohand.hook.fileModified";
    pub const HOOK_PRE_PROMPT: &str = "autohand.hook.prePrompt";
    pub const HOOK_POST_RESPONSE: &str = "autohand.hook.postResponse";
}
