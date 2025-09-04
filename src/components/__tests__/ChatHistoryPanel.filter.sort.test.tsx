import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { ChatHistoryPanel } from '@/components/ChatHistoryPanel'

const project = { name: 'demo', path: '/tmp/demo' } as any

const now = Date.now()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => {
    switch (cmd) {
      case 'load_project_chat':
        return [
          // Older session messages
          { role: 'user', content: 'old session start', timestamp: now - 60 * 60 * 1000, agent: 'claude' },
          { role: 'assistant', content: 'old reply', timestamp: now - 59 * 60 * 1000, agent: 'claude' },
          // Newer session messages (gap > 5 minutes)
          { role: 'user', content: 'new session hello', timestamp: now - 1 * 60 * 1000, agent: 'claude' },
        ]
      default:
        return null
    }
  })
}))

if (typeof document !== 'undefined') describe('ChatHistoryPanel filter and sort', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows newest session first by default and filters by text', async () => {
    render(<ChatHistoryPanel project={project} />)

    // Wait for list
    await waitFor(() => {
      expect(screen.getByText(/Chat History/i)).toBeInTheDocument()
    })

    // Newest summary should appear before the older one
    const newest = screen.getByText(/new session hello/i)
    const oldest = screen.getByText(/old session start/i)
    const order = newest.compareDocumentPosition(oldest)
    // newest should appear before oldest in the DOM
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Filter only the old session
    const input = screen.getByPlaceholderText(/filter sessions/i)
    fireEvent.change(input, { target: { value: 'old' } })

    await waitFor(() => {
      expect(screen.queryByText(/new session hello/i)).not.toBeInTheDocument()
      expect(screen.getByText(/old session start/i)).toBeInTheDocument()
    })

    // Toggle sort order to oldest first, then back to newest
    const sortBtn = screen.getByRole('button', { name: /oldest first/i })
    fireEvent.click(sortBtn)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /newest first/i })).toBeInTheDocument()
    })
  })
})
