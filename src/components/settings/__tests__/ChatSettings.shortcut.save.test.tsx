import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsModal } from '@/components/SettingsModal'
import { SettingsProvider } from '@/contexts/settings-context'

const invokes: Array<{ cmd: string; args: any }> = []

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string, args: any) => {
      invokes.push({ cmd, args })
      switch (cmd) {
        case 'load_app_settings':
          return { show_console_output: true, projects_folder: '', file_mentions_enabled: true, ui_theme: 'auto', code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false }, chat_send_shortcut: 'mod+enter' }
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

if (typeof document !== 'undefined') describe('ChatSettings send shortcut save', () => {
  beforeEach(() => {
    invokes.length = 0
  })

  it('saves chat_send_shortcut when changed', async () => {
    render(
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={() => {}} initialTab={'chat'} />
      </SettingsProvider>
    )

    // Wait for modal
    await screen.findByText(/Chat Settings/i)

    // Click the Enter sends radio
    const radios = screen.getAllByRole('radio', { name: /sends/i }) as HTMLInputElement[]
    const enterRadio = radios.find((r) => r.value === 'enter') as HTMLInputElement
    fireEvent.click(enterRadio)
    await waitFor(() => expect(enterRadio.checked).toBe(true))

    // Ensure auto-save invoked with chat_send_shortcut: 'enter'
    await waitFor(() => {
      const saveCall = invokes.find((c) => c.cmd === 'save_app_settings' && c.args?.settings?.chat_send_shortcut === 'enter')
      expect(saveCall).toBeTruthy()
    })
  })
})
