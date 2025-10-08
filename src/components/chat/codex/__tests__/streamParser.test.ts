import { describe, it, expect } from 'vitest'
import { CodexStreamParser } from '../streamParser'

describe('CodexStreamParser', () => {
  it('parses agent item events', () => {
    const parser = new CodexStreamParser()
    const payload = JSON.stringify({
      type: 'item.completed',
      item: {
        type: 'agent_message',
        id: 'msg_1',
        text: 'Hello from Codex',
      },
    })

    expect(parser.feed(payload)).toBe('Hello from Codex')
  })

  it('accumulates response delta events', () => {
    const parser = new CodexStreamParser()

    expect(
      parser.feed(
        'data: {"type":"response.output_text.delta","delta":{"text":"Hello"}}'
      )
    ).toBe('Hello')

    expect(
      parser.feed(
        'data: {"type":"response.output_text.delta","delta":{"text":" world"}}'
      )
    ).toBe('Hello world')
  })

  it('uses response.completed payload for final text', () => {
    const parser = new CodexStreamParser()

    parser.feed('data: {"type":"response.output_text.delta","delta":"Hello"}')

    expect(
      parser.feed(
        'data: {"type":"response.completed","response":{"output":[{"type":"output_text","text":"Hello world"}]}}'
      )
    ).toBe('Hello world')
  })

  it('handles error payloads gracefully', () => {
    const parser = new CodexStreamParser()

    expect(
      parser.feed(
        'data: {"type":"response.error","error":{"message":"Agent failed"}}'
      )
    ).toBe('Error: Agent failed')
  })
})
