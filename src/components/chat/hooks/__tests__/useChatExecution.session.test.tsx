import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatExecution } from '@/components/chat/hooks/useChatExecution'
import type { ChatMessage } from '@/components/chat/types'

function makeHarness() {
  const calls: any[] = []
  const invoke = vi.fn(async (cmd: string, args: any) => {
    calls.push({ cmd, args })
    return null
  })
  let messages: ChatMessage[] = []
  const setMessages = (updater: any) => {
    messages = typeof updater === 'function' ? updater(messages) : updater
  }
  let executing = new Set<string>()
  const setExecuting = (updater: any) => {
    executing = typeof updater === 'function' ? updater(executing) : updater
  }
  const resolveWorkingDir = vi.fn(async () => '/tmp/demo')
  const loadSessionStatus = vi.fn()

  return {
    calls,
    invoke,
    get messages() { return messages },
    get executing() { return executing },
    params: {
      resolveWorkingDir,
      setMessages: setMessages as any,
      setExecutingSessions: setExecuting as any,
      loadSessionStatus,
      invoke,
    },
  }
}

describe('useChatExecution — session continuity', () => {
  it('rekeyes assistant message when autohand invoke returns a different session_id (resume path)', async () => {
    const calls: any[] = []
    const OLD_SESSION_ID = 'ah-prev-session'
    const invoke = vi.fn(async (cmd: string, args: any) => {
      calls.push({ cmd, args })
      if (cmd === 'execute_autohand_command') return OLD_SESSION_ID
      return null
    })
    let messages: ChatMessage[] = []
    const setMessages = (updater: any) => {
      messages = typeof updater === 'function' ? updater(messages) : updater
    }
    let executing = new Set<string>()
    const setExecuting = (updater: any) => {
      executing = typeof updater === 'function' ? updater(executing) : updater
    }
    const { result } = renderHook(() =>
      useChatExecution({
        resolveWorkingDir: vi.fn(async () => '/tmp/demo'),
        setMessages: setMessages as any,
        setExecutingSessions: setExecuting as any,
        loadSessionStatus: vi.fn(),
        invoke,
      })
    )

    // New signature: (agent, message, modeValue, unsafeFull, turnId, conversationId, resumeSessionId)
    const returnedId = await act(() =>
      result.current.execute(
        'Autohand Code',
        'follow up',
        undefined,       // modeValue
        undefined,       // unsafeFull
        'turn-new',      // turnId (new)
        'conv-abc',
        OLD_SESSION_ID,  // resumeSessionId (old session)
      )
    )

    expect(returnedId).toBe(OLD_SESSION_ID)
    const msgByOldId = messages.find((m) => m.id === OLD_SESSION_ID)
    expect(msgByOldId).toBeTruthy()
    expect(msgByOldId?.conversationId).toBe('conv-abc')
    const orphan = messages.find((m) => m.id === 'turn-new')
    expect(orphan).toBeUndefined()
    expect(executing.has(OLD_SESSION_ID)).toBe(true)
    expect(executing.has('turn-new')).toBe(false)
  })

  it('uses turnId for stream routing and preserves conversationId', async () => {
    const h = makeHarness()
    const { result } = renderHook(() => useChatExecution(h.params))

    const returnedId = await act(() =>
      result.current.execute(
        'Claude Code CLI',
        'hello',
        undefined,    // modeValue
        undefined,    // unsafeFull
        'turn-1',     // turnId
        'conv-abc',   // conversationId
      )
    )

    expect(returnedId).toBe('turn-1')
    const assistant = h.messages.find((m) => m.id === 'turn-1')
    expect(assistant).toBeTruthy()
    expect(assistant?.conversationId).toBe('conv-abc')
  })

  it('passes resumeSessionId in baseArgs for claude agent', async () => {
    const h = makeHarness()
    const { result } = renderHook(() => useChatExecution(h.params))

    await act(() =>
      result.current.execute(
        'Claude Code CLI',
        'follow up',
        'acceptEdits',         // modeValue
        undefined,             // unsafeFull
        'turn-2',
        'conv-abc',
        'native-session-xyz',  // resumeSessionId
      )
    )

    expect(h.calls[0].cmd).toBe('execute_claude_command')
    expect(h.calls[0].args.resumeSessionId).toBe('native-session-xyz')
  })

  it('passes resumeSessionId in baseArgs for autohand agent', async () => {
    const h = makeHarness()
    const { result } = renderHook(() => useChatExecution(h.params))

    await act(() =>
      result.current.execute(
        'Autohand Code',
        'follow up',
        undefined,        // modeValue
        undefined,        // unsafeFull
        'turn-3',
        'conv-abc',
        'ah-session-prev',
      )
    )

    expect(h.calls[0].cmd).toBe('execute_autohand_command')
    expect(h.calls[0].args.resumeSessionId).toBe('ah-session-prev')
  })

  it('does NOT pass resumeSessionId for codex (no resume support)', async () => {
    const h = makeHarness()
    const { result } = renderHook(() => useChatExecution(h.params))

    await act(() =>
      result.current.execute(
        'Codex',
        'do stuff',
        undefined,     // modeValue
        undefined,     // unsafeFull
        'turn-4',
        'conv-abc',
        'some-session',
      )
    )

    expect(h.calls[0].cmd).toBe('execute_codex_command')
    expect(h.calls[0].args.resumeSessionId).toBeUndefined()
  })

  it('generates turnId when not provided (backwards compat)', async () => {
    const h = makeHarness()
    const { result } = renderHook(() => useChatExecution(h.params))

    const returnedId = await act(() =>
      result.current.execute('Codex', 'help')
    )

    expect(returnedId).toBeTruthy()
    expect(returnedId!.startsWith('turn-')).toBe(true)
  })
})
