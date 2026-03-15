import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityTimeline } from '@/components/dashboard/ActivityTimeline'

const mockActivity = [
  { date: '2026-03-01', message_count: 5, token_count: 1000 },
  { date: '2026-03-02', message_count: 0, token_count: 0 },
  { date: '2026-03-03', message_count: 10, token_count: 5000 },
  { date: '2026-03-04', message_count: 3, token_count: 800 },
]

const mockAgentsUsed = { claude: 10, codex: 5 }

describe('ActivityTimeline', () => {
  it('renders an SVG element', () => {
    const { container } = render(
      <ActivityTimeline dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renders histogram bars for each day', () => {
    const { container } = render(
      <ActivityTimeline dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    const bars = container.querySelectorAll('rect[data-date]')
    expect(bars.length).toBe(4)
  })

  it('renders the Activity header with stats', () => {
    render(
      <ActivityTimeline
        dailyActivity={mockActivity}
        agentsUsed={mockAgentsUsed}
        totalTokens={6800}
      />
    )
    expect(screen.getByText('Activity')).toBeInTheDocument()
    expect(screen.getByText('7K tokens')).toBeInTheDocument()
    // 3 active days out of 4
    expect(screen.getByText('3 active days')).toBeInTheDocument()
  })

  it('renders agent legend with percentages', () => {
    render(
      <ActivityTimeline dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    expect(screen.getByText('claude 67%')).toBeInTheDocument()
    expect(screen.getByText('codex 33%')).toBeInTheDocument()
  })

  it('renders a colored proportion segment bar', () => {
    const { container } = render(
      <ActivityTimeline dailyActivity={mockActivity} agentsUsed={mockAgentsUsed} />
    )
    const segments = container.querySelectorAll('rect.agent-segment')
    expect(segments.length).toBe(2)
  })

  it('handles empty data', () => {
    const { container } = render(
      <ActivityTimeline dailyActivity={[]} agentsUsed={{}} />
    )
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('falls back to messages when no token data', () => {
    render(
      <ActivityTimeline
        dailyActivity={[
          { date: '2026-03-01', message_count: 5, token_count: 0 },
          { date: '2026-03-02', message_count: 8, token_count: 0 },
        ]}
        agentsUsed={{ claude: 5 }}
        totalMessages={13}
      />
    )
    expect(screen.getByText('13 messages')).toBeInTheDocument()
  })
})
