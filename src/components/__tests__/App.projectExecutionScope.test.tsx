import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import App from '@/App'

const projectA = {
  name: 'Alpha',
  path: '/projects/alpha',
  last_accessed: Math.floor(Date.now() / 1000),
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

const projectB = {
  name: 'Beta',
  path: '/projects/beta',
  last_accessed: Math.floor(Date.now() / 1000) - 10,
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => tauriCore)
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('@/services/auth-service', () => ({
  initiateDeviceAuth: vi.fn(),
  pollForAuth: vi.fn(),
  validateToken: vi.fn().mockResolvedValue({
    id: '1', email: 'test@test.com', name: 'Test User', avatar_url: null,
  }),
  logoutFromApi: vi.fn(),
  AUTH_CONFIG: {
    apiBaseUrl: 'https://autohand.ai/api/auth',
    verificationBaseUrl: 'https://autohand.ai/cli-auth',
    pollInterval: 2000,
    authTimeout: 300000,
    sessionExpiryDays: 30,
  },
}))
vi.mock('@/components/ChatInterface', () => {
  const React = require('react')
  return {
    ChatInterface: ({ project, onExecutingChange }: any) => {
      const [executingSessions, setExecutingSessions] = React.useState<string[]>([])

      React.useEffect(() => {
        if (project?.path) {
          onExecutingChange?.(project.path, executingSessions)
        }
      }, [executingSessions, onExecutingChange, project?.path])

      return (
        <button type="button" onClick={() => setExecutingSessions(['session-alpha'])}>
          Start session for {project?.name}
        </button>
      )
    },
  }
})
vi.mock('@/components/CodeView', () => ({ CodeView: () => <div data-testid="code-view" /> }))
vi.mock('@/components/HistoryView', () => ({ HistoryView: () => <div data-testid="history-view" /> }))
vi.mock('@/components/AIAgentStatusBar', () => ({ AIAgentStatusBar: () => <div data-testid="status-bar" /> }))
vi.mock('@/components/ui/tabs', () => {
  const React = require('react')
  const TabsContext = React.createContext<{ value: string; onValueChange?: (value: string) => void } | null>(null)

  const Tabs = ({ value, onValueChange, children }: any) => (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div data-testid="tabs" data-active-tab={value}>{children}</div>
    </TabsContext.Provider>
  )

  const TabsList = ({ children, ...props }: any) => (
    <div role="tablist" {...props}>{children}</div>
  )

  const TabsTrigger = ({ value, children, ...props }: any) => {
    const context = React.useContext(TabsContext)
    if (!context) {
      throw new Error('TabsTrigger must be used within Tabs')
    }
    const isActive = context.value === value
    return (
      <button
        type="button"
        role="tab"
        data-state={isActive ? 'active' : 'inactive'}
        onClick={() => context.onValueChange?.(value)}
        {...props}
      >
        {children}
      </button>
    )
  }

  const TabsContent = ({ value, children, forceMount, ...props }: any) => {
    const context = React.useContext(TabsContext)
    if (!context) {
      throw new Error('TabsContent must be used within Tabs')
    }
    if (!forceMount && context.value !== value) return null
    return (
      <div data-state={context.value === value ? 'active' : 'inactive'} {...props}>
        {children}
      </div>
    )
  }

  return { Tabs, TabsList, TabsTrigger, TabsContent }
})

const defaultSettings = {
  show_console_output: true,
  projects_folder: '',
  file_mentions_enabled: true,
  show_welcome_recent_projects: true,
  chat_send_shortcut: 'mod+enter',
  code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false },
  ui_theme: 'auto',
  has_completed_onboarding: true,
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}

if (typeof document !== 'undefined') describe('App project execution scope', () => {
  beforeEach(() => {
    const invoke = tauriCore.invoke as unknown as ReturnType<typeof vi.fn>
    invoke.mockReset()
    invoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'load_app_settings':
          return defaultSettings
        case 'list_recent_projects':
        case 'refresh_recent_projects':
          return [projectA, projectB]
        case 'open_existing_project':
          return args?.projectPath === projectB.path ? projectB : projectA
        case 'get_cli_project_path':
          return null
        case 'clear_cli_project_path':
          return null
        case 'get_user_home_directory':
          return '/projects'
        case 'get_available_project_applications':
        case 'get_project_git_worktrees':
          return []
        case 'set_window_theme':
        case 'add_project_to_recent':
        case 'save_app_settings':
          return null
        case 'get_auth_token':
          return 'valid-token'
        case 'get_auth_user':
          return { id: '1', email: 'test@test.com', name: 'Test User', avatar_url: null }
        default:
          return null
      }
    })
  })

  it('keeps the running indicator on the original project after selecting another project', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: /alpha/i }))
    fireEvent.click(await screen.findByRole('button', { name: /start session for alpha/i }))

    const alphaRow = screen.getByRole('link', { name: /alpha/i }).closest('li')
    const betaRow = screen.getByRole('link', { name: /beta/i }).closest('li')
    expect(alphaRow).toBeTruthy()
    expect(betaRow).toBeTruthy()

    await waitFor(() => {
      expect(within(alphaRow as HTMLElement).getByLabelText(/agent running/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('link', { name: /beta/i }))

    await waitFor(() => {
      expect(within(alphaRow as HTMLElement).getByLabelText(/agent running/i)).toBeInTheDocument()
    })
    expect(within(betaRow as HTMLElement).queryByLabelText(/agent running/i)).toBeNull()
  })
})
