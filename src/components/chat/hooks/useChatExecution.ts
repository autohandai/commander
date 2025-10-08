import { useCallback } from 'react'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { DISPLAY_TO_ID } from '@/components/chat/agents'
import type { ChatMessage } from '@/components/chat/types'
import { generateId } from '@/components/chat/utils/id'

interface Params {
  resolveWorkingDir: () => Promise<string>
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setExecutingSessions: React.Dispatch<React.SetStateAction<Set<string>>>
  loadSessionStatus: () => void | Promise<void>
  invoke?: (cmd: string, args?: any) => Promise<any>
  invoke?: (cmd: string, args?: any) => Promise<any>
}

export function useChatExecution({ resolveWorkingDir, setMessages, setExecutingSessions, loadSessionStatus, invoke = tauriInvoke }: Params) {
  const execute = useCallback(
    async (
      agentDisplayNameOrId: string,
      message: string,
      executionMode?: 'chat' | 'collab' | 'full',
      unsafeFull?: boolean,
      permissionMode?: 'plan' | 'acceptEdits' | 'ask',
      approvalMode?: 'default' | 'auto_edit' | 'yolo',
      conversationId?: string
    ): Promise<string | null> => {
      const agentCommandMap = {
        claude: 'execute_claude_command',
        codex: 'execute_codex_command',
        gemini: 'execute_gemini_command',
        ollama: 'execute_ollama_command',
        test: 'execute_test_command',
      } as const

      const sessionId = conversationId ?? generateId('conv')
      const messageId = sessionId
      const assistantMessage: ChatMessage = {
        id: messageId,
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        agent: agentDisplayNameOrId,
        isStreaming: true,
        conversationId: sessionId,
        status: 'thinking',
      }

      setMessages((prev) => [...prev, assistantMessage])
      setExecutingSessions((prev) => {
        const s = new Set(prev)
        s.add(sessionId)
        return s
      })

      try {
        const name = DISPLAY_TO_ID[agentDisplayNameOrId as keyof typeof DISPLAY_TO_ID] || agentDisplayNameOrId.toLowerCase()
        const commandFunction = (agentCommandMap as any)[name]
        if (!commandFunction) return sessionId
        const workingDir = await resolveWorkingDir()
        const baseArgs: any = { sessionId, message, workingDir }
        if (name === 'codex' && executionMode) {
          baseArgs.executionMode = executionMode
          if (unsafeFull) baseArgs.dangerousBypass = true
        }
        if (name === 'claude' && permissionMode) baseArgs.permissionMode = permissionMode
        if (name === 'gemini' && approvalMode) baseArgs.approvalMode = approvalMode
        await invoke(commandFunction, baseArgs)
        setTimeout(() => {
          try {
            loadSessionStatus()
          } catch {}
        }, 500)
        return sessionId
      } catch (error) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, content: `Error: ${error}`, isStreaming: false, status: 'failed' }
              : msg
          )
        )
        setExecutingSessions((prev) => {
          const s = new Set(prev)
          s.delete(sessionId)
          return s
        })
        return null
      }
    },
    [resolveWorkingDir, setMessages, setExecutingSessions, loadSessionStatus, invoke]
  )

  return { execute }
}
