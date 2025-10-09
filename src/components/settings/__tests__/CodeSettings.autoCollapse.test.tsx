import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CodeSettings } from '@/components/settings/CodeSettings'

const updateSettings = vi.fn()
const baseSettings = {
  show_console_output: true,
  projects_folder: '',
  file_mentions_enabled: true,
  ui_theme: 'auto',
  chat_send_shortcut: 'mod+enter' as const,
  show_welcome_recent_projects: true,
  max_chat_history: 15,
  default_cli_agent: 'claude' as const,
  code_settings: {
    theme: 'github',
    font_size: 14,
    auto_collapse_sidebar: false,
  },
}

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: JSON.parse(JSON.stringify(baseSettings)),
    updateSettings,
  }),
}))

if (typeof document !== 'undefined') describe('CodeSettings auto-collapse preference', () => {
  beforeEach(() => {
    updateSettings.mockReset()
  })

  it('saves updated auto-collapse flag when toggled', async () => {
    render(<CodeSettings />)

    const toggle = screen.getByRole('switch', { name: /auto-collapse app sidebar/i })
    expect(toggle).toHaveAttribute('data-state', 'unchecked')

    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toHaveAttribute('data-state', 'checked'))

    const saveButton = screen.getByRole('button', { name: /save changes/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(updateSettings).toHaveBeenCalledWith({
        code_settings: {
          theme: 'github',
          font_size: 14,
          auto_collapse_sidebar: true,
        },
      })
    })
  })
})
