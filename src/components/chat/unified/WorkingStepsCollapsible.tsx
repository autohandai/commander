import { useState } from 'react'
import { cn } from '@/lib/utils'
import { getStepIconMeta } from '@/components/chat/utils/stepIcons'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDownIcon } from 'lucide-react'
import type { NormalizedWorkingStep } from './types'

interface WorkingStepsCollapsibleProps {
  steps: NormalizedWorkingStep[]
  isStreaming: boolean
}

export function WorkingStepsCollapsible({ steps, isStreaming }: WorkingStepsCollapsibleProps) {
  const [open, setOpen] = useState(false)

  if (steps.length === 0) return null

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-border/60 bg-muted/10 px-3 py-2"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <span className="flex items-center gap-2">
          <span>Working steps ({steps.length})</span>
          {isStreaming && <span className="text-xs text-primary">Thinking…</span>}
        </span>
        <ChevronDownIcon
          className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : 'rotate-0')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-2">
        {steps.map((step) => {
          const normalized = step.label.replace(
            /^(created|added|modified|updated|changed|read|scanned)\b[:\s-]*/i,
            ''
          )
          const { icon: IconComp, className } = getStepIconMeta({
            status: step.status,
            label: step.label,
          })
          return (
            <div key={step.id} className="flex items-start gap-2 text-sm">
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
  )
}
