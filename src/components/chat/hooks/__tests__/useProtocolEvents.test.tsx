import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useProtocolEvents } from '../useProtocolEvents'

// Mock tauri event listener
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((_event: string, handler: (event: any) => void) => {
    (globalThis as any).__protocolHandler = handler
    return Promise.resolve(() => {})
  }),
}))

describe('useProtocolEvents', () => {
  beforeEach(() => {
    delete (globalThis as any).__protocolHandler
  })

  it('calls onMessage callback for Message events', async () => {
    const onMessage = vi.fn()
    renderHook(() =>
      useProtocolEvents('session-1', {
        onMessage,
        onToolStart: vi.fn(),
        onToolUpdate: vi.fn(),
        onToolEnd: vi.fn(),
        onPermissionRequest: vi.fn(),
        onStateChange: vi.fn(),
        onError: vi.fn(),
        onSessionEvent: vi.fn(),
      })
    )

    await act(async () => {
      ;(globalThis as any).__protocolHandler?.({
        payload: {
          type: 'Message',
          data: { session_id: 'session-1', role: 'assistant', content: 'hello' },
        },
      })
    })

    expect(onMessage).toHaveBeenCalledWith({
      session_id: 'session-1',
      role: 'assistant',
      content: 'hello',
    })
  })

  it('filters events by session_id', async () => {
    const onMessage = vi.fn()
    renderHook(() =>
      useProtocolEvents('session-1', {
        onMessage,
        onToolStart: vi.fn(),
        onToolUpdate: vi.fn(),
        onToolEnd: vi.fn(),
        onPermissionRequest: vi.fn(),
        onStateChange: vi.fn(),
        onError: vi.fn(),
        onSessionEvent: vi.fn(),
      })
    )

    await act(async () => {
      ;(globalThis as any).__protocolHandler?.({
        payload: {
          type: 'Message',
          data: { session_id: 'other-session', role: 'assistant', content: 'nope' },
        },
      })
    })

    expect(onMessage).not.toHaveBeenCalled()
  })
})
