import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CodeView } from '@/components/CodeView'
import { SettingsProvider } from '@/contexts/settings-context'

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {})
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === 'load_app_settings') {
      return {
        show_console_output: true,
        projects_folder: '',
        file_mentions_enabled: true,
        chat_send_shortcut: 'mod+enter',
        show_welcome_recent_projects: true,
        code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false, show_file_explorer: true },
        ui_theme: 'auto',
      }
    }
    if (cmd === 'list_files_in_directory') {
      return {
        current_directory: args?.directoryPath || '/tmp/demo',
        files: Array.from({ length: 50 }).map((_, i) => ({
          name: `file-${i}.txt`,
          path: `/tmp/demo/file-${i}.txt`,
          relative_path: `file-${i}.txt`,
          is_directory: false,
        })),
      }
    }
    if (cmd === 'read_file_content') return ''
    if (cmd === 'get_git_worktrees') return []
    return null
  })
}))

const project = {
  name: 'demo',
  path: '/tmp/demo',
  last_accessed: 0,
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

if (typeof document !== 'undefined') describe('CodeView file explorer scroll layout', () => {
  it('uses ScrollArea with flex-1 min-h-0 so file list can scroll', async () => {
    render(
      <SettingsProvider>
        <CodeView project={project as any} />
      </SettingsProvider>
    )

    const explorerRoot = await screen.findByTestId('code-file-explorer-root')

    expect(explorerRoot).toHaveClass('flex-1', 'min-h-0')
  })
})
