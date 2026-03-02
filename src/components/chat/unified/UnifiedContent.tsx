import { Response } from '../codex/Response'
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { Reasoning, ReasoningContent, ReasoningTrigger } from '../codex/Reasoning'
import { WorkingStepsCollapsible } from './WorkingStepsCollapsible'
import { MetaFooter } from './MetaFooter'
import type { NormalizedContent, NormalizedToolEvent } from './types'

function mapToolState(evt: NormalizedToolEvent): 'input-available' | 'input-streaming' | 'output-available' | 'output-error' {
  if (evt.phase === 'start') return 'input-available'
  if (evt.phase === 'update') return 'input-streaming'
  if (evt.phase === 'end' && evt.success === false) return 'output-error'
  return 'output-available'
}

interface UnifiedContentProps {
  content: NormalizedContent
}

export function UnifiedContent({ content }: UnifiedContentProps) {
  const { reasoning, workingSteps, answer, meta, toolEvents, isStreaming } = content

  return (
    <div className="space-y-3">
      {reasoning.length > 0 && (
        <Reasoning className="w-full" isStreaming={isStreaming} defaultOpen={isStreaming}>
          <ReasoningTrigger />
          <ReasoningContent>
            {reasoning.map((r) => (
              <div key={r.id}>{r.text}</div>
            ))}
          </ReasoningContent>
        </Reasoning>
      )}

      {workingSteps.length > 0 && (
        <WorkingStepsCollapsible steps={workingSteps} isStreaming={isStreaming} />
      )}

      {toolEvents.length > 0 && (
        <div className="space-y-2">
          {toolEvents.map((evt) => {
            const state = mapToolState(evt)
            return (
              <Tool key={`${evt.toolId}-${evt.phase}`} defaultOpen={false}>
                <ToolHeader
                  title={evt.toolName}
                  type="dynamic-tool"
                  state={state}
                  toolName={evt.toolName}
                />
                <ToolContent>
                  {evt.args && Object.keys(evt.args).length > 0 && (
                    <ToolInput input={evt.args as any} />
                  )}
                  {evt.output && (
                    <ToolOutput output={evt.output as any} errorText={undefined} />
                  )}
                </ToolContent>
              </Tool>
            )
          })}
        </div>
      )}

      {answer && <Response>{answer}</Response>}

      {meta && <MetaFooter meta={meta} />}
    </div>
  )
}
