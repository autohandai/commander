import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionScatterChart } from '@/components/dashboard/SessionScatterChart'

// Mock ResizeObserver for jsdom
beforeAll(() => {
  globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
})

const mockActivity = [
  { date: '2026-02-03', message_count: 0, token_count: 0 },
  { date: '2026-02-04', message_count: 3, token_count: 100 },
  { date: '2026-02-05', message_count: 0, token_count: 0 },
  { date: '2026-02-06', message_count: 10, token_count: 500 },
  { date: '2026-02-07', message_count: 1, token_count: 50 },
]

const mockAgentsUsed = { claude: 12, codex: 5, gemini: 3 }

describe('SessionScatterChart', () => {
  it('renders an SVG element', () => {
    const { container } = render(
      <SessionScatterChart dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders the container with data-testid', () => {
    const { container } = render(
      <SessionScatterChart dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(container.querySelector('[data-testid="session-scatter-chart"]')).toBeInTheDocument()
  })

  it('renders agent legend pills', () => {
    render(
      <SessionScatterChart dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('codex')).toBeInTheDocument()
    expect(screen.getByText('gemini')).toBeInTheDocument()
  })

  it('handles empty data gracefully', () => {
    const { container } = render(
      <SessionScatterChart dailyActivity={[]} agentsUsed={{}} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('does not render legend when no agents', () => {
    const { container } = render(
      <SessionScatterChart dailyActivity={[]} agentsUsed={{}} />
    )
    const legend = container.querySelector('.flex.flex-wrap.items-center')
    expect(legend).not.toBeInTheDocument()
  })
})
