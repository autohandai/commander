import { User, Bot, Loader2 } from 'lucide-react'
import { PlanBreakdown } from '@/components/PlanBreakdown'
import { AgentResponse } from './AgentResponse'

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

  return (
    <>
      {messages.map((message) => (
        <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[80%] rounded-lg p-3 ${
            message.role === 'user' 
              ? 'bg-primary text-primary-foreground ml-12' 
              : 'bg-muted mr-12'
          }`}>
            <div className="flex items-center gap-2 mb-1 text-xs opacity-70">
              {message.role === 'user' ? (
                <User className="h-3 w-3" />
              ) : (
                <Bot className="h-3 w-3" />
              )}
              <span>{message.role === 'user' ? 'You' : message.agent}</span>
              {message.role === 'assistant' && getAgentModel(message.agent) && (
                <>
                  <span>•</span>
                  <span className="text-muted-foreground">using {getAgentModel(message.agent)}</span>
                </>
              )}
              <span>•</span>
              <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
              {message.isStreaming && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
            </div>
            <div className="whitespace-pre-wrap text-sm">
              {(() => {
                const content = message.content || ''
                if (!content && message.isStreaming) return 'Thinking...'
                // Try rich agent rendering; fallback to plain content if not recognized
                return <AgentResponse raw={content} />
              })()}
            </div>
            {(() => {
              const content = message.content || ''
              const long = isLongMessage(content)
              if (!long) return null
              const expanded = expandedMessages.has(message.id)
              return (
                <div className="mt-2 text-right">
                  <button
                    onClick={() => onToggleExpand(message.id)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {expanded ? 'Show less' : 'Show more'}
                  </button>
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
      ))}
    </>
  )
}
