import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionManagementPanel } from '@/components/chat/SessionManagementPanel'

const sessions = [
  { id: 's1', agent: 'agent1', created_at: 1, working_dir: '/tmp/a' },
  { id: 's2', agent: 'agent2', created_at: 1, working_dir: '/tmp/b' },
] as any

describe('SessionManagementPanel', () => {
  it('renders session rows and triggers callbacks', () => {
    const onAll = vi.fn()
    const onQuit = vi.fn()
    const onKill = vi.fn()
    const onClose = vi.fn()

    render(
      <SessionManagementPanel
        sessions={sessions}
        onTerminateAll={onAll}
        onSendQuit={onQuit}
        onTerminateSession={onKill}
        onClose={onClose}
      />
    )

    // Rows contain agent names
    expect(screen.getByText('agent1')).toBeInTheDocument()
    expect(screen.getByText('agent2')).toBeInTheDocument()

    // Terminate All
    fireEvent.click(screen.getByRole('button', { name: /Terminate All/i }))
    expect(onAll).toHaveBeenCalled()

    // Row actions
    const quitButtons = screen.getAllByRole('button', { name: /Send Quit/i })
    fireEvent.click(quitButtons[0])
    expect(onQuit).toHaveBeenCalledWith('s1')

    const killButtons = screen.getAllByRole('button', { name: /Force Kill/i })
    fireEvent.click(killButtons[1])
    expect(onKill).toHaveBeenCalledWith('s2')

    // Close
    const close = screen.getAllByRole('button').find((b) => (b as HTMLElement).className.includes('w-7'))!
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalled()
  })
})
