import { useCallback } from 'react'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { DISPLAY_TO_ID } from '@/components/chat/agents'
import type { ChatMessage } from '@/components/chat/types'

interface Params {
  resolveWorkingDir: () => Promise<string>
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setExecutingSessions: React.Dispatch<React.SetStateAction<Set<string>>>
  loadSessionStatus: () => void | Promise<void>
  invoke?: (cmd: string, args?: any) => Promise<any>
}

export function useChatExecution({ resolveWorkingDir, setMessages, setExecutingSessions, loadSessionStatus, invoke = tauriInvoke }: Params) {
  const execute = useCallback(
    async (agentDisplayNameOrId: string, message: string): Promise<string | null> => {
      const agentCommandMap = {
        claude: 'execute_claude_command',
        codex: 'execute_codex_command',
        gemini: 'execute_gemini_command',
        test: 'execute_test_command',
      } as const

      const assistantMessageId = `assistant-${Date.now()}`
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        agent: agentDisplayNameOrId,
        isStreaming: true,
      }

      setMessages((prev) => [...prev, assistantMessage])
      setExecutingSessions((prev) => {
        const s = new Set(prev)
        s.add(assistantMessageId)
        return s
      })

      try {
        const name = DISPLAY_TO_ID[agentDisplayNameOrId as keyof typeof DISPLAY_TO_ID] || agentDisplayNameOrId.toLowerCase()
        const commandFunction = (agentCommandMap as any)[name]
        if (!commandFunction) return assistantMessageId
        const workingDir = await resolveWorkingDir()
        await invoke(commandFunction, {
          sessionId: assistantMessageId,
          message,
          workingDir,
        })
        setTimeout(() => {
          try {
            loadSessionStatus()
          } catch {}
        }, 500)
        return assistantMessageId
      } catch (error) {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, content: `Error: ${error}`, isStreaming: false } : msg))
        )
        setExecutingSessions((prev) => {
          const s = new Set(prev)
          s.delete(assistantMessageId)
          return s
        })
        return null
      }
    },
    [resolveWorkingDir, setMessages, setExecutingSessions, loadSessionStatus, invoke]
  )

  return { execute }
}

