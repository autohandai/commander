import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { SettingsProvider } from '@/contexts/settings-context'
import { SettingsModal } from '@/components/SettingsModal'

const invokes: Array<{ cmd: string; args: any }> = []

const coreMock = vi.hoisted(() => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    invokes.push({ cmd, args })
    switch (cmd) {
      case 'load_app_settings':
        // Simulate async delay so modal effects run before hydration completes
        await new Promise((resolve) => setTimeout(resolve, 0))
        return {
          show_console_output: true,
          projects_folder: '',
          file_mentions_enabled: true,
          ui_theme: 'auto',
          chat_send_shortcut: 'mod+enter',
          show_welcome_recent_projects: true,
          max_chat_history: 15,
          default_cli_agent: 'claude',
          code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: true },
        }
      case 'save_app_settings':
        return null
      case 'set_window_theme':
        return null
      case 'get_default_projects_folder':
        return ''
      case 'load_agent_settings':
        return { claude: true, codex: true, gemini: true }
      case 'load_all_agent_settings':
        return { max_concurrent_sessions: 10 }
      default:
        return null
    }
  }),
}))

vi.mock('@tauri-apps/api/core', () => coreMock)
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

// Ensure document exists for React Testing Library behaviours
if (typeof document !== 'undefined') describe('SettingsModal auto-save persistence', () => {
  beforeEach(() => {
    invokes.length = 0
  })

  it('does not overwrite persisted code settings while hydrating', async () => {
    render(
      <SettingsProvider>
        <SettingsModal isOpen={false} onClose={() => {}} initialTab={'general'} />
      </SettingsProvider>
    )

    await waitFor(() => {
      const loadCall = invokes.find((c) => c.cmd === 'load_app_settings')
      expect(loadCall).toBeTruthy()
    })

    const badSave = invokes.find(
      (c) =>
        c.cmd === 'save_app_settings' &&
        c.args?.settings?.code_settings?.auto_collapse_sidebar === false
    )

    expect(badSave).toBeUndefined()
  })
})
