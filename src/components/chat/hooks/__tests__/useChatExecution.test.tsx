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

    const sessionId = await act(() => result.current.execute('Codex', 'help', undefined, undefined, undefined, undefined, 'conversation-1'))
    expect(sessionId).toBeTruthy()
    expect(calls[0].cmd).toBe('execute_codex_command')
    expect(calls[0].args.sessionId).toBe(sessionId)
    expect(calls[0].args.workingDir).toBe('/tmp/demo')
    // Assistant message added and marked streaming with conversation id preserved
    const assistant = messages.find((m) => m.id === sessionId)
    expect(assistant?.isStreaming).toBe(true)
    expect(assistant?.conversationId).toBe('conversation-1')
  })
})
