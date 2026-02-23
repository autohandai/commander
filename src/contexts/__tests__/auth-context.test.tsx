import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../auth-context'

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => tauriCore)

const mockAuthService = vi.hoisted(() => ({
  initiateDeviceAuth: vi.fn(),
  pollForAuth: vi.fn(),
  validateToken: vi.fn(),
  logoutFromApi: vi.fn(),
  AUTH_CONFIG: {
    apiBaseUrl: 'https://autohand.ai/api/auth',
    verificationBaseUrl: 'https://autohand.ai/cli-auth',
    pollInterval: 2000,
    authTimeout: 300000,
    sessionExpiryDays: 30,
  },
}))

vi.mock('@/services/auth-service', () => mockAuthService)

function TestConsumer() {
  const { status, user, login, logout, error, userCode } = useAuth()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.name ?? 'none'}</span>
      <span data-testid="error">{error ?? 'none'}</span>
      <span data-testid="userCode">{userCode ?? 'none'}</span>
      <button onClick={login}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tauriCore.invoke.mockResolvedValue(null)
  })

  it('starts in loading state then goes to unauthenticated when no token', async () => {
    tauriCore.invoke.mockResolvedValue(null)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    expect(screen.getByTestId('status').textContent).toBe('loading')

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })
  })

  it('restores session from stored token when valid', async () => {
    tauriCore.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_auth_token') return 'valid-token'
      if (cmd === 'get_auth_user') return { id: '1', email: 'a@b.com', name: 'Test User', avatar_url: null }
      return null
    })

    mockAuthService.validateToken.mockResolvedValueOnce({
      id: '1',
      email: 'a@b.com',
      name: 'Test User',
      avatar_url: null,
    })

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
      expect(screen.getByTestId('user').textContent).toBe('Test User')
    })
  })

  it('clears token and shows unauthenticated when stored token is invalid', async () => {
    tauriCore.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_auth_token') return 'invalid-token'
      return null
    })

    mockAuthService.validateToken.mockResolvedValueOnce(null)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })

    expect(tauriCore.invoke).toHaveBeenCalledWith('clear_auth_token')
  })

  it('logout clears token and returns to unauthenticated', async () => {
    tauriCore.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_auth_token') return 'valid-token'
      if (cmd === 'get_auth_user') return { id: '1', email: 'a@b.com', name: 'Test User', avatar_url: null }
      return null
    })
    mockAuthService.validateToken.mockResolvedValueOnce({
      id: '1', email: 'a@b.com', name: 'Test User', avatar_url: null,
    })

    const user = userEvent.setup()

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })

    await act(async () => {
      await user.click(screen.getByText('Logout'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })

    expect(tauriCore.invoke).toHaveBeenCalledWith('clear_auth_token')
  })
})
