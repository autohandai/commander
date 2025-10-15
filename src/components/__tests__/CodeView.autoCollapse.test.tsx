import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CodeView } from '@/components/CodeView'
import { SettingsProvider } from '@/contexts/settings-context'

const project = {
  name: 'demo',
  path: '/tmp/demo',
  last_accessed: 0,
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

vi.mock('@/hooks/use-file-mention', () => ({
  useFileMention: () => ({
    files: [],
    listFiles: vi.fn(),
    loading: false,
  }),
}))

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => tauriCore)
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

if (typeof document !== 'undefined') describe('CodeView auto-collapse preference', () => {
  beforeEach(() => {
    const invoke = tauriCore.invoke as unknown as ReturnType<typeof vi.fn>
    invoke.mockReset()
    invoke.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'load_app_settings':
          return {
            show_console_output: true,
            projects_folder: '',
            file_mentions_enabled: true,
            chat_send_shortcut: 'mod+enter',
            show_welcome_recent_projects: true,
            default_cli_agent: 'claude',
            code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: true },
            ui_theme: 'auto',
            max_chat_history: 15,
          }
        default:
          return null
      }
    })
  })

  it('hides the explorer by default when preference is enabled and allows reopening it', async () => {
    render(
      <SettingsProvider>
        <CodeView project={project as any} />
      </SettingsProvider>
    )

    await waitFor(() => expect(screen.getByRole('button', { name: /show file explorer/i })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /hide file explorer/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /show file explorer/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /hide file explorer/i })).toBeInTheDocument())
  })
})
