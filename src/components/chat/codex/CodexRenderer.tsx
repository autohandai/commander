import React from 'react'
import { Response } from './Response'
import { Reasoning, ReasoningContent, ReasoningTrigger } from './Reasoning'

interface CodexRendererProps {
  content: string
  isStreaming?: boolean
}

interface ParsedCodex {
  reasoning: string[]
  response: string
}

function parseCodexContent(content: string): ParsedCodex {
  const blocks = content.split('\n\n')
  const reasoning: string[] = []
  const responseParts: string[] = []

  for (const block of blocks) {
    if (!block.trim()) continue

    // Reasoning blocks are wrapped in underscores (italic markdown)
    if (block.startsWith('_') && block.endsWith('_')) {
      reasoning.push(block.slice(1, -1).trim())
    } else {
      responseParts.push(block)
    }
  }

  return {
    reasoning,
    response: responseParts.join('\n\n'),
  }
}

export function CodexRenderer({ content, isStreaming = false }: CodexRendererProps) {
  const parsed = parseCodexContent(content)

  return (
    <div className="space-y-3">
      {parsed.reasoning.length > 0 && (
        <Reasoning className="w-full" isStreaming={isStreaming} defaultOpen={false}>
          <ReasoningTrigger />
          <ReasoningContent>
            {parsed.reasoning.map((r, i) => (
              <div key={i}>{r}</div>
            ))}
          </ReasoningContent>
        </Reasoning>
      )}
      {parsed.response && <Response>{parsed.response}</Response>}
    </div>
  )
}
