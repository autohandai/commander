import { User, Bot, Loader2, Copy, Expand, Shrink } from 'lucide-react'
import { getAgentId } from '@/components/chat/agents'
import { PlanBreakdown } from '@/components/PlanBreakdown'
import { AgentResponse } from './AgentResponse'
import { CodexRenderer } from './codex/CodexRenderer'
import { useToast } from '@/components/ToastProvider'

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
}

interface MessagesListProps {
  messages: ChatMessageLike[]
  expandedMessages: Set<string>
  onToggleExpand: (id: string) => void
  isLongMessage: (text: string | undefined) => boolean
  truncateMessage: (text: string, limit?: number) => string
  getAgentModel: (agentName: string) => string | null
  onExecutePlan?: () => void
  onExecuteStep?: (id: string) => void
}

export function MessagesList(props: MessagesListProps) {
  const {
    messages,
    expandedMessages,
    onToggleExpand,
    isLongMessage,
    getAgentModel,
    onExecutePlan,
    onExecuteStep,
  } = props
  const { showSuccess, showError } = useToast()

  const copyMessage = async (text: string) => {
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
      showSuccess('Message copied to clipboard', 'Copied')
    } catch (e) {
      showError('Failed to copy message', 'Error')
    }
  }

  return (
    <>
      {messages.map((message) => {
        const agentId = getAgentId(message.agent)
        const isCodex = agentId === 'codex'
        const isAssistant = message.role === 'assistant'

        // Codex messages don't have box styling
        const showBox = !isCodex || message.role === 'user'

        return (
        <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={showBox ? `max-w-[80%] rounded-lg p-3 ${
            message.role === 'user'
              ? 'bg-primary text-primary-foreground ml-12'
              : 'bg-muted mr-12'
          }` : 'max-w-[80%] mr-12'}>
            <div className="flex items-center gap-2 mb-1 text-xs opacity-70">
              {message.role === 'user' ? (
                <User className="h-3 w-3" />
              ) : (
                <Bot className="h-3 w-3" />
              )}
              {message.role === 'user' ? (
                <span>You</span>
              ) : (
                (() => {
                  const id = getAgentId(message.agent)
                  const label = id === 'claude' ? 'Claude'
                    : id === 'codex' ? 'Codex'
                    : id === 'gemini' ? 'Gemini'
                    : id === 'test' ? 'Test'
                    : (message.agent || 'Agent')
                  const colorClass = id === 'claude'
                    ? 'text-orange-500'
                    : (id === 'gemini'
                      ? 'text-purple-500'
                      : (id === 'codex' || id === 'openai')
                        ? 'text-blue-500'
                        : '')
                  return <span className={colorClass}>{label}</span>
                })()
              )}
              {/* No model in header; footer contains model info */}
              <span>•</span>
              <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
              {message.isStreaming && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
            </div>
            {(() => {
              const content = message.content || ''
              const long = isLongMessage(content)
              const expanded = expandedMessages.has(message.id)
              const compact = long && !expanded
              const containerClass = `whitespace-pre-wrap text-sm ${compact ? 'max-h-[200px] overflow-hidden' : ''}`

              return (
                <div className={containerClass} data-testid={compact ? 'message-compact' : undefined}>
                  {(() => {
                    if (!content && message.isStreaming) return 'Thinking...'
                    if (message.role === 'assistant' && isCodex) {
                      return <CodexRenderer content={content} />
                    }
                    return <AgentResponse raw={content} />
                  })()}
                </div>
              )
            })()}
            {/* Controls: copy and compact/expand */}
            {(() => {
              const content = message.content || ''
              const long = isLongMessage(content)
              const expanded = expandedMessages.has(message.id)
              return (
                <div className="mt-1 flex items-center justify-end gap-1 opacity-70">
                  <button
                    title="Copy message"
                    className="p-1 rounded hover:bg-muted/60"
                    onClick={() => copyMessage(content)}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  {long && (
                    <button
                      title={expanded ? 'Compact message' : 'Expand message'}
                      className="p-1 rounded hover:bg-muted/60"
                      onClick={() => onToggleExpand(message.id)}
                    >
                      {expanded ? <Shrink className="h-3 w-3" /> : <Expand className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              )
            })()}
            {message.plan && (
              <div className="mt-3">
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
          </div>
        </div>
        )
      })}
    </>
  )
}
