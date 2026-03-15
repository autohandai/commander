import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetricsStrip } from '@/components/dashboard/MetricsStrip'
import { applyDashboardPalette } from '@/lib/dashboard-palettes'

const defaultProps = {
  totalSessions: 1802,
  totalTokens: 438000,
  totalMessages: 3500,
  timeSavedMinutes: 720,
  currentStreak: 5,
  longestStreak: 12,
  agentsUsed: { claude: 67, codex: 22, gemini: 8, ollama: 3 },
  dailyActivity: [
    { date: '2026-03-01', message_count: 5, token_count: 1000 },
    { date: '2026-03-02', message_count: 8, token_count: 2000 },
    { date: '2026-03-03', message_count: 3, token_count: 500 },
    { date: '2026-03-04', message_count: 12, token_count: 4000 },
    { date: '2026-03-05', message_count: 0, token_count: 0 },
    { date: '2026-03-06', message_count: 7, token_count: 1500 },
    { date: '2026-03-07', message_count: 10, token_count: 3000 },
  ],
}

describe('MetricsStrip', () => {
  it('uses palette-driven sparkline accent colors', () => {
    applyDashboardPalette('ghostty-ember')
    const { container } = render(<MetricsStrip {...defaultProps} />)

    const sparklines = container.querySelectorAll('svg.metric-sparkline')
    expect(sparklines).toHaveLength(5)
    expect(sparklines[0].querySelector('rect')?.getAttribute('fill')).toBe('#fb7185')
    expect(sparklines[2].querySelector('polyline')?.getAttribute('stroke')).toBe('#f59e0b')
    expect(sparklines[3].querySelector('rect')?.getAttribute('fill')).toBe('#ef4444')
  })

  it('renders all 5 metric labels', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('Tokens')).toBeInTheDocument()
    expect(screen.getByText('Time Saved')).toBeInTheDocument()
    expect(screen.getByText('Streak')).toBeInTheDocument()
    expect(screen.getByText('Agent Mix')).toBeInTheDocument()
  })

  it('renders formatted session count', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('1,802')).toBeInTheDocument()
  })

  it('renders formatted token count with K suffix', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('438K')).toBeInTheDocument()
  })

  it('renders time saved value', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('~12h')).toBeInTheDocument()
  })

  it('renders streak value', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('5 days')).toBeInTheDocument()
  })

  it('renders agent count', () => {
    render(<MetricsStrip {...defaultProps} />)
    expect(screen.getByText('4 active')).toBeInTheDocument()
  })

  it('renders inline SVG sparklines', () => {
    const { container } = render(<MetricsStrip {...defaultProps} />)
    const inlineSvgs = container.querySelectorAll('svg.metric-sparkline')
    expect(inlineSvgs.length).toBe(5)
  })

  it('handles zero values', () => {
    render(
      <MetricsStrip
        totalSessions={0}
        totalTokens={0}
        totalMessages={0}
        timeSavedMinutes={0}
        currentStreak={0}
        longestStreak={0}
        agentsUsed={{}}
        dailyActivity={[]}
      />
    )
    // When tokens=0, second metric becomes "Messages" with value "0"
    const zeros = screen.getAllByText('0')
    expect(zeros.length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('0m')).toBeInTheDocument()
    expect(screen.getByText('0 days')).toBeInTheDocument()
    expect(screen.getByText('0 active')).toBeInTheDocument()
  })

  it('shows Messages instead of Tokens when totalTokens is 0', () => {
    render(
      <MetricsStrip
        {...defaultProps}
        totalTokens={0}
        totalMessages={3500}
        dailyActivity={defaultProps.dailyActivity.map(d => ({ ...d, token_count: 0 }))}
      />
    )
    expect(screen.getByText('Messages')).toBeInTheDocument()
    expect(screen.getByText('3,500')).toBeInTheDocument()
  })
})
