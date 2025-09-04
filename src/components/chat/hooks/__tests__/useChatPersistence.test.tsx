import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatPersistence } from '@/components/chat/hooks/useChatPersistence'

describe('useChatPersistence', () => {
  it('debounces project save and restores from storage/invoke', async () => {
    vi.useFakeTimers()
    const tauriInvoke = vi.fn(async (cmd: string) => (cmd === 'load_project_chat' ? [] : null))
    const onRestore = vi.fn()

    // Seed sessionStorage
    sessionStorage.setItem('chat:/p', JSON.stringify({ messages: [{ role: 'user', content: 'hi', timestamp: 1, agent: 'claude' }] }))

    const { rerender } = renderHook((p: any) =>
      useChatPersistence({
        projectPath: '/p',
        storageKey: 'chat:/p',
        messages: p?.messages || [],
        onRestore,
        tauriInvoke,
        debounceMs: 10,
      })
    )

    // Triggers sessionStorage restore
    expect(onRestore).toHaveBeenCalled()

    // When messages change, schedules debounce save
    rerender({ messages: [{ role: 'user', content: 'new', timestamp: 2, agent: 'claude' }] })
    act(() => vi.advanceTimersByTime(15))
    expect(tauriInvoke).toHaveBeenCalledWith('save_project_chat', expect.any(Object))
    vi.useRealTimers()
  })
})
