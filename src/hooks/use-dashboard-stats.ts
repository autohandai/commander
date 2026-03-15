import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface DailyActivity {
  date: string
  message_count: number
  token_count: number
}

export interface DashboardAgentInfo {
  name: string
  available: boolean
  version: string | null
}

export interface DashboardStats {
  total_messages: number
  total_sessions: number
  total_tokens: number
  agents_used: Record<string, number>
  daily_activity: DailyActivity[]
  current_streak: number
  longest_streak: number
  memory_files_count: number
  available_agents: DashboardAgentInfo[]
}

export function useDashboardStats(days: number) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const isMounted = useRef(true)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await invoke<DashboardStats>('get_dashboard_stats', { days })
      if (isMounted.current) setStats(data)
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err))
        setStats(null)
      }
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }, [days])

  useEffect(() => { fetchStats() }, [fetchStats])

  // Auto-refresh when the background indexer completes a scan
  useEffect(() => {
    isMounted.current = true
    const unlisten = listen('indexer://scan-complete', () => {
      fetchStats()
    })
    return () => {
      isMounted.current = false
      unlisten.then(fn => fn())
    }
  }, [fetchStats])

  return { stats, loading, error, refresh: fetchStats }
}
