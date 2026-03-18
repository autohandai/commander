import { useEffect, useRef, useState } from 'react'

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

const STATUS_VALUES = new Set(['thinking', 'running', 'completed', 'failed'] as const)
const STEP_STATUS_VALUES = new Set(['pending', 'in_progress', 'completed', 'failed'] as const)

function normalizeMessage(raw: any, index: number, source: 'session' | 'backend'): PersistableMessage {
  const timestamp = Number(raw?.timestamp)
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now()
  const role = raw?.role === 'assistant' ? 'assistant' : 'user'
  const agent = typeof raw?.agent === 'string' && raw.agent.length > 0 ? raw.agent : 'claude'
  const id =
    typeof raw?.id === 'string' && raw.id.length > 0
      ? raw.id
      : `restored-${source}-${index}-${safeTimestamp}`

  const statusCandidate = raw?.status
  // Clamp in-flight statuses ('thinking', 'running') to 'completed' on restore.
  // Once the app restarts, the corresponding streams are gone and those messages
  // will never transition on their own — leaving them permanently stuck if we
  // preserve the transient status.
  const rawStatus =
    typeof statusCandidate === 'string' && STATUS_VALUES.has(statusCandidate as any)
      ? (statusCandidate as PersistableMessage['status'])
      : undefined
  const status: PersistableMessage['status'] =
    rawStatus === 'thinking' || rawStatus === 'running' ? 'completed' : rawStatus

  const steps = Array.isArray(raw?.steps)
    ? raw.steps
        .map((step: any, stepIndex: number) => {
          const stepStatusCandidate = step?.status
          const stepStatus =
            typeof stepStatusCandidate === 'string' && STEP_STATUS_VALUES.has(stepStatusCandidate as any)
              ? (stepStatusCandidate as NonNullable<PersistableMessage['steps']>[number]['status'])
              : 'pending'
          return {
            id:
              typeof step?.id === 'string' && step.id.length > 0
                ? step.id
                : `${id}-step-${stepIndex}`,
            label:
              typeof step?.label === 'string' && step.label.length > 0
                ? step.label
                : `Step ${stepIndex + 1}`,
            detail: typeof step?.detail === 'string' ? step.detail : undefined,
            status: stepStatus,
            startedAt: Number.isFinite(Number(step?.startedAt)) ? Number(step.startedAt) : undefined,
            finishedAt: Number.isFinite(Number(step?.finishedAt)) ? Number(step.finishedAt) : undefined,
          }
        })
        .filter(Boolean)
    : undefined

  const contentValue =
    raw?.content ??
    raw?.text ??
    raw?.message ??
    raw?.output ??
    raw?.result ??
    ''

  return {
    id,
    content: typeof contentValue === 'string' ? contentValue : String(contentValue ?? ''),
    role,
    timestamp: safeTimestamp,
    agent,
    conversationId:
      typeof raw?.conversationId === 'string'
        ? raw.conversationId
        : typeof raw?.conversation_id === 'string'
          ? raw.conversation_id
          : undefined,
    status,
    steps,
  }
}

type RestoreStats = {
  meaningfulCount: number
  contentChars: number
  latestTimestamp: number
}

function scoreMessages(messages: PersistableMessage[]): RestoreStats {
  return messages.reduce<RestoreStats>(
    (acc, message) => {
      const text = message.content.trim()
      const hasSteps = Array.isArray(message.steps) && message.steps.length > 0
      const meaningful = text.length > 0 || hasSteps
      return {
        meaningfulCount: acc.meaningfulCount + (meaningful ? 1 : 0),
        contentChars: acc.contentChars + text.length,
        latestTimestamp: Math.max(acc.latestTimestamp, Number(message.timestamp) || 0),
      }
    },
    { meaningfulCount: 0, contentChars: 0, latestTimestamp: 0 }
  )
}

function pickPreferredRestore(
  sessionMessages: PersistableMessage[] | null,
  backendMessages: PersistableMessage[] | null
): PersistableMessage[] | null {
  if (!sessionMessages?.length && !backendMessages?.length) return null
  if (!sessionMessages?.length) return backendMessages
  if (!backendMessages?.length) return sessionMessages

  const sessionScore = scoreMessages(sessionMessages)
  const backendScore = scoreMessages(backendMessages)

  if (backendScore.meaningfulCount !== sessionScore.meaningfulCount) {
    return backendScore.meaningfulCount > sessionScore.meaningfulCount
      ? backendMessages
      : sessionMessages
  }

  if (backendScore.contentChars !== sessionScore.contentChars) {
    return backendScore.contentChars > sessionScore.contentChars
      ? backendMessages
      : sessionMessages
  }

  if (backendScore.latestTimestamp > sessionScore.latestTimestamp) {
    return backendMessages
  }

  return sessionMessages
}

