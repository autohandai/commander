import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentResponse } from '@/components/chat/AgentResponse'

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
--------
[2025-09-04T00:48:17] thinking
I will reply concisely.
[2025-09-04T00:48:18] codex
I’m doing well, thanks! How can I help you today?
[2025-09-04T00:48:19] tokens used: 5347`;

describe('AgentResponse view', () => {
  it('renders meta, hides thinking by default, and shows tokens', () => {
    render(<AgentResponse raw={sample} />)
    expect(screen.getByText(/model:\s*gpt-5/i)).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: /Working steps/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Considering structured output/i)).not.toBeInTheDocument()
    fireEvent.click(trigger)
    expect(screen.getByText(/Considering structured output/i)).toBeInTheDocument()
    expect(screen.getByText(/tokens:\s*5347/i)).toBeInTheDocument()
    expect(screen.queryByText(/I will reply concisely/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /show thinking/i }))
    expect(screen.getByText(/I will reply concisely/i)).toBeInTheDocument()
    const icons = screen.getAllByTestId('claude-step-icon')
    icons.forEach((icon) => {
      expect(icon.className).toMatch(/h-5/)
      expect(icon.className).toMatch(/w-5/)
    })
  })

  it('shows streaming hint while thinking', () => {
    render(<AgentResponse raw={sample} isStreaming />)
    expect(screen.getByText(/Working steps \(3\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Thinking…/i)).toBeInTheDocument()
  })
})
