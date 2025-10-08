import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AgentResponse } from '@/components/chat/AgentResponse'

const sample = `Agent: codex | Command: test\n--------\nmodel: gpt-5\n--------\n[2025-09-04T00:00:00] codex\nhello\n[2025-09-04T00:00:01] tokens used: 10\n `;

describe('AgentResponse compact footer', () => {
  it('renders compact footer with command and no raw or details toggles', () => {
    render(<AgentResponse raw={sample} />)
    expect(screen.queryAllByText((_, n) => (n?.textContent || '').match(/Command:\s*test/i) != null).length).toBeGreaterThan(0)
    expect(screen.getByText(/model:\s*gpt-5/i)).toBeInTheDocument()
    // no raw toggle now
    expect(screen.queryByRole('button', { name: /show raw/i })).toBeNull()
    // and no details toggle
    expect(screen.queryByRole('button', { name: /show more/i })).toBeNull()
  })
})
