import { useEffect, useRef } from 'react'

type Unlisten = () => void
type SubscribeFn = <T>(event: string, cb: (e: { payload: T }) => void) => Promise<Unlisten>

export interface StreamChunk {
  session_id: string
  content: string
  finished: boolean
}

interface Params {
  onStreamChunk: (chunk: StreamChunk) => void
  onError?: (message: string) => void
  subscribe?: SubscribeFn
}

export function useCLIEvents({ onStreamChunk, onError, subscribe }: Params) {
  const onStreamRef = useRef(onStreamChunk)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onStreamRef.current = onStreamChunk
  }, [onStreamChunk])
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    let unlistenStream: Unlisten | null = null
    let unlistenError: Unlisten | null = null
    let cancelled = false

    ;(async () => {
      try {
        const sub: SubscribeFn =
          subscribe || (await import('@tauri-apps/api/event')).listen
        if (cancelled) return
        try {
          const ansiRE = /\u001b\[[0-9;]*m|\u001b\][^\u0007]*\u0007|\u001b\[[0-9;]*[A-Za-z]/g
          const stripAnsi = (s: string) => s.replace(ansiRE, '').replace(/\r+/g, '\n')
          unlistenStream = await sub<StreamChunk>('cli-stream', (event) => {
            const payload = event.payload
            // Keep Claude JSON stream intact; otherwise strip ANSI for readability
            const looksJson = payload.content.trim().startsWith('{') || payload.content.includes('"type"')
            const sanitized = looksJson ? payload.content : stripAnsi(payload.content)
            onStreamRef.current({ ...payload, content: sanitized })
          })
        } catch {}
        try {
          unlistenError = await sub<string>('cli-error', (event) => {
            onErrorRef.current?.(event.payload)
          })
        } catch {}
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
      try { unlistenStream?.() } catch {}
      try { unlistenError?.() } catch {}
    }
  }, [subscribe])
}
