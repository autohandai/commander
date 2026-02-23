import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

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

interface UseAutohandSessionParams {
  onMessage?: (payload: AutohandMessagePayload) => void
  onToolEvent?: (payload: AutohandToolEventPayload) => void
  onPermissionRequest?: (payload: AutohandPermissionPayload) => void
  onHookEvent?: (payload: AutohandHookEventPayload) => void
  onStateChange?: (payload: AutohandStatePayload) => void
}

export function useAutohandSession({
  onMessage,
  onToolEvent,
  onPermissionRequest,
  onHookEvent,
  onStateChange,
}: UseAutohandSessionParams) {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const listenersRef = useRef<UnlistenFn[]>([])

  // Clean up listeners on unmount
  useEffect(() => {
    return () => {
      listenersRef.current.forEach((unlisten) => unlisten())
      listenersRef.current = []
    }
  }, [])

  const setupListeners = useCallback(async (sid: string) => {
    // Clean up existing listeners before setting up new ones
    listenersRef.current.forEach((unlisten) => unlisten())
    listenersRef.current = []

    const unlisteners: UnlistenFn[] = []

    if (onMessage) {
      unlisteners.push(
        await listen<AutohandMessagePayload>('autohand:message', (event) => {
          if (event.payload.session_id === sid) onMessage(event.payload)
        })
      )
    }

    if (onToolEvent) {
      unlisteners.push(
        await listen<AutohandToolEventPayload>('autohand:tool-event', (event) => {
          if (event.payload.session_id === sid) onToolEvent(event.payload)
        })
      )
    }

    if (onPermissionRequest) {
      unlisteners.push(
        await listen<AutohandPermissionPayload>('autohand:permission-request', (event) => {
          if (event.payload.session_id === sid) onPermissionRequest(event.payload)
        })
      )
    }

    if (onHookEvent) {
      unlisteners.push(
        await listen<AutohandHookEventPayload>('autohand:hook-event', (event) => {
          if (event.payload.session_id === sid) onHookEvent(event.payload)
        })
      )
    }

    if (onStateChange) {
      unlisteners.push(
        await listen<AutohandStatePayload>('autohand:state-change', (event) => {
          if (event.payload.session_id === sid) onStateChange(event.payload)
        })
      )
    }

    listenersRef.current = unlisteners
  }, [onMessage, onToolEvent, onPermissionRequest, onHookEvent, onStateChange])

  const cleanup = useCallback(() => {
    listenersRef.current.forEach((unlisten) => unlisten())
    listenersRef.current = []
  }, [])

  const sendPrompt = useCallback(
    async (message: string, workingDir: string, sid: string) => {
      setSessionId(sid)
      await setupListeners(sid)
      await invoke('execute_autohand_command', {
        sessionId: sid,
        message,
        workingDir,
      })
    },
    [setupListeners]
  )

  const respondPermission = useCallback(
    async (requestId: string, approved: boolean) => {
      if (!sessionId) return
      await invoke('respond_autohand_permission', {
        sessionId,
        requestId,
        approved,
      })
    },
    [sessionId]
  )

  const abort = useCallback(async () => {
    if (!sessionId) return
    await invoke('terminate_autohand_session', { sessionId })
    cleanup()
  }, [sessionId, cleanup])

  return {
    sessionId,
    sendPrompt,
    respondPermission,
    abort,
    cleanup,
  }
}
