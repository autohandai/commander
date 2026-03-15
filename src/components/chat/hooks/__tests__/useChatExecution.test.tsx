import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatExecution } from '@/components/chat/hooks/useChatExecution'
import type { ChatMessage } from '@/components/chat/types'

describe('useChatExecution', () => {
  it('maps display name to command and invokes with sessionId', async () => {
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

    const { result } = renderHook(() =>
      useChatExecution({ resolveWorkingDir, setMessages: setMessages as any, setExecutingSessions: setExecuting as any, loadSessionStatus, invoke })
    )

    // New signature: (agent, message, modeValue, unsafeFull, turnId, conversationId)
    const sessionId = await act(() => result.current.execute('Codex', 'help', undefined, undefined, 'turn-1', 'conversation-1'))
    expect(sessionId).toBe('turn-1')
    expect(calls[0].cmd).toBe('execute_codex_command')
    expect(calls[0].args.sessionId).toBe('turn-1')
    expect(calls[0].args.workingDir).toBe('/tmp/demo')
    // Assistant message added and marked streaming with conversation id preserved
    const assistant = messages.find((m) => m.id === 'turn-1')
    expect(assistant?.isStreaming).toBe(true)
    expect(assistant?.conversationId).toBe('conversation-1')
  })

  it('sets executionMode on baseArgs for codex via registry', async () => {
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
    const { result } = renderHook(() =>
      useChatExecution({ resolveWorkingDir: vi.fn(async () => '/tmp'), setMessages: setMessages as any, setExecutingSessions: setExecuting as any, loadSessionStatus: vi.fn(), invoke })
    )

    await act(() => result.current.execute('Codex', 'test', 'full', true, 'turn-1'))
    expect(calls[0].args.executionMode).toBe('full')
    expect(calls[0].args.dangerousBypass).toBe(true)
  })

  it('sets permissionMode on baseArgs for claude via registry', async () => {
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
    const { result } = renderHook(() =>
      useChatExecution({ resolveWorkingDir: vi.fn(async () => '/tmp'), setMessages: setMessages as any, setExecutingSessions: setExecuting as any, loadSessionStatus: vi.fn(), invoke })
    )

    await act(() => result.current.execute('Claude Code CLI', 'hello', 'plan', undefined, 'turn-1'))
    expect(calls[0].args.permissionMode).toBe('plan')
  })

  it('sets approvalMode on baseArgs for gemini via registry', async () => {
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
    const { result } = renderHook(() =>
      useChatExecution({ resolveWorkingDir: vi.fn(async () => '/tmp'), setMessages: setMessages as any, setExecutingSessions: setExecuting as any, loadSessionStatus: vi.fn(), invoke })
    )

    await act(() => result.current.execute('Gemini', 'do stuff', 'yolo', undefined, 'turn-1'))
    expect(calls[0].args.approvalMode).toBe('yolo')
  })

  it('sets permissionMode on baseArgs for autohand via registry', async () => {
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
    const { result } = renderHook(() =>
      useChatExecution({ resolveWorkingDir: vi.fn(async () => '/tmp'), setMessages: setMessages as any, setExecutingSessions: setExecuting as any, loadSessionStatus: vi.fn(), invoke })
    )

    await act(() => result.current.execute('Autohand Code', 'create file', 'unrestricted', undefined, 'turn-1'))
    expect(calls[0].args.permissionMode).toBe('unrestricted')
  })
})