export function useChatPersistence({
  projectPath,
  storageKey,
  messages,
  onRestore,
  tauriInvoke,
  debounceMs = 300,
}: Params) {
  const [isHydrated, setIsHydrated] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const onRestoreRef = useRef(onRestore)
  const tauriInvokeRef = useRef(tauriInvoke)
  const messagesRef = useRef(messages)
  const isHydratingRef = useRef(false)
  const previousContextKeyRef = useRef<string | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    onRestoreRef.current = onRestore
  }, [onRestore])

  useEffect(() => {
    tauriInvokeRef.current = tauriInvoke
  }, [tauriInvoke])

  const signatureFor = (list: PersistableMessage[]): string =>
    list
      .map((message, index) => {
        const idPart = message.id ?? `${message.role}:${message.timestamp}:${index}`
        return `${idPart}:${message.status ?? ''}:${message.content.length}`
      })
      .join('|')

  // Restore persisted messages before enabling writes.
  useEffect(() => {
    let cancelled = false
    const contextKey = `${projectPath ?? ''}::${storageKey ?? ''}`
    const isFirstHydration = previousContextKeyRef.current === null
    const didSwitchContext =
      previousContextKeyRef.current !== null && previousContextKeyRef.current !== contextKey
    previousContextKeyRef.current = contextKey

    isHydratingRef.current = true

    // SWR: only blank the UI on first mount, not on branch/context switches.
    // On context switch, keep isHydrated true so messages remain visible (stale-while-revalidate).
    if (didSwitchContext) {
      setIsTransitioning(true)
    } else if (isFirstHydration) {
      setIsHydrated(false)
    }

    const restore = async () => {
      const initialSignature = signatureFor(messagesRef.current)
      let sessionMessages: PersistableMessage[] | null = null
      let backendMessages: PersistableMessage[] | null = null

      if (storageKey) {
        try {
          const raw = sessionStorage.getItem(storageKey)
          if (raw) {
            const parsed = JSON.parse(raw) as { messages: PersistableMessage[] }
            if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
              const restored = parsed.messages.map((message, index) =>
                normalizeMessage(message, index, 'session')
              )
              sessionMessages = restored
            }
          }
        } catch (e) {
          console.warn('Failed to load chat history from session storage:', e)
        }
      }

      const invokeFn = tauriInvokeRef.current
      if (projectPath && invokeFn) {
        try {
          const msgs = await invokeFn('load_project_chat', { projectPath })
          if (!cancelled && Array.isArray(msgs) && msgs.length > 0) {
            const restored = msgs.map((message: any, index: number) =>
              normalizeMessage(message, index, 'backend')
            )
            backendMessages = restored
          }
        } catch {
          // Intentionally ignore backend restoration failures.
        }
      }

      if (!cancelled) {
        const currentSignature = signatureFor(messagesRef.current)
        const messagesChangedDuringHydration =
          currentSignature !== initialSignature && messagesRef.current.length > 0

        const preferred = pickPreferredRestore(sessionMessages, backendMessages)

        if (messagesChangedDuringHydration && preferred && preferred.length > 0) {
          // User sent messages while hydration was in flight.
          // Merge restored history with the new messages instead of discarding history.
          const currentMessages = messagesRef.current
          const existingIds = new Set(currentMessages.map((m) => m.id))
          const restoredOnly = preferred.filter((m) => !existingIds.has(m.id))
          if (restoredOnly.length > 0) {
            onRestoreRef.current([...restoredOnly, ...currentMessages])
          }
          isHydratingRef.current = false
          setIsHydrated(true)
          setIsTransitioning(false)
          return
        }

        if (preferred && preferred.length > 0) {
          onRestoreRef.current(preferred)
        } else if (didSwitchContext) {
          // If switching projects and no candidate exists, clear stale messages once.
          onRestoreRef.current([])
        }
        isHydratingRef.current = false
        setIsHydrated(true)
        setIsTransitioning(false)
      }
    }

    void restore()
    return () => {
      cancelled = true
      isHydratingRef.current = false
    }
  }, [storageKey, projectPath])

  // Persist messages whenever they change
  useEffect(() => {
    if (isHydratingRef.current) return
    if (!isHydrated) return
    if (!storageKey) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ messages }))
    } catch (e) {
      console.warn('Failed to persist chat history:', e)
    }
    // Also persist to backend store (debounced and filtered)
    const invokeFn = tauriInvokeRef.current
    if (!projectPath || !invokeFn) return
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
      invokeFn('save_project_chat', { projectPath, messages: cleaned }).catch(() => {})
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [messages, storageKey, projectPath, debounceMs, isHydrated])

  return { isHydrated, isTransitioning }
}
