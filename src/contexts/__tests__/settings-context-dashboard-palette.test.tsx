import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import React from 'react'

const mockInvoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}))

import { SettingsProvider, useSettings } from '@/contexts/settings-context'

function PaletteProbe() {
  const { settings, updateSettings, isLoading } = useSettings()
  const [readings, setReadings] = React.useState<string[]>([])

  React.useEffect(() => {
    if (isLoading) return
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue('--dashboard-agent-claude')
      .trim()
    setReadings((current) => [...current, value])
  }, [isLoading, settings.dashboard_color_palette])

  return (
    <div>
      <button
        type="button"
        onClick={() => void updateSettings({ dashboard_color_palette: 'ocean' })}
      >
        change palette
      </button>
      <div data-testid="palette-readings">{readings.join('|')}</div>
    </div>
  )
}

describe('SettingsProvider dashboard palette synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.style.removeProperty('--dashboard-agent-claude')
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'load_app_settings') {
        return {
          show_console_output: true,
          projects_folder: '',
          file_mentions_enabled: true,
          dashboard_color_palette: 'default',
          code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false, show_file_explorer: true },
        }
      }
      if (cmd === 'save_app_settings') return undefined
      if (cmd === 'set_window_theme') return undefined
      return null
    })
  })

  it('applies the new dashboard palette before dependent effects read chart colors', async () => {
    render(
      <SettingsProvider>
        <PaletteProbe />
      </SettingsProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('palette-readings')).toHaveTextContent('#3b82f6')
    })

    fireEvent.click(screen.getByRole('button', { name: /change palette/i }))

    await waitFor(() => {
      expect(screen.getByTestId('palette-readings')).toHaveTextContent('#3b82f6|#0ea5e9')
    })
  })
})
