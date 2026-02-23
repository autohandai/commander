/// RPC method names matching autohand CLI (src/modes/rpc/types.ts).
pub mod rpc_methods {
    pub const PROMPT: &str = "prompt";
    pub const ABORT: &str = "abort";
    pub const RESET: &str = "reset";
    pub const GET_STATE: &str = "getState";
    pub const GET_MESSAGES: &str = "getMessages";
    pub const PERMISSION_RESPONSE: &str = "permissionResponse";
    pub const GET_SKILLS_REGISTRY: &str = "getSkillsRegistry";
    pub const PLAN_MODE_SET: &str = "planModeSet";
    pub const YOLO_SET: &str = "yoloSet";
}

/// RPC notification names sent by the autohand CLI.
pub mod rpc_notifications {
    pub const AGENT_START: &str = "agent/start";
    pub const AGENT_END: &str = "agent/end";
    pub const TURN_START: &str = "agent/turnStart";
    pub const TURN_END: &str = "agent/turnEnd";
    pub const MESSAGE_UPDATE: &str = "agent/messageUpdate";
    pub const TOOL_START: &str = "agent/toolStart";
    pub const TOOL_UPDATE: &str = "agent/toolUpdate";
    pub const TOOL_END: &str = "agent/toolEnd";
    pub const PERMISSION_REQUEST: &str = "agent/permissionRequest";
    pub const HOOK_PRE_TOOL: &str = "agent/hookPreTool";
    pub const HOOK_POST_TOOL: &str = "agent/hookPostTool";
    pub const HOOK_FILE_MODIFIED: &str = "agent/hookFileModified";
    pub const HOOK_PRE_PROMPT: &str = "agent/hookPrePrompt";
    pub const HOOK_POST_RESPONSE: &str = "agent/hookPostResponse";
    pub const STATE_CHANGE: &str = "agent/stateChange";
}

/// JSON-RPC 2.0 standard error codes plus autohand-specific codes.
pub mod rpc_error_codes {
    pub const PARSE_ERROR: i32 = -32700;
    pub const INVALID_REQUEST: i32 = -32600;
    pub const METHOD_NOT_FOUND: i32 = -32601;
    pub const INVALID_PARAMS: i32 = -32602;
    pub const INTERNAL_ERROR: i32 = -32603;
    pub const PERMISSION_DENIED: i32 = -32001;
    pub const TIMEOUT: i32 = -32002;
    pub const AGENT_BUSY: i32 = -32003;
    pub const OPERATION_ABORTED: i32 = -32004;
}
