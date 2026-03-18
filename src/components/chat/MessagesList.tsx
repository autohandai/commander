import React from 'react'
import { Copy, Expand, Shrink } from 'lucide-react'
import { getAgentId } from '@/components/chat/agents'
import { PlanBreakdown } from '@/components/PlanBreakdown'
import { UnifiedContent } from './unified/UnifiedContent'
import { getNormalizer } from './unified/normalizers'
import { AgentAvatar, getAgentLabel } from './unified/AgentAvatar'
import {
  Message,
  MessageContent,
  MessageActions,
  MessageAction,
} from '@/components/ai-elements/message'
import { useToast } from '@/components/ToastProvider'
import { cn } from '@/lib/utils'

export interface ChatMessageLike {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: number
  agent: string
  isStreaming?: boolean
  plan?: {
    title: string
    description: string
    steps: any[]
    progress: number
    isGenerating?: boolean
  }
  conversationId?: string
  steps?: {
    id: string
    label: string
    detail?: string
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    startedAt?: number
    finishedAt?: number
  }[]
  status?: 'thinking' | 'running' | 'completed' | 'failed'
  toolEvents?: {
    tool_id: string
    tool_name: string
    phase: 'start' | 'update' | 'end'
    args?: Record<string, unknown>
    output?: string
    success?: boolean
    duration_ms?: number
  }[]
}

interface MessagesListProps {
  messages: ChatMessageLike[]
  expandedMessages: Set<string>
  onToggleExpand: (id: string) => void
  isLongMessage: (text: string | undefined) => boolean
  onExecutePlan?: () => void
  onExecuteStep?: (id: string) => void
}

const HEAVY_MESSAGE_CHAR_THRESHOLD = 4000
const HEAVY_MARKUP_TOKEN_THRESHOLD = 24

function buildCopyPayload(message: ChatMessageLike) {
  const parts: string[] = []
  if (message.conversationId) {
    parts.push(`Conversation ID: ${message.conversationId}`)
  }
  if (message.content) {
    parts.push(message.content)
  }
  return parts.join('\n\n').trim() || (message.conversationId ?? '')
}

