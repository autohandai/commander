import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useState } from 'react'
import { useChatPersistence } from '@/components/chat/hooks/useChatPersistence'

describe('useChatPersistence', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

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

    await act(async () => {
      await Promise.resolve()
    })
    // Triggers restore once candidates are evaluated.
    expect(onRestore).toHaveBeenCalled()

    // When messages change, schedules debounce save
    rerender({ messages: [{ role: 'user', content: 'new', timestamp: 2, agent: 'claude' }] })
    act(() => vi.advanceTimersByTime(15))
    const saveCalls = tauriInvoke.mock.calls.filter(([cmd]) => cmd === 'save_project_chat')
    expect(saveCalls.length).toBeGreaterThan(0)
    vi.useRealTimers()
  })

  it('does not overwrite session storage with empty messages before hydration', async () => {
    const existing = [{ role: 'user', content: 'keep me', timestamp: 1, agent: 'claude' }]
    sessionStorage.setItem('chat:/p', JSON.stringify({ messages: existing }))

    const tauriInvoke = vi.fn((cmd: string) => {
      if (cmd === 'load_project_chat') {
        return new Promise(() => {})
      }
      return Promise.resolve(null)
    })

    renderHook(() =>
      {
        const [messages, setMessages] = useState<any[]>([])
        useChatPersistence({
          projectPath: '/p',
          storageKey: 'chat:/p',
          messages,
          onRestore: setMessages,
          tauriInvoke,
          debounceMs: 10,
        })
        return messages
      }
    )

    await act(async () => {
      await Promise.resolve()
    })

    // Session data should be retained/restored, not replaced with an empty list.
    const persisted = JSON.parse(sessionStorage.getItem('chat:/p') || '{"messages":[]}')
    expect(Array.isArray(persisted.messages)).toBe(true)
    expect(persisted.messages.length).toBeGreaterThan(0)
    expect(persisted.messages[0].content).toBe('keep me')
  })

  it('does not call save_project_chat before backend hydration completes', async () => {
    vi.useFakeTimers()
    const tauriInvoke = vi.fn((cmd: string) => {
      if (cmd === 'load_project_chat') {
        return new Promise((resolve) => {
          setTimeout(() => resolve([{ role: 'user', content: 'restored', timestamp: 1, agent: 'claude' }]), 50)
        })
      }
      return Promise.resolve(null)
    })

    renderHook(() =>
      useChatPersistence({
        projectPath: '/p',
        storageKey: 'chat:/p',
        messages: [],
        onRestore: vi.fn(),
        tauriInvoke,
        debounceMs: 10,
      })
    )

    act(() => {
      vi.advanceTimersByTime(20)
    })

    const preHydrationSaves = tauriInvoke.mock.calls.filter(([cmd]) => cmd === 'save_project_chat')
    expect(preHydrationSaves).toHaveLength(0)

    await act(async () => {
      vi.advanceTimersByTime(60)
    })

    vi.useRealTimers()
  })

  it('prefers richer session restore when backend has less content', async () => {
    const onRestore = vi.fn()
    const tauriInvoke = vi.fn(async (cmd: string) => {
      if (cmd === 'load_project_chat') {
        return [{ role: 'assistant', content: 'backend', timestamp: 2, agent: 'codex' }]
      }
      return null
    })

    sessionStorage.setItem(
      'chat:/p',
      JSON.stringify({
        messages: [
          { role: 'user', content: 'session one', timestamp: 1, agent: 'claude' },
          { role: 'assistant', content: 'session two', timestamp: 2, agent: 'claude' },
        ],
      })
    )

    renderHook(() =>
      useChatPersistence({
        projectPath: '/p',
        storageKey: 'chat:/p',
        messages: [],
        onRestore,
        tauriInvoke,
      })
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(onRestore).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ content: 'session one', role: 'user' }),
      ])
    )
    // Backend is consulted, but richer session snapshot remains preferred.
    expect(tauriInvoke).toHaveBeenCalledWith('load_project_chat', { projectPath: '/p' })
  })

  it('falls back to backend restore when session messages are empty-only', async () => {
    const onRestore = vi.fn()
    const tauriInvoke = vi.fn(async (cmd: string) => {
      if (cmd === 'load_project_chat') {
        return [{ role: 'assistant', content: 'from-backend', timestamp: 2, agent: 'codex' }]
      }
      return null
    })

    sessionStorage.setItem(
      'chat:/p',
      JSON.stringify({
        messages: [
          { role: 'assistant', content: '', timestamp: 1, agent: 'claude' },
          { role: 'user', content: '   ', timestamp: 1, agent: 'claude' },
        ],
      })
    )

    renderHook(() =>
      useChatPersistence({
        projectPath: '/p',
        storageKey: 'chat:/p',
        messages: [],
        onRestore,
        tauriInvoke,
      })
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(tauriInvoke).toHaveBeenCalledWith('load_project_chat', { projectPath: '/p' })
    expect(onRestore).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ content: 'from-backend', role: 'assistant' }),
      ])
    )
  })

  it('restores backend when backend snapshot is richer than session snapshot', async () => {
    const onRestore = vi.fn()
    const tauriInvoke = vi.fn(async (cmd: string) => {
      if (cmd === 'load_project_chat') {
        return [
          { role: 'user', content: 'backend one', timestamp: 2, agent: 'codex' },
          { role: 'assistant', content: 'backend two', timestamp: 3, agent: 'codex' },
        ]
      }
      return null
    })

    sessionStorage.setItem(
      'chat:/p',
      JSON.stringify({
        messages: [{ role: 'assistant', content: '', timestamp: 1, agent: 'claude' }],
      })
    )

    renderHook(() =>
      useChatPersistence({
        projectPath: '/p',
        storageKey: 'chat:/p',
        messages: [],
        onRestore,
        tauriInvoke,
      })
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(onRestore).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ content: 'backend one', role: 'user' }),
        expect.objectContaining({ content: 'backend two', role: 'assistant' }),
      ])
    )
  })

  it('normalizes legacy content fields such as text when content is absent', async () => {
    const onRestore = vi.fn()
    const tauriInvoke = vi.fn(async () => null)

    sessionStorage.setItem(
      'chat:/p',
      JSON.stringify({
        messages: [{ role: 'assistant', text: 'legacy text field', timestamp: 1, agent: 'claude' }],
      })
    )

    renderHook(() =>
      useChatPersistence({
        projectPath: '/p',
        storageKey: 'chat:/p',
        messages: [],
        onRestore,
        tauriInvoke,
      })
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(onRestore).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ content: 'legacy text field', role: 'assistant' }),
      ])
    )
  })

  it('clears stale messages when switching storage key/project', async () => {
    const onRestore = vi.fn()
    const tauriInvoke = vi.fn(async () => [])

    const { rerender } = renderHook((props: { projectPath: string; storageKey: string }) =>
      useChatPersistence({
        projectPath: props.projectPath,
        storageKey: props.storageKey,
        messages: [],
        onRestore,
        tauriInvoke,
      })
    , { initialProps: { projectPath: '/p1', storageKey: 'chat:/p1' } })

    await act(async () => {
      await Promise.resolve()
    })

    rerender({ projectPath: '/p2', storageKey: 'chat:/p2' })

    await act(async () => {
      await Promise.resolve()
    })

    // Clear should occur when switching context.
    const clearCalls = onRestore.mock.calls.filter(([arg]) => Array.isArray(arg) && arg.length === 0)
    expect(clearCalls.length).toBeGreaterThanOrEqual(1)
  })
})
