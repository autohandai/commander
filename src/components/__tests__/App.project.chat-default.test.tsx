import { describe, it, beforeEach, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import App from '@/App'

const recentProject = {
  name: 'Alpha',
  path: '/projects/alpha',
  last_accessed: Math.floor(Date.now() / 1000),
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean'
}

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: (...args: Parameters<typeof invokeMock>) => invokeMock(...args)
  }
})

vi.mock('@tauri-apps/api/event', () => {
  return { listen: vi.fn(async () => () => {}) }
})

if (typeof document !== 'undefined') describe('App project selection activates chat view', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    Element.prototype.scrollIntoView = vi.fn()
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'load_app_settings':
          return {
            show_welcome_recent_projects: true,
            show_console_output: true,
            file_mentions_enabled: true,
            projects_folder: '',
            ui_theme: 'auto',
            chat_send_shortcut: 'mod+enter',
            code_settings: { theme: 'github', font_size: 14 }
          }
        case 'list_recent_projects':
        case 'refresh_recent_projects':
          return [recentProject]
        case 'open_existing_project':
          return recentProject
        case 'get_cli_project_path':
          return null
        case 'get_user_home_directory':
          return ''
        case 'check_ai_agents':
          return { agents: [] }
        case 'monitor_ai_agents':
          return null
        default:
          return null
      }
    })
  })

  it('keeps chat tab active after selecting a recent project', async () => {
    render(<App />)

    const projectButton = await screen.findByRole('button', { name: /alpha/i })
    fireEvent.click(projectButton)

    await waitFor(() => {
      const chatTab = screen.getByRole('tab', { name: /chat/i })
      expect(chatTab).toHaveAttribute('data-state', 'active')
    })

    await waitFor(() => {
      const codeTab = screen.getByRole('tab', { name: /code/i })
      expect(codeTab).toHaveAttribute('data-state', 'inactive')
    })
  })
})
