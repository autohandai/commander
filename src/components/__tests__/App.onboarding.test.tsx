import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => tauriCore)
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

vi.mock('@/services/auth-service', () => ({
  initiateDeviceAuth: vi.fn(),
  pollForAuth: vi.fn(),
  validateToken: vi.fn().mockResolvedValue(null),
  logoutFromApi: vi.fn(),
  AUTH_CONFIG: {
    apiBaseUrl: 'https://autohand.ai/api/auth',
    verificationBaseUrl: 'https://autohand.ai/cli-auth',
    pollInterval: 2000,
    authTimeout: 300000,
    sessionExpiryDays: 30,
  },
}))

vi.mock('@/components/ChatInterface', () => ({ ChatInterface: () => <div data-testid="chat-interface" /> }))
vi.mock('@/components/CodeView', () => ({ CodeView: () => <div data-testid="code-view" /> }))
vi.mock('@/components/HistoryView', () => ({ HistoryView: () => <div data-testid="history-view" /> }))
vi.mock('@/components/AIAgentStatusBar', () => ({ AIAgentStatusBar: () => <div data-testid="status-bar" /> }))

import App from '@/App'

const mockUser = { id: '1', email: 'test@test.com', name: 'Test User', avatar_url: null }

function setupAuthenticatedMocks(settingsOverrides: Record<string, unknown> = {}) {
  tauriCore.invoke.mockImplementation(async (cmd: string) => {
    if (cmd === 'get_auth_token') return 'valid-tok'
    if (cmd === 'get_auth_user') return mockUser
    if (cmd === 'load_app_settings') return {
      show_console_output: true,
      projects_folder: '',
      file_mentions_enabled: true,
      code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false },
      has_completed_onboarding: false,
      ...settingsOverrides,
    }
    if (cmd === 'list_recent_projects') return []
    if (cmd === 'get_user_home_directory') return '/home/test'
    return null
  })
}

describe('App onboarding integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows onboarding when has_completed_onboarding is false', async () => {
    setupAuthenticatedMocks({ has_completed_onboarding: false })

    const { validateToken } = await import('@/services/auth-service')
    ;(validateToken as any).mockResolvedValueOnce(mockUser)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-get-started')).toBeInTheDocument()
    })
  })

  it('does not show onboarding when has_completed_onboarding is true', async () => {
    setupAuthenticatedMocks({ has_completed_onboarding: true })

    const { validateToken } = await import('@/services/auth-service')
    ;(validateToken as any).mockResolvedValueOnce(mockUser)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/welcome to commander/i)).toBeInTheDocument()
    })

    expect(screen.queryByTestId('onboarding-get-started')).not.toBeInTheDocument()
  })
})
