import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { SettingsModal } from '@/components/SettingsModal'
import { SettingsProvider } from '@/contexts/settings-context'

// Spyable invoke
const invokeMock = vi.fn(async (cmd: string, args?: any) => {
  switch (cmd) {
    case 'load_app_settings':
      return { show_console_output: true, projects_folder: '', file_mentions_enabled: true, ui_theme: 'auto', chat_send_shortcut: 'mod+enter', show_welcome_recent_projects: true, code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false } }
    case 'set_window_theme':
      return null
    case 'save_app_settings':
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
})

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: any[]) => invokeMock(...a) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

if (typeof document !== 'undefined') describe('SettingsModal autosaves welcome recents toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('auto-saves when toggling Show Recent Projects after confirmation', async () => {
    render(
      <ToastProvider>
        <SettingsProvider>
          <SettingsModal isOpen={true} onClose={() => {}} initialTab={'general'} />
        </SettingsProvider>
      </ToastProvider>
    )

    // Toggle off
    const toggle = await screen.findByLabelText('Show Recent Projects')
    fireEvent.click(toggle)

    // Confirm
    const confirmBtn = await screen.findByRole('button', { name: /confirm/i })
    fireEvent.click(confirmBtn)

    // Expect save_app_settings called with show_welcome_recent_projects false
    const calls = invokeMock.mock.calls.filter(c => c[0] === 'save_app_settings')
    expect(calls.length).toBeGreaterThan(0)
    const lastArgs = calls[calls.length - 1][1]
    expect(lastArgs.settings.show_welcome_recent_projects).toBe(false)
  })
})
