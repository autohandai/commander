import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import App from '@/App'

vi.mock('@/services/auth-service', () => ({
  AUTH_CONFIG: { apiBaseUrl: 'https://autohand.ai/api/auth', pollInterval: 2000, authTimeout: 300000, sessionExpiryDays: 30 },
  initiateDeviceAuth: vi.fn(),
  pollForAuth: vi.fn(),
  validateToken: vi.fn().mockResolvedValue({ id: '1', email: 'test@test.com', name: 'Test', avatar_url: null }),
  logoutFromApi: vi.fn(),
}))

const { DUP_RECENTS, defaultInvokeImplementation } = vi.hoisted(() => {
  const now = Math.floor(Date.now() / 1000)
  const recents = [
    { name: 'dup', path: '/w/dup', last_accessed: now - 10, is_git_repo: true, git_branch: 'main', git_status: 'clean' },
    { name: 'other', path: '/w/other', last_accessed: now - 20, is_git_repo: true, git_branch: 'main', git_status: 'clean' },
    // duplicate entry for the same path with older timestamp
    { name: 'dup', path: '/w/dup', last_accessed: now - 30, is_git_repo: true, git_branch: 'main', git_status: 'dirty' },
  ]

  const handler = async (cmd: string) => {
    switch (cmd) {
      case 'load_app_settings':
        return { show_welcome_recent_projects: true, show_console_output: true, file_mentions_enabled: true, projects_folder: '', ui_theme: 'auto', chat_send_shortcut: 'mod+enter', code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false } }
      case 'list_recent_projects':
        return recents
      case 'refresh_recent_projects':
        return recents
      case 'open_existing_project':
        return recents[0]
      case 'check_ai_agents':
        return { agents: [] }
      case 'monitor_ai_agents':
        return null
      case 'get_cli_project_path':
        return null
      case 'get_user_home_directory':
        return ''
      case 'get_auth_token':
        return 'test-token'
      case 'get_auth_user':
        return { id: '1', email: 'test@test.com', name: 'Test', avatar_url: null }
      default:
        return null
    }
  }

  return { DUP_RECENTS: recents, defaultInvokeImplementation: handler }
})

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(defaultInvokeImplementation)
  }
})

vi.mock('@tauri-apps/api/event', () => {
  return { listen: vi.fn(async () => () => {}) }
})

describe('App sidebar deduplicates recent projects', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { invoke } = await import('@tauri-apps/api/core')
    const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>
    invokeMock.mockImplementation(defaultInvokeImplementation)
  })

  it('renders only one entry per project path', async () => {
    render(<App />)

    // Sidebar is present
    const sidebar = await screen.findByTestId('app-sidebar')

    // Wait for projects to load
    await waitFor(() => {
      // Inside sidebar: expect 'dup' only once and 'other' once
      const dupMatches = within(sidebar).queryAllByText(/^dup$/)
      const otherMatches = within(sidebar).queryAllByText(/^other$/)
      expect(dupMatches.length).toBe(1)
      expect(otherMatches.length).toBe(1)
    })
  })
})