function getMarkupTokenCount(content: string) {
  const htmlTokens = content.match(/<\/?[a-z][^>]*>/gi) ?? []
  const fenceTokens = content.match(/```/g) ?? []
  return htmlTokens.length + fenceTokens.length
}

function shouldDeferRichRendering(message: ChatMessageLike) {
  if (message.role !== 'assistant') return false
  if (message.isStreaming) return false
  if (message.plan) return false

  const content = message.content || ''
  if (content.length >= HEAVY_MESSAGE_CHAR_THRESHOLD) return true
  return getMarkupTokenCount(content) >= HEAVY_MARKUP_TOKEN_THRESHOLD
}

interface MessageRowProps {
  message: ChatMessageLike
  expanded: boolean
  long: boolean
  onToggleExpand: (id: string) => void
  onCopy: (text: string, successTitle: string) => Promise<void>
  onExecutePlan?: () => void
  onExecuteStep?: (id: string) => void
}

function MessageRowInner({
  message,
  expanded,
  long,
  onToggleExpand,
  onCopy,
  onExecutePlan,
  onExecuteStep,
}: MessageRowProps) {
  const shouldDefer = React.useMemo(() => shouldDeferRichRendering(message), [message])
  const [richContentReady, setRichContentReady] = React.useState(!shouldDefer)

  React.useEffect(() => {
    if (!shouldDefer) {
      setRichContentReady(true)
      return
    }

    setRichContentReady(false)

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let idleId: number | null = null
    const upgrade = () => {
      if (!cancelled) {
        setRichContentReady(true)
      }
    }

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(upgrade, { timeout: 120 })
    } else {
      timeoutId = setTimeout(upgrade, 60)
    }

    return () => {
      cancelled = true
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }
  }, [shouldDefer, message.id, message.content])

  const agentId = React.useMemo(() => getAgentId(message.agent), [message.agent])
  const isAssistant = message.role === 'assistant'
  const compact = long && !expanded
  const timestamp = React.useMemo(
    () =>
      new Date(message.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [message.timestamp]
  )
  const label = React.useMemo(
    () => (isAssistant ? getAgentLabel(agentId) : 'You'),
    [agentId, isAssistant]
  )
  const normalized = React.useMemo(() => {
    if (!isAssistant) return null
    try {
      return getNormalizer(agentId)(message.content || '', message)
    } catch (err) {
      console.error('Normalizer error for agent', agentId, err)
      // Fallback: render raw content as-is rather than crashing the message list
      return {
        reasoning: [],
        workingSteps: [],
        answer: message.content || '',
        meta: null,
        toolEvents: [],
        isStreaming: message.isStreaming ?? false,
      }
    }
  }, [agentId, isAssistant, message])

  if (!isAssistant) {
    return (
      <div data-testid="chat-message" className="flex justify-end">
        <Message from="user" className="max-w-[85%]">
          <MessageContent>
            <div className="whitespace-pre-wrap text-sm">
              {message.content || ''}
            </div>
          </MessageContent>
          <div className="flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
            <time dateTime={new Date(message.timestamp).toISOString()}>{timestamp}</time>
          </div>
        </Message>
      </div>
    )
  }

  const rawContent = message.content || ''
  // Treat whitespace-only content as empty so the fallback renders
  const content = rawContent.trim() ? rawContent : ''

  return (
    <div data-testid="chat-message" className="flex gap-3 items-start">
      <AgentAvatar agentId={agentId} size="md" className="mt-1 shrink-0" />

      <Message from="assistant" className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-foreground">{label}</span>
          <time
            className="text-[11px] text-muted-foreground"
            dateTime={new Date(message.timestamp).toISOString()}
          >
            {timestamp}
          </time>
          {message.isStreaming && (
            <span
              data-testid="chat-message-loader"
              className="h-2 w-2 rounded-full bg-primary animate-pulse"
            />
          )}
          {message.status && message.status !== 'completed' && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
              {message.status.replace('_', ' ')}
            </span>
          )}
        </div>

        <MessageContent>
          <div
            className={cn(
              'min-w-0',
              compact && 'relative max-h-[600px] overflow-hidden'
            )}
            data-testid={compact ? 'message-compact' : undefined}
          >
            {!content && (message.isStreaming || message.status === 'thinking' || message.status === 'running')
              ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    Thinking…
                  </div>
                )
              : !content && !message.isStreaming
                ? (
                    <div data-testid="empty-response-fallback" className="flex items-center gap-2 text-sm text-muted-foreground">
                      {message.status === 'failed'
                        ? 'Response failed — please try again.'
                        : 'No response received.'}
                    </div>
                  )
                : shouldDefer && !richContentReady
                  ? (
                      <div className="space-y-3" data-testid="message-rich-fallback">
                        <div className="max-h-[520px] overflow-hidden whitespace-pre-wrap break-words text-sm text-foreground">
                          {content}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>Formatting large response…</span>
                          <button
                            type="button"
                            className="font-medium text-foreground underline underline-offset-4"
                            onClick={() => setRichContentReady(true)}
                          >
                            Render formatted content
                          </button>
                        </div>
                      </div>
                    )
                  : normalized && <UnifiedContent content={normalized} />}
          </div>

          {compact && (
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
          )}

          {message.plan && (
            <div className="mt-3 rounded-lg border border-dashed border-border/60 p-3">
              <PlanBreakdown
                title={message.plan.title}
                description={message.plan.description}
                steps={message.plan.steps}
                progress={message.plan.progress}
                isGenerating={message.plan.isGenerating}
                onExecutePlan={onExecutePlan}
                onExecuteStep={onExecuteStep}
              />
            </div>
          )}
        </MessageContent>

        <div className="mt-1 flex items-center justify-between">
          <MessageActions className="opacity-0 transition-opacity group-hover:opacity-100">
            <MessageAction
              tooltip="Copy message"
              label="Copy"
              onClick={() => onCopy(buildCopyPayload(message), 'Message copied')}
            >
              <Copy className="size-3" />
            </MessageAction>
            {long && (
              <MessageAction
                tooltip={expanded ? 'Shrink' : 'Expand'}
                label={expanded ? 'Shrink' : 'Expand'}
                onClick={() => onToggleExpand(message.id)}
              >
                {expanded ? <Shrink className="size-3" /> : <Expand className="size-3" />}
              </MessageAction>
            )}
          </MessageActions>
          {message.conversationId && (
            <span
              data-testid="conversation-id"
              className="text-[10px] text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100"
            >
              Conversation ID: {message.conversationId}
            </span>
          )}
        </div>
      </Message>
    </div>
  )
}

const MessageRow = React.memo(
  MessageRowInner,
  (prev, next) =>
    prev.message === next.message &&
    prev.expanded === next.expanded &&
    prev.long === next.long &&
    prev.onToggleExpand === next.onToggleExpand &&
    prev.onCopy === next.onCopy &&
    prev.onExecutePlan === next.onExecutePlan &&
    prev.onExecuteStep === next.onExecuteStep
)

function MessagesListInner(props: MessagesListProps) {
  const {
    messages,
    expandedMessages,
    onToggleExpand,
    isLongMessage,
    onExecutePlan,
    onExecuteStep,
  } = props
  const { showSuccess, showError } = useToast()

  const copyValue = React.useCallback(async (text: string, successTitle: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      showSuccess(successTitle, 'Copied')
    } catch (e) {
      showError('Failed to copy message', 'Error')
    }
  }, [showError, showSuccess])

  return (
    <div className="space-y-6 px-1">
      {messages.map((message) => {
        const long = isLongMessage(message.content)
        const expanded = expandedMessages.has(message.id)
        return (
          <MessageRow
            key={message.id}
            message={message}
            expanded={expanded}
            long={long}
            onToggleExpand={onToggleExpand}
            onCopy={copyValue}
            onExecutePlan={onExecutePlan}
            onExecuteStep={onExecuteStep}
          />
        )
      })}
    </div>
  )
}

export const MessagesList = React.memo(MessagesListInner)
