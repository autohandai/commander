import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionStatusHeader } from '@/components/chat/SessionStatusHeader'

const makeStatus = (n: number) => ({
  total_sessions: n,
  active_sessions: Array.from({ length: n }).map((_, i) => ({
    id: `s${i}`,
    agent: `agent${i}`,
    command: 'cmd',
    is_active: true,
    created_at: Math.floor(Date.now() / 1000),
    last_activity: Math.floor(Date.now() / 1000),
  })),
})

describe('SessionStatusHeader', () => {
  it('renders active session count and up to 3 chips', () => {
    render(
      <SessionStatusHeader
        sessionStatus={makeStatus(5) as any}
        showSessionPanel={false}
        onTogglePanel={vi.fn()}
      />
    )
    expect(screen.getByText(/5 Active Sessions/i)).toBeInTheDocument()
    expect(screen.getAllByText(/agent[0-2]/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/\+2 more/i)).toBeInTheDocument()
  })

  it('reflects Manage/Hide label based on showSessionPanel', () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <SessionStatusHeader
        sessionStatus={makeStatus(1) as any}
        showSessionPanel={false}
        onTogglePanel={onToggle}
      />
    )
    const btn = screen.getByRole('button', { name: /Manage Sessions/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onToggle).toHaveBeenCalled()
    rerender(
      <SessionStatusHeader
        sessionStatus={makeStatus(1) as any}
        showSessionPanel={true}
        onTogglePanel={onToggle}
      />
    )
    expect(screen.getByRole('button', { name: /Hide Sessions/i })).toBeInTheDocument()
  })
})

