import { describe, it, expect } from 'vitest'
import { normalizeClaude } from '../unified/normalizers'

describe('normalizeClaude answer rendering', () => {
  it('extracts answer from Claude stream-json transcript with result event', () => {
    // This is what a simple Claude greeting produces:
    // assistant event puts text in Working, result event adds Answer section
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

    const result = normalizeClaude(transcript, {})
    expect(result.answer).toBe('Hey! How can I help you today?')
  })

  it('filters working steps that duplicate the answer text', () => {
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

    const result = normalizeClaude(transcript, {})
    // The working step that duplicates the answer should be filtered out
    const labels = result.workingSteps.map(s => s.label)
    expect(labels).not.toContain('Hey! How can I help you today?')
  })

  it('keeps working steps that are different from the answer', () => {
    const transcript = [
      'Agent: claude | Command: stream-json',
      '--------',
      'model: claude-opus-4-1-20250805',
      '--------',
      'Working',
      '• Bash: ls -la',
      '• BashOutput: file1.txt',
      '--------',
      'Answer',
      'Here are the files in your directory.',
    ].join('\n')

    const result = normalizeClaude(transcript, {})
    expect(result.answer).toBe('Here are the files in your directory.')
    expect(result.workingSteps.length).toBe(2)
    expect(result.workingSteps[0].label).toBe('Bash: ls -la')
    expect(result.workingSteps[1].label).toBe('BashOutput: file1.txt')
  })
})
