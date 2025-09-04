import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from '@/App'
import { within } from '@testing-library/react'

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string) => {
      switch (cmd) {
        case 'load_app_settings':
          return { show_welcome_recent_projects: true, show_console_output: true, file_mentions_enabled: true, projects_folder: '', ui_theme: 'auto', chat_send_shortcut: 'mod+enter', code_settings: { theme: 'github', font_size: 14 } }
        case 'list_recent_projects': {
          const now = Math.floor(Date.now() / 1000)
          const day = 24 * 60 * 60
          // 7 items, 4 within 30 days, 3 older
          return [
            { name: 'p1', path: '/p1', last_accessed: now - day, is_git_repo: true, git_branch: 'main', git_status: 'clean' },
            { name: 'p2', path: '/p2', last_accessed: now - (5 * day), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
            { name: 'p3', path: '/p3', last_accessed: now - (10 * day), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
            { name: 'p4', path: '/p4', last_accessed: now - (20 * day), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
            { name: 'old1', path: '/old1', last_accessed: now - (40 * day), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
            { name: 'old2', path: '/old2', last_accessed: now - (60 * day), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
            { name: 'old3', path: '/old3', last_accessed: now - (90 * day), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
          ]
        }
        case 'refresh_recent_projects':
          return []
        default:
          return null
      }
    })
  }
})

vi.mock('@tauri-apps/api/event', () => {
  return { listen: vi.fn(async () => () => {}) }
})

if (typeof document !== 'undefined') describe('App welcome screen recent projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows up to 5 recent projects from last 30 days', async () => {
    render(<App />)

    // Title appears
    expect(await screen.findByText(/Welcome to Commander/i)).toBeInTheDocument()

    // Recent Projects section appears
    const recentsSection = await screen.findByTestId('welcome-recents')
    expect(recentsSection).toBeInTheDocument()
    expect(screen.getByTestId('welcome-recents-title')).toHaveTextContent('Recent')

    // Only items within 30 days should be shown (4 in mocked data, but limit 5)
    await waitFor(() => {
      expect(within(recentsSection).queryByText('p1')).toBeInTheDocument()
      expect(within(recentsSection).queryByText('p2')).toBeInTheDocument()
      expect(within(recentsSection).queryByText('p3')).toBeInTheDocument()
      expect(within(recentsSection).queryByText('p4')).toBeInTheDocument()
      expect(within(recentsSection).queryByText('old1')).not.toBeInTheDocument()
      expect(within(recentsSection).queryByText('old2')).not.toBeInTheDocument()
      expect(within(recentsSection).queryByText('old3')).not.toBeInTheDocument()
    })
  })

  it('hides recent projects when setting disabled', async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    ;(invoke as any).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case 'load_app_settings':
          return { show_welcome_recent_projects: false, show_console_output: true, file_mentions_enabled: true, projects_folder: '', ui_theme: 'auto', chat_send_shortcut: 'mod+enter', code_settings: { theme: 'github', font_size: 14 } }
        case 'list_recent_projects':
          return []
        default:
          return null
      }
    })

    render(<App />)
    expect(await screen.findByText(/Welcome to Commander/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByTestId('welcome-recents')).not.toBeInTheDocument()
    })
  })
})
