import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'

// Mock tauri invoke before importing the module under test
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}))
vi.mock('@/lib/dashboard-palettes', () => ({
  applyDashboardPalette: vi.fn(),
}))

import { SettingsProvider, useSettings } from '@/contexts/settings-context'

function wrapper({ children }: { children: React.ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>
}

describe('settings-context default_cli_agent normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock: load_app_settings returns the agent we specify
    mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'load_app_settings') {
        return { default_cli_agent: 'autohand', show_console_output: true, projects_folder: '', file_mentions_enabled: true }
      }
      if (cmd === 'save_app_settings') return undefined
      if (cmd === 'set_window_theme') return undefined
      return null
    })
  })

  it('preserves "autohand" as a valid default_cli_agent from backend', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // "autohand" should be preserved, NOT silently converted to "claude"
    expect(result.current.settings.default_cli_agent).toBe('autohand')
  })

  it('normalizes unknown agent values to "claude" fallback', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'load_app_settings') {
        return { default_cli_agent: 'unknown_agent', show_console_output: true, projects_folder: '', file_mentions_enabled: true }
      }
      if (cmd === 'save_app_settings') return undefined
      if (cmd === 'set_window_theme') return undefined
      return null
    })

    const { result } = renderHook(() => useSettings(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.settings.default_cli_agent).toBe('claude')
  })

  it('persists "autohand" through updateSettings without overwriting to "claude"', async () => {
    const { result } = renderHook(() => useSettings(), { wrapper })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    await act(async () => {
      await result.current.updateSettings({ default_cli_agent: 'autohand' })
    })

    // Check that save_app_settings was called with "autohand", not "claude"
    const saveCalls = mockInvoke.mock.calls.filter(([cmd]: any) => cmd === 'save_app_settings')
    expect(saveCalls.length).toBeGreaterThan(0)
    const lastSave = saveCalls[saveCalls.length - 1]
    expect(lastSave[1].settings.default_cli_agent).toBe('autohand')
  })
})
