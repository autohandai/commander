import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { CodeView } from '@/components/CodeView'
import { SettingsProvider } from '@/contexts/settings-context'

let streamCb: ((e: { payload: { session_id: string; content: string; finished: boolean } }) => void) | null = null

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_: string, cb: any) => {
    streamCb = cb
    return () => {}
  })
}))

const calls: any[] = []
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
      return { current_directory: project.path, files: [] }
    }
    if (cmd === 'read_file_content') return ''
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

if (typeof document !== 'undefined') describe('CodeView auto refresh', () => {
  beforeEach(() => { vi.clearAllMocks(); streamCb = null })

  it('requests unfiltered listing and refreshes after stream finished', async () => {
    render(
      <SettingsProvider>
        <CodeView project={project as any} />
      </SettingsProvider>
    )

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))

    const firstCount = calls.filter(c => c.cmd === 'list_files_in_directory').length
    expect(firstCount).toBeGreaterThan(0)

    // simulate finish event -> should trigger another listing call
    streamCb?.({ payload: { session_id: 's', content: '', finished: true } })
    await waitFor(() => {
      const count = calls.filter(c => c.cmd === 'list_files_in_directory').length
      expect(count).toBeGreaterThan(1)
    })
  })
})
