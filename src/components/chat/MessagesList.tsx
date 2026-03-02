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

export function MessagesList(props: MessagesListProps) {
  const {
    messages,
    expandedMessages,
    onToggleExpand,
    isLongMessage,
    onExecutePlan,
    onExecuteStep,
  } = props
  const { showSuccess, showError } = useToast()

  const copyValue = async (text: string, successTitle: string) => {
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
  }

  const buildCopyPayload = (message: ChatMessageLike) => {
    const parts: string[] = []
    if (message.conversationId) {
      parts.push(`Conversation ID: ${message.conversationId}`)
    }
    if (message.content) {
      parts.push(message.content)
    }
    return parts.join('\n\n').trim() || (message.conversationId ?? '')
  }

  return (
    <div className="space-y-6 px-1">
      {messages.map((message) => {
        const agentId = getAgentId(message.agent)
        const isAssistant = message.role === 'assistant'
        const long = isLongMessage(message.content)
        const expanded = expandedMessages.has(message.id)
        const compact = long && !expanded
        const timestamp = new Date(message.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
        const label = isAssistant ? getAgentLabel(agentId) : 'You'

        if (!isAssistant) {
          return (
            <div key={message.id} data-testid="chat-message" className="flex justify-end">
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

        const content = message.content || ''
        const normalizer = getNormalizer(agentId)
        const normalized = normalizer(content, message)

        return (
          <div key={message.id} data-testid="chat-message" className="flex gap-3 items-start">
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
                  {!content && message.isStreaming
                    ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                          Thinking…
                        </div>
                      )
                    : <UnifiedContent content={normalized} />}
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
                    onClick={() => copyValue(buildCopyPayload(message), 'Message copied')}
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
      })}
    </div>
  )
}
