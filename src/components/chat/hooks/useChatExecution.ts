import { useCallback } from 'react'
import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { DISPLAY_TO_ID, AGENT_EXECUTION_MODES } from '@/components/chat/agents'
import type { ChatMessage } from '@/components/chat/types'
import { generateId } from '@/components/chat/utils/id'

interface Params {
  resolveWorkingDir: () => Promise<string>
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  setExecutingSessions: React.Dispatch<React.SetStateAction<Set<string>>>
  loadSessionStatus: () => void | Promise<unknown>
  invoke?: (cmd: string, args?: any) => Promise<any>
}

// Agents that support session resume
const RESUMABLE_AGENTS = new Set(['claude', 'autohand'])

export function useChatExecution({ resolveWorkingDir, setMessages, setExecutingSessions, loadSessionStatus, invoke = tauriInvoke }: Params) {
  const execute = useCallback(
    async (
      agentDisplayNameOrId: string,
      message: string,
      modeValue?: string,
      unsafeFull?: boolean,
      turnId?: string,
      conversationId?: string,
      resumeSessionId?: string,
    ): Promise<string | null> => {
      const agentCommandMap = {
        autohand: 'execute_autohand_command',
        claude: 'execute_claude_command',
        codex: 'execute_codex_command',
        gemini: 'execute_gemini_command',
        ollama: 'execute_ollama_command',
        test: 'execute_test_command',
      } as const

      const sessionId = turnId ?? generateId('turn')
      const messageId = sessionId
      const assistantMessage: ChatMessage = {
        id: messageId,
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        agent: agentDisplayNameOrId,
        isStreaming: true,
        conversationId: conversationId ?? sessionId,
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

        // Use the registry to set the correct backend param key
        const modeConfig = AGENT_EXECUTION_MODES[name]
        if (modeConfig && modeValue && modeConfig.backendParamName) {
          baseArgs[modeConfig.backendParamName] = modeValue
        }
        // Codex-specific dangerous bypass toggle
        if (name === 'codex' && unsafeFull) {
          baseArgs.dangerousBypass = true
        }

        // Pass resumeSessionId only for agents that support it
        if (resumeSessionId && RESUMABLE_AGENTS.has(name)) {
          baseArgs.resumeSessionId = resumeSessionId
        }
        const invokeResult = await invoke(commandFunction, baseArgs)

        // For agents that return the actual session id used for event routing
        // (e.g. autohand resumes an existing session under its original id),
        // the returned value may differ from the planned sessionId.  When that
        // happens, rekey the assistant message and the executing-sessions set so
        // that incoming stream chunks (tagged with the returned id) are matched.
        const effectiveSessionId =
          typeof invokeResult === 'string' && invokeResult.length > 0 && invokeResult !== sessionId
            ? invokeResult
            : sessionId

        if (effectiveSessionId !== sessionId) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === sessionId ? { ...msg, id: effectiveSessionId } : msg
            )
          )
          setExecutingSessions((prev) => {
            const s = new Set(prev)
            s.delete(sessionId)
            s.add(effectiveSessionId)
            return s
          })
        }

        setTimeout(() => {
          try {
            loadSessionStatus()
          } catch {}
        }, 500)
        return effectiveSessionId
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
