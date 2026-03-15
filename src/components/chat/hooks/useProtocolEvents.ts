import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'

export interface MessageData {
  session_id: string
  role: string
  content: string
}

export interface ToolStartData {
  session_id: string
  tool_id: string
  tool_name: string
  tool_kind: string
  args?: Record<string, unknown>
}

export interface ToolUpdateData {
  session_id: string
  tool_id: string
  tool_name: string
  output?: string
}

export interface ToolEndData {
  session_id: string
  tool_id: string
  tool_name: string
  output?: string
  success: boolean
  duration_ms?: number
}

export interface PermissionData {
  session_id: string
  request_id: string
  tool_name: string
  description: string
}

export interface StateData {
  session_id: string
  status: string
  context_percent?: number
}

export interface ErrorData {
  session_id: string
  message: string
}

export interface SessionData {
  session_id: string
  event: 'connected' | 'reconnected' | 'disconnected' | 'fallback_to_pty'
}

interface ProtocolEventPayload {
  type: string
  data: Record<string, unknown> & { session_id: string }
}

interface Callbacks {
  onMessage: (data: MessageData) => void
  onToolStart: (data: ToolStartData) => void
  onToolUpdate: (data: ToolUpdateData) => void
  onToolEnd: (data: ToolEndData) => void
  onPermissionRequest: (data: PermissionData) => void
  onStateChange: (data: StateData) => void
  onError: (data: ErrorData) => void
  onSessionEvent: (data: SessionData) => void
}

export function useProtocolEvents(sessionId: string, callbacks: Callbacks) {
  const cbRef = useRef(callbacks)
  cbRef.current = callbacks

  useEffect(() => {
    let unlisten: (() => void) | null = null

    listen<ProtocolEventPayload>('protocol-event', (event) => {
      const { type, data } = event.payload
      if (sessionId && data.session_id !== sessionId) return

      switch (type) {
        case 'Message':
          cbRef.current.onMessage(data as unknown as MessageData)
          break
        case 'ToolStart':
          cbRef.current.onToolStart(data as unknown as ToolStartData)
          break
        case 'ToolUpdate':
          cbRef.current.onToolUpdate(data as unknown as ToolUpdateData)
          break
        case 'ToolEnd':
          cbRef.current.onToolEnd(data as unknown as ToolEndData)
          break
        case 'PermissionRequest':
          cbRef.current.onPermissionRequest(data as unknown as PermissionData)
          break
        case 'StateChange':
          cbRef.current.onStateChange(data as unknown as StateData)
          break
        case 'Error':
          cbRef.current.onError(data as unknown as ErrorData)
          break
        case 'SessionEvent':
          cbRef.current.onSessionEvent(data as unknown as SessionData)
          break
      }
    }).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [sessionId])
}
