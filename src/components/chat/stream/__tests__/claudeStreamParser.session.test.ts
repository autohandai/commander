import { describe, it, expect } from 'vitest'
import { ClaudeStreamParser } from '@/components/chat/stream/claudeStreamParser'

describe('ClaudeStreamParser session_id extraction', () => {
  it('extracts session_id from a system event that contains one', () => {
    const parser = new ClaudeStreamParser('claude')
    const systemEvent = JSON.stringify({
      type: 'system',
      model: 'claude-sonnet-4-20250514',
      session_id: 'abc-session-123',
    })
    parser.feed(systemEvent)
    expect(parser.getSessionId()).toBe('abc-session-123')
  })

  it('returns null when system event has no session_id', () => {
    const parser = new ClaudeStreamParser('claude')
    const systemEvent = JSON.stringify({
      type: 'system',
      model: 'claude-sonnet-4-20250514',
    })
    parser.feed(systemEvent)
    expect(parser.getSessionId()).toBeNull()
  })

  it('returns null before any events are fed', () => {
    const parser = new ClaudeStreamParser('claude')
    expect(parser.getSessionId()).toBeNull()
  })

  it('captures session_id only from the first system event', () => {
    const parser = new ClaudeStreamParser('claude')
    const first = JSON.stringify({ type: 'system', session_id: 'first-session' })
    const second = JSON.stringify({ type: 'system', session_id: 'second-session' })
    parser.feed(first)
    parser.feed(second)
    // First one wins
    expect(parser.getSessionId()).toBe('first-session')
  })
})
