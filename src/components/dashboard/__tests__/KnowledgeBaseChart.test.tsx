import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KnowledgeBaseChart } from '@/components/dashboard/KnowledgeBaseChart'

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

describe('KnowledgeBaseChart', () => {
  it('renders an SVG element', () => {
    const { container } = render(
      <KnowledgeBaseChart dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders the container with data-testid', () => {
    render(
      <KnowledgeBaseChart dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(screen.getByTestId('knowledge-base-chart')).toBeInTheDocument()
  })

  it('renders agent legend pills', () => {
    render(
      <KnowledgeBaseChart dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(screen.getByText('claude')).toBeInTheDocument()
    expect(screen.getByText('codex')).toBeInTheDocument()
    expect(screen.getByText('gemini')).toBeInTheDocument()
  })

  it('handles empty data gracefully', () => {
    const { container } = render(
      <KnowledgeBaseChart dailyActivity={[]} agentsUsed={{}} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('does not render legend when no agents', () => {
    const { container } = render(
      <KnowledgeBaseChart dailyActivity={[]} agentsUsed={{}} />
    )
    const legend = container.querySelector('.flex.flex-wrap.items-center')
    expect(legend).not.toBeInTheDocument()
  })

  it('applies selectedAgent filtering to legend', () => {
    render(
      <KnowledgeBaseChart
        dailyActivity={mockActivity}
        agentsUsed={mockAgentsUsed}
        selectedAgent="claude"
      />
    )
    const claudeBtn = screen.getByText('claude').closest('button')
    const codexBtn = screen.getByText('codex').closest('button')
    expect(claudeBtn?.className).toContain('font-semibold')
    expect(codexBtn?.className).toContain('opacity-50')
  })
})
