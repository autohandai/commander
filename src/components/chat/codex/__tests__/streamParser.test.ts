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

  it('does not duplicate agent_message when item.started and item.completed fire for same id', () => {
    const parser = new CodexStreamParser()
    const item = {
      type: 'agent_message',
      id: 'msg_1',
      text: 'Hello from Codex',
    }

    // item.started fires first
    parser.feed(JSON.stringify({ type: 'item.started', item }))
    // item.completed fires with same item
    const result = parser.feed(JSON.stringify({ type: 'item.completed', item }))

    // Should contain the text only once, not duplicated
    expect(result).toBe('Hello from Codex')
  })

  it('does not duplicate reasoning when item.started and item.completed fire for same id', () => {
    const parser = new CodexStreamParser()
    const item = {
      type: 'reasoning',
      id: 'reason_1',
      text: 'Composing greeting response',
    }

    parser.feed(JSON.stringify({ type: 'item.started', item }))
    const result = parser.feed(JSON.stringify({ type: 'item.completed', item }))

    // Reasoning is wrapped in underscores; should appear only once
    expect(result).toBe('_Composing greeting response_')
  })

  it('does not duplicate message when agent_message item and response.completed both fire', () => {
    const parser = new CodexStreamParser()

    // agent_message arrives via item event
    parser.feed(JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', id: 'msg_1', text: 'Hello world' },
    }))

    // response.completed also contains the same text
    const result = parser.feed(JSON.stringify({
      type: 'response.completed',
      response: { output: [{ type: 'output_text', text: 'Hello world' }] },
    }))

    // Should contain message only once
    expect(result).toBe('Hello world')
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
