import { Loader2, Copy, Expand, Shrink } from 'lucide-react'
import { getAgentId } from '@/components/chat/agents'
import { PlanBreakdown } from '@/components/PlanBreakdown'
import { AgentResponse } from './AgentResponse'
import { CodexRenderer } from './codex/CodexRenderer'
import { useToast } from '@/components/ToastProvider'
import { getStepIconMeta } from '@/components/chat/utils/stepIcons'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

  const renderSteps = (message: ChatMessageLike) => {
    if (!message.steps || message.steps.length === 0) return null
    return (
      <Accordion type="multiple" className="w-full">
        {message.steps.map((step) => (
          <AccordionItem value={step.id} key={step.id}>
            <AccordionTrigger className="text-sm font-medium">
              <div className="flex items-center gap-2">
                {(() => {
                  const { icon: IconComp, className } = getStepIconMeta({ status: step.status, label: step.label })
                  return (
                    <span
                      className={cn(
                        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-background',
                        className
                      )}
                    >
                      <IconComp className="h-3 w-3" strokeWidth={2} />
                    </span>
                  )
                })()}
                <span>{step.label}</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-sm text-muted-foreground space-y-2">
              {step.detail && <p className="whitespace-pre-wrap">{step.detail}</p>}
              <div className="flex flex-wrap gap-3 text-[11px]">
                {step.startedAt && (
                  <span>
                    started {new Date(step.startedAt).toLocaleTimeString()}
                  </span>
                )}
                {step.finishedAt && (
                  <span>
                    finished {new Date(step.finishedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    )
  }

  return (
    <div className="space-y-4">
      {messages.map((message, index) => {
        const agentId = getAgentId(message.agent)
        const isAssistant = message.role === 'assistant'
        const long = isLongMessage(message.content)
        const expanded = expandedMessages.has(message.id)
        const compact = long && !expanded
        const timestamp = new Date(message.timestamp).toLocaleTimeString()
        const timelineAccent = isAssistant ? 'bg-primary' : 'bg-muted-foreground'
        const label =
          message.role === 'user'
            ? 'User'
            : agentId === 'claude'
              ? 'Claude'
              : agentId === 'codex'
                ? 'Codex'
                : agentId === 'gemini'
                  ? 'Gemini'
                  : message.agent || 'Assistant'

        return (
          <div key={message.id} className="flex gap-3" data-testid="chat-message">
            <div className="flex flex-col items-center pt-2">
              <span className={cn('h-2 w-2 rounded-full', timelineAccent)} />
              {index < messages.length - 1 && (
                <span className="flex-1 w-px bg-muted-foreground/30" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="rounded-md border border-border/60 bg-background px-4 py-3 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[11px] uppercase tracking-wide">
                      {label}
                    </Badge>
                    {message.status && (
                      <Badge variant="outline" className="capitalize text-[11px]">
                        {message.status.replace('_', ' ')}
                      </Badge>
                    )}
                    {message.isStreaming && (
                      <Loader2
                        data-testid="chat-message-loader"
                        className="h-4 w-4 animate-spin text-primary"
                      />
                    )}
                  </div>
                  <time dateTime={new Date(message.timestamp).toISOString()}>{timestamp}</time>
                </div>

                <div
                  className={cn(
                    'prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed',
                    compact && 'relative max-h-[220px] overflow-hidden'
                  )}
                  data-testid={compact ? 'message-compact' : undefined}
                >
                  {(() => {
                    const content = message.content || ''
                    if (!content && message.isStreaming) return 'Thinking…'
                    if (isAssistant && agentId === 'codex') {
                      return <CodexRenderer content={content} isStreaming={message.isStreaming} />
                    }
                    return <AgentResponse raw={content} isStreaming={message.isStreaming} />
                  })()}
                </div>

                {message.plan && (
                  <div className="rounded-md border border-dashed border-border/60 p-3">
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

                {renderSteps(message)}

                <div className="flex flex-wrap items-center gap-3 justify-between text-[11px] text-muted-foreground">
                  {message.conversationId && (
                    <span data-testid="conversation-id">
                      Conversation ID: {message.conversationId}
                    </span>
                  )}
                  <div className="flex items-center gap-1 ml-auto">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Copy"
                      onClick={() => copyValue(buildCopyPayload(message), 'Message copied')}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    {long && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title={expanded ? 'Compact message' : 'Expand message'}
                        onClick={() => onToggleExpand(message.id)}
                      >
                        {expanded ? <Shrink className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
