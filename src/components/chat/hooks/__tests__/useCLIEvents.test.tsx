import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCLIEvents, StreamChunk } from '@/components/chat/hooks/useCLIEvents'

describe('useCLIEvents', () => {
  it('subscribes and forwards stream chunks', async () => {
    const handlers: Record<string, (e: any) => void> = {}
    const subscribe = vi.fn(async (event: string, cb: (e: any) => void) => {
      handlers[event] = cb
      return () => {}
    })
    const onStream = vi.fn()
    renderHook(() => useCLIEvents({ onStreamChunk: onStream, subscribe }))
    // simulate a stream payload
    const chunk: StreamChunk = { session_id: 's', content: 'hi', finished: false }
    handlers['cli-stream']?.({ payload: chunk })
    expect(onStream).toHaveBeenCalledWith(chunk)
  })
})
