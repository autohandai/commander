import { useEffect } from 'react'

export interface PersistableMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  agent: string
  conversationId?: string
  status?: 'thinking' | 'running' | 'completed' | 'failed'
  steps?: {
    id: string
    label: string
    detail?: string
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    startedAt?: number
    finishedAt?: number
  }[]
}

interface Params {
  projectPath?: string
  storageKey?: string | null
  messages: PersistableMessage[]
  onRestore: (restored: PersistableMessage[]) => void
  tauriInvoke?: (cmd: string, args?: any) => Promise<any>
  debounceMs?: number
}

export function useChatPersistence({
  projectPath,
  storageKey,
  messages,
  onRestore,
  tauriInvoke,
  debounceMs = 300,
}: Params) {
  // Load persisted messages for current project from sessionStorage
  useEffect(() => {
    if (!storageKey) return
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as { messages: PersistableMessage[] }
        if (Array.isArray(parsed.messages)) {
          onRestore(parsed.messages)
        }
      }
    } catch (e) {
      console.warn('Failed to load chat history:', e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  // Load chat from backend store when opening a project
  useEffect(() => {
    if (!projectPath || !tauriInvoke) return
    tauriInvoke('load_project_chat', { projectPath })
      .then((msgs: any) => {
        if (Array.isArray(msgs) && msgs.length > 0) {
          const restored = msgs.map((m: any, i: number) => ({
            id: `restored-${i}-${m.timestamp}`,
            content: String(m.content ?? ''),
            role: m.role === 'assistant' ? 'assistant' : 'user',
            timestamp: Number(m.timestamp ?? Date.now()),
            agent: String(m.agent ?? 'claude'),
            conversationId: typeof m.conversationId === 'string' ? m.conversationId : undefined,
            status: m.status,
            steps: Array.isArray(m.steps) ? m.steps : undefined,
          })) as PersistableMessage[]
          onRestore(restored)
        }
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath])

  // Persist messages whenever they change
  useEffect(() => {
    if (!storageKey) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ messages }))
    } catch (e) {
      console.warn('Failed to persist chat history:', e)
    }
    // Also persist to backend store (debounced and filtered)
    if (!projectPath || !tauriInvoke) return
    const timer = setTimeout(() => {
      const cleaned = messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        agent: m.agent,
        conversationId: m.conversationId,
        status: m.status,
        steps: m.steps,
      }))
      tauriInvoke('save_project_chat', { projectPath, messages: cleaned }).catch(() => {})
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [messages, storageKey, projectPath, tauriInvoke, debounceMs])
}
