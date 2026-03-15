import { describe, it, expect } from 'vitest'
import { parseAgentTranscript } from '../agent_transcript_impl'

describe('parseAgentTranscript Answer section detection', () => {
  it('detects Answer section after separator', () => {
    const transcript = [
      'Agent: claude | Command: stream-json',
      '--------',
      'model: claude-opus-4-1-20250805',
      '--------',
      'Working',
      '• Hey! How can I help you today?',
      '--------',
      'Answer',
      'Hey! How can I help you today?',
    ].join('\n')

    const parsed = parseAgentTranscript(transcript)
    expect(parsed).not.toBeNull()
    expect(parsed!.answer).toBe('Hey! How can I help you today?')
  })

  it('detects multiline Answer section', () => {
    const transcript = [
      'Agent: claude | Command: stream-json',
      '--------',
      'model: claude-opus-4-1-20250805',
      '--------',
      'Working',
      '• Bash: ls',
      '• BashOutput: file1.txt file2.txt',
      '--------',
      'Answer',
      'Here are the files in your directory:',
      '- file1.txt',
      '- file2.txt',
    ].join('\n')

    const parsed = parseAgentTranscript(transcript)
    expect(parsed).not.toBeNull()
    expect(parsed!.answer).toContain('Here are the files in your directory:')
    expect(parsed!.answer).toContain('- file1.txt')
    expect(parsed!.answer).toContain('- file2.txt')
  })

  it('uses timestamp-style answer header when present (codex/gemini format)', () => {
    const transcript = [
      'Agent: codex | Command: test',
      '--------',
      'model: gpt-4',
      '--------',
      '[2025-01-01T00:00:00Z] codex',
      'Answer from timestamp header',
    ].join('\n')

    const parsed = parseAgentTranscript(transcript)
    expect(parsed).not.toBeNull()
    expect(parsed!.answer).toBe('Answer from timestamp header')
  })

  it('falls back to Answer section when timestamp header is absent', () => {
    const transcript = [
      'Agent: claude | Command: stream-json',
      '--------',
      'model: claude-3.5-sonnet',
      '--------',
      'Working',
      '• Analyzing connected MCP servers.',
      '--------',
      'Answer',
      'Finished.',
    ].join('\n')

    const parsed = parseAgentTranscript(transcript)
    expect(parsed).not.toBeNull()
    expect(parsed!.answer).toBe('Finished.')
    expect(parsed!.working).toEqual(['Analyzing connected MCP servers.'])
  })
})
