import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => tauriCore)

import { useDashboardStats } from '@/hooks/use-dashboard-stats'

const MOCK_STATS = {
  total_messages: 150,
  total_sessions: 20,
  total_tokens: 50000,
  agents_used: { claude: 12, codex: 5, gemini: 3 },
  daily_activity: [
    { date: '2026-03-03', message_count: 5, token_count: 1000 },
    { date: '2026-03-04', message_count: 10, token_count: 2000 },
  ],
  current_streak: 2,
  longest_streak: 5,
  memory_files_count: 8,
  available_agents: [
    { name: 'claude', available: true, version: '1.0' },
    { name: 'codex', available: true, version: '0.44' },
  ],
}

describe('useDashboardStats', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('fetches stats on mount and returns data', async () => {
    tauriCore.invoke.mockResolvedValueOnce(MOCK_STATS)
    const { result } = renderHook(() => useDashboardStats(30))
    expect(result.current.loading).toBe(true)
    await waitFor(() => { expect(result.current.loading).toBe(false) })
    expect(tauriCore.invoke).toHaveBeenCalledWith('get_dashboard_stats', { days: 30 })
    expect(result.current.stats).toEqual(MOCK_STATS)
    expect(result.current.error).toBeNull()
  })

  it('handles errors gracefully', async () => {
    tauriCore.invoke.mockRejectedValueOnce(new Error('Network error'))
    const { result } = renderHook(() => useDashboardStats(30))
    await waitFor(() => { expect(result.current.loading).toBe(false) })
    expect(result.current.stats).toBeNull()
    expect(result.current.error).toBe('Network error')
  })

  it('refetches when days parameter changes', async () => {
    tauriCore.invoke.mockResolvedValue(MOCK_STATS)
    const { result, rerender } = renderHook(
      ({ days }) => useDashboardStats(days),
      { initialProps: { days: 30 } }
    )
    await waitFor(() => { expect(result.current.loading).toBe(false) })
    rerender({ days: 7 })
    await waitFor(() => {
      expect(tauriCore.invoke).toHaveBeenCalledWith('get_dashboard_stats', { days: 7 })
    })
  })
})
