export interface AutohandMessagePayload {
  session_id: string
  content: string
  finished: boolean
}

export interface ToolEvent {
  tool_id: string
  tool_name: string
  phase: 'start' | 'update' | 'end'
  args?: Record<string, unknown>
  output?: string
  success?: boolean
  duration_ms?: number
}

export interface AutohandToolEventPayload {
  session_id: string
  event: ToolEvent
}

export interface PermissionRequest {
  request_id: string
  tool_name: string
  description: string
  file_path?: string
  is_destructive: boolean
}

export interface AutohandPermissionPayload {
  session_id: string
  request: PermissionRequest
}

export interface AutohandHookEventPayload {
  session_id: string
  hook_id: string
  event: string
  output?: string
  success: boolean
}

export interface AutohandStatePayload {
  session_id: string
  state: {
    status: 'idle' | 'processing' | 'waitingpermission'
    session_id?: string
    model?: string
    context_percent: number
    message_count: number
  }
}
