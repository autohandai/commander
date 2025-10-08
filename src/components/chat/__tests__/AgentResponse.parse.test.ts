import { describe, it, expect } from 'vitest'
import { parseAgentTranscript } from '@/components/chat/agent_transcript'

const sample = `Agent: codex | Command: how are you?
[2025-09-04T00:48:13] OpenAI Codex v0.23.0 (research preview)
--------
workdir: /tmp/ws
model: gpt-5
provider: openai
approval: never
sandbox: read-only
reasoning effort: medium
reasoning summaries: auto
--------
[2025-09-04T00:48:12]
Working
• Considering structured output
| Designing a parser for structured markers
| Planning tests for parser and components

[2025-09-04T00:48:13] User instructions:
how are you?

[2025-09-04T00:48:17] thinking

I will reply concisely.

[2025-09-04T00:48:18] codex

I’m doing well, thanks! How can I help you today?
[2025-09-04T00:48:19] tokens used: 5347
`
;

describe('parseAgentTranscript', () => {
  it('extracts header, meta, thinking, answer and tokens', () => {
    const p = parseAgentTranscript(sample)
    expect(p).toBeTruthy()
    expect(p?.header?.agent).toMatch(/codex/i)
    expect(p?.header?.command).toMatch(/how are you/i)
    expect(p?.meta?.model).toBe('gpt-5')
    expect(p?.thinking).toMatch(/reply concisely/i)
    expect(p?.answer).toMatch(/doing well/i)
    expect(p?.tokensUsed).toBe(5347)
    expect(p?.success).toBe(true)
    expect(p?.working && p?.working.length).toBeGreaterThan(0)
    expect(p?.working?.[0]).toMatch(/Considering structured output/i)
  })
})
