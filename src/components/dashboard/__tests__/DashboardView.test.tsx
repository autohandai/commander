import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock ResizeObserver for jsdom (used by SessionScatterChart)
beforeAll(() => {
  globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
})

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

const MOCK_STATS = {
  total_messages: 150, total_sessions: 20, total_tokens: 50000,
  agents_used: { claude: 12, codex: 5 },
  daily_activity: [{ date: '2026-03-04', message_count: 5, token_count: 1000 }],
  current_streak: 3, longest_streak: 7, memory_files_count: 4,
  available_agents: [],
}

vi.mock('@/hooks/use-dashboard-stats', () => ({
  useDashboardStats: () => ({ stats: MOCK_STATS, loading: false, error: null, refresh: vi.fn() }),
}))

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({ settings: { show_dashboard_activity: true } }),
}))

import { DashboardView } from '@/components/dashboard/DashboardView'

describe('DashboardView', () => {
  it('renders the scatter chart', () => {
    const { container } = render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)
    expect(container.querySelector('[data-testid="session-scatter-chart"]')).toBeInTheDocument()
  })

  it('renders the metrics strip', () => {
    const { container } = render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)
    expect(container.querySelector('[data-testid="metrics-strip"]')).toBeInTheDocument()
  })

  it('renders the activity timeline', () => {
    const { container } = render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)
    expect(container.querySelector('[data-testid="activity-timeline"]')).toBeInTheDocument()
  })

  it('renders session and token counts in metrics strip', () => {
    render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)
    expect(screen.getByText('20')).toBeInTheDocument()   // sessions
    // 50K appears in both MetricsStrip and ActivityTimeline
    const tokenLabels = screen.getAllByText('50K')
    expect(tokenLabels.length).toBeGreaterThanOrEqual(1)
  })

  it('renders days selector', () => {
    render(<DashboardView timeSavedMultiplier={5} days={30} onDaysChange={() => {}} />)
    expect(screen.getByText('Last 30 days')).toBeInTheDocument()
  })
})
