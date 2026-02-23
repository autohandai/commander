import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginScreen } from '@/components/LoginScreen'

const mockLogin = vi.fn()
const mockCancelLogin = vi.fn()
let mockAuthValues: any = {
  status: 'unauthenticated' as const,
  user: null,
  token: null,
  error: null,
  userCode: null,
  verificationUri: null,
  login: mockLogin,
  logout: vi.fn(),
  cancelLogin: mockCancelLogin,
}

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuthValues,
}))

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthValues = {
      status: 'unauthenticated',
      user: null,
      token: null,
      error: null,
      userCode: null,
      verificationUri: null,
      login: mockLogin,
      logout: vi.fn(),
      cancelLogin: mockCancelLogin,
    }
  })

  it('renders sign in button in unauthenticated state', () => {
    render(<LoginScreen />)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByText(/commander/i)).toBeInTheDocument()
  })

  it('calls login when sign in is clicked', async () => {
    const user = userEvent.setup()
    render(<LoginScreen />)

    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(mockLogin).toHaveBeenCalledTimes(1)
  })

  it('shows user code and waiting message during polling', () => {
    mockAuthValues.status = 'polling'
    mockAuthValues.userCode = 'ABCD-1234'
    mockAuthValues.verificationUri = 'https://autohand.ai/cli-auth?code=ABCD-1234'

    render(<LoginScreen />)

    expect(screen.getByText('ABCD-1234')).toBeInTheDocument()
    expect(screen.getByText(/waiting for authorization/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('shows expired state with try again button', () => {
    mockAuthValues.status = 'expired'

    render(<LoginScreen />)

    expect(screen.getByText(/session expired/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows error state with try again button', () => {
    mockAuthValues.status = 'error'
    mockAuthValues.error = 'Network error'

    render(<LoginScreen />)

    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('calls cancelLogin when cancel is clicked during polling', async () => {
    mockAuthValues.status = 'polling'
    mockAuthValues.userCode = 'ABCD-1234'

    const user = userEvent.setup()
    render(<LoginScreen />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockCancelLogin).toHaveBeenCalledTimes(1)
  })

  it('shows loading spinner in loading state', () => {
    mockAuthValues.status = 'loading'

    render(<LoginScreen />)

    expect(screen.getByTestId('auth-loading')).toBeInTheDocument()
  })
})
