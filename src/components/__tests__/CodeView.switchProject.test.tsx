import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, rerender } from '@testing-library/react'
import { CodeView } from '@/components/CodeView'
import { SettingsProvider } from '@/contexts/settings-context'

type Invoke = (cmd: string, args?: any) => Promise<any>

const calls: Array<{ cmd: string; args: any }> = []

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

// Mock invoke with path-sensitive responses and controllable delays
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    calls.push({ cmd, args })
    if (cmd === 'load_app_settings') {
      return {
        show_console_output: true,
        projects_folder: '',
        file_mentions_enabled: true,
        chat_send_shortcut: 'mod+enter',
        show_welcome_recent_projects: true,
        code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false },
        ui_theme: 'auto',
      }
    }
    if (cmd === 'list_files_in_directory') {
      const dir = args?.directoryPath
      if (dir === '/tmp/p1') {
        // Respond slower to simulate race
        await new Promise(r => setTimeout(r, 30))
        return {
          current_directory: dir,
          files: [
            { name: 'p1file.txt', path: '/tmp/p1/p1file.txt', relative_path: 'p1file.txt', is_directory: false },
          ],
        }
      }
      if (dir === '/tmp/p2') {
        // Respond quickly
        return {
          current_directory: dir,
          files: [
            { name: 'p2file.txt', path: '/tmp/p2/p2file.txt', relative_path: 'p2file.txt', is_directory: false },
          ],
        }
      }
      return { current_directory: dir, files: [] }
    }
    if (cmd === 'read_file_content') return ''
    return null
  })
}))

const p1 = { name: 'p1', path: '/tmp/p1', last_accessed: 0, is_git_repo: true, git_branch: 'main', git_status: 'clean' }
const p2 = { name: 'p2', path: '/tmp/p2', last_accessed: 0, is_git_repo: true, git_branch: 'main', git_status: 'clean' }

if (typeof document !== 'undefined') describe('CodeView updates when switching projects', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('shows new project files and does not render stale previous list', async () => {
    const { rerender } = render(
      <SettingsProvider>
        <CodeView project={p1 as any} />
      </SettingsProvider>
    )

    // Quickly switch to project 2 before p1 listing resolves
    rerender(
      <SettingsProvider>
        <CodeView project={p2 as any} />
      </SettingsProvider>
    )

    await waitFor(() => expect(screen.getByText('p2file.txt')).toBeInTheDocument())
    expect(screen.queryByText('p1file.txt')).not.toBeInTheDocument()
  })
})

