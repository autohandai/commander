import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

if (typeof document !== 'undefined') describe('CodeView file explorer visibility by setting', () => {
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
            code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false, show_file_explorer: true },
            ui_theme: 'auto',
            max_chat_history: 15,
          }
        default:
          return null
      }
    })
  })

  it('shows the explorer by default and removes old toggle button', async () => {
    render(
      <SettingsProvider>
        <CodeView project={project as any} />
      </SettingsProvider>
    )

    // No toggle button should exist anymore
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /show file explorer/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /hide file explorer/i })).not.toBeInTheDocument()
      // Explorer UI elements should be present by default (e.g., Create Workspace)
      expect(screen.getByRole('button', { name: /create workspace/i })).toBeInTheDocument()
    })
  })
})
