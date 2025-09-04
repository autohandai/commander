import React, { useState } from 'react'
import { parseAgentTranscript, ParsedAgentOutput } from './agent_transcript'

interface Props {
  raw: string
}

export function AgentResponse({ raw }: Props) {
  const parsed: ParsedAgentOutput | null = parseAgentTranscript(raw)
  if (!parsed) return <>{raw}</>

  const [showThinking, setShowThinking] = useState(false)
  // Details panel removed for compact footer

  return (
    <div className="space-y-3">
      <>
      {parsed.working && parsed.working.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1">Working</div>
          <div className="pl-3 border-l border-muted-foreground/30 space-y-1">
            {parsed.working.map((w, i) => {
              const badge = /^(created|added)/i.test(w)
                ? <span className="text-green-600 font-medium mr-1">created</span>
                : /^(modified|updated|changed)/i.test(w)
                  ? <span className="text-amber-600 font-medium mr-1">modified</span>
                  : /^(read|scanned)/i.test(w)
                    ? <span className="text-blue-600 font-medium mr-1">info</span>
                    : null
              const text = w.replace(/^(created|added|modified|updated|changed|read|scanned)\b[:\s-]*/i, '')
              return (
                <div key={i} className="text-sm flex items-start gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>
                    {badge}
                    {text}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {/* Meta is shown in the footer below */}

      {parsed.userInstructions && (
        <div className="text-xs bg-muted/10 p-2 rounded">
          <div className="font-medium mb-1">User instructions</div>
          <pre className="whitespace-pre-wrap text-[11px]">{parsed.userInstructions}</pre>
        </div>
      )}

      {parsed.thinking && (
        <div className="text-xs bg-muted/10 p-2 rounded">
          <button className="text-blue-600 dark:text-blue-400 hover:underline mb-1" onClick={() => setShowThinking((s) => !s)}>
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

      {/* Footer with command and compact summary */}
      <div className="text-xs text-muted-foreground bg-muted/20 rounded p-2 border">
        {parsed.header?.command && (
          <div className="mb-2"><span className="font-medium">Command:</span> {parsed.header.command}</div>
        )}
        <div className="mt-1">
          {parsed.meta?.model && <span className="mr-3">model: {parsed.meta.model}</span>}
          {typeof parsed.tokensUsed === 'number' && <span className="mr-3">tokens: {parsed.tokensUsed}</span>}
          {parsed.success && <span className="text-green-600">✓ success</span>}
        </div>
      </div>
      </>
    </div>
  )}

export function renderAgentResponse(raw: string) {
  return <AgentResponse raw={raw} />
}

export default AgentResponse
