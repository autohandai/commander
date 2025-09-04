import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentResponse } from '@/components/chat/AgentResponse'

const sample = `Agent: codex | Command: test\n--------\nmodel: gpt-5\n--------\n[2025-09-04T00:00:00] codex\nhello\n[2025-09-04T00:00:01] tokens used: 10\n✅ Command completed successfully`;

describe('AgentResponse raw toggle', () => {
  it('shows raw when toggled', () => {
    render(<AgentResponse raw={sample} />)
    // structured visible by default
    expect(screen.getByText(/model:\s*gpt-5/i)).toBeInTheDocument()
    // toggle raw
    fireEvent.click(screen.getByRole('button', { name: /show raw output/i }))
    expect(screen.getByText(/Agent:\s*codex/i)).toBeInTheDocument()
    // hide raw
    fireEvent.click(screen.getByRole('button', { name: /hide raw output/i }))
    expect(screen.getByText(/model:\s*gpt-5/i)).toBeInTheDocument()
  })
})

