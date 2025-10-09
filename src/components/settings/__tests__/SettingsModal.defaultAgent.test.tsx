import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SettingsProvider } from '@/contexts/settings-context'
import { SettingsModal } from '@/components/SettingsModal'

const invokes: Array<{ cmd: string; args: any }> = []

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string, args: any) => {
      invokes.push({ cmd, args })
      switch (cmd) {
        case 'load_app_settings':
          return {
            show_console_output: true,
            projects_folder: '',
            file_mentions_enabled: true,
            ui_theme: 'auto',
            chat_send_shortcut: 'mod+enter',
            show_welcome_recent_projects: true,
            max_chat_history: 15,
            code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false },
            default_cli_agent: 'gemini',
          }
        case 'get_default_projects_folder':
          return '/tmp'
        case 'load_agent_settings':
          return { claude: true, codex: true, gemini: true }
        case 'load_all_agent_settings':
          return { max_concurrent_sessions: 10 }
        case 'save_app_settings':
          return null
        default:
          return null
      }
    })
  }
})

if (typeof document !== 'undefined') describe('SettingsModal default CLI agent control', () => {
  beforeEach(() => {
    invokes.length = 0
  })

  it('shows current default agent and persists changes', async () => {
    render(
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={() => {}} initialTab={'chat'} />
      </SettingsProvider>
    )

    await screen.findByText(/Chat Settings/i)

    const trigger = await screen.findByRole('combobox', { name: /Default CLI agent/i })
    expect(trigger).toHaveTextContent(/Gemini/i)

    fireEvent.click(trigger)
    const codexOption = await screen.findByRole('option', { name: /Codex/i })
    fireEvent.click(codexOption)

    // No auto-save should occur until primary Save button pressed
    expect(invokes.some((c) => c.cmd === 'save_app_settings' && c.args?.settings?.default_cli_agent === 'codex')).toBe(false)

    const saveButton = await screen.findByRole('button', { name: /Save Changes/i })
    fireEvent.click(saveButton)

    await waitFor(() => {
      const saveCall = invokes.find((c) => c.cmd === 'save_app_settings' && c.args?.settings?.default_cli_agent === 'codex')
      expect(saveCall).toBeTruthy()
    })
  })
})
