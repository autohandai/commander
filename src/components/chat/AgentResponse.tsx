import React, { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getStepIconMeta } from '@/components/chat/utils/stepIcons'
import { parseAgentTranscript, ParsedAgentOutput } from './agent_transcript'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDownIcon } from 'lucide-react'

interface Props {
  raw: string
  isStreaming?: boolean
}

export function AgentResponse({ raw, isStreaming = false }: Props) {
  const parsed: ParsedAgentOutput | null = parseAgentTranscript(raw)
  if (!parsed) {
    return <>{raw}</>
  }

  const [showThinking, setShowThinking] = useState(false)
  const [workingOpen, setWorkingOpen] = useState(false)
  const workingItems = parsed.working ?? []
  const workingCount = workingItems.length

  return (
    <div className="space-y-3">
      <>
      {workingCount > 0 && (
        <Collapsible
          open={workingOpen}
          onOpenChange={setWorkingOpen}
          className="rounded-md border border-border/60 bg-muted/10 px-3 py-2"
        >
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <span className="flex items-center gap-2">
              <span>Working steps ({workingCount})</span>
              {isStreaming && <span className="text-xs text-primary">Thinking…</span>}
            </span>
            <ChevronDownIcon
              className={cn('h-4 w-4 transition-transform', workingOpen ? 'rotate-180' : 'rotate-0')}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-2">
            {workingItems.map((original, i) => {
              const normalized = original.replace(/^(created|added|modified|updated|changed|read|scanned)\b[:\s-]*/i, '')
              const { icon: IconComp, className } = getStepIconMeta({ label: original })
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span
                    data-testid="claude-step-icon"
                    className={cn(
                      'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-background',
                      className
                    )}
                  >
                    <IconComp className="h-3 w-3" />
                  </span>
                  <span className="flex-1 text-foreground/90">{normalized}</span>
                </div>
              )
            })}
          </CollapsibleContent>
        </Collapsible>
      )}

      {parsed.userInstructions && (
        <div className="text-xs bg-muted/10 p-2 rounded">
          <div className="font-medium mb-1">User instructions</div>
          <pre className="whitespace-pre-wrap text-[11px]">{parsed.userInstructions}</pre>
        </div>
      )}

      {parsed.thinking && (
        <div className="text-xs bg-muted/10 p-2 rounded">
          <button
            className="text-blue-600 dark:text-blue-400 hover:underline mb-1"
            onClick={() => setShowThinking((s) => !s)}
          >
            {showThinking ? 'Hide thinking' : 'Show thinking'}
          </button>
          {showThinking && (
            <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground">{parsed.thinking}</pre>
          )}
        </div>
      )}

      {parsed.answer && (
        <div className="whitespace-pre-wrap text-sm">{parsed.answer}</div>
      )}

      <div className="text-xs text-muted-foreground bg-muted/20 rounded p-2 border">
        {parsed.header?.command && (
          <div className="mb-2">
            <span className="font-medium">Command:</span> {parsed.header.command}
          </div>
        )}
        <div className="mt-1">
          {parsed.meta?.model && <span className="mr-3">model: {parsed.meta.model}</span>}
          {typeof parsed.tokensUsed === 'number' && <span className="mr-3">tokens: {parsed.tokensUsed}</span>}
          {parsed.success && (
            <Badge variant="outline" className="border-green-600 text-green-600 uppercase tracking-wide">
              success
            </Badge>
          )}
        </div>
      </div>
      </>
    </div>
  )
}

export function renderAgentResponse(raw: string, isStreaming?: boolean) {
  return <AgentResponse raw={raw} isStreaming={isStreaming} />
}

export default AgentResponse
