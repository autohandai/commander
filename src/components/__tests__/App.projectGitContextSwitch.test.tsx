import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import App from '@/App'

const mainProject = {
  name: 'Sample Project',
  path: '/projects/sample',
  last_accessed: Math.floor(Date.now() / 1000),
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

const featureProject = {
  ...mainProject,
  git_branch: 'feature/sidebar',
}

const worktreeProject = {
  name: 'feature-sidebar',
  path: '/projects/sample/.commander/feature-sidebar',
  last_accessed: Math.floor(Date.now() / 1000),
  is_git_repo: true,
  git_branch: 'workspace/feature-sidebar',
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
vi.mock('@/components/ChatInterface', () => ({
  ChatInterface: ({ project }: any) => (
    <div data-testid="chat-interface">
      {project?.path}:{project?.git_branch}
    </div>
  ),
}))
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
  code_settings: {
    theme: 'github',
    font_size: 14,
    auto_collapse_sidebar: false,
    show_project_git_refs_in_sidebar: true,
  },
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

if (typeof document !== 'undefined') describe('App project git context switch', () => {
  beforeEach(() => {
    const invoke = tauriCore.invoke as unknown as ReturnType<typeof vi.fn>
    invoke.mockReset()
    invoke.mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'load_app_settings':
          return defaultSettings
        case 'list_recent_projects':
        case 'refresh_recent_projects':
          return [mainProject, worktreeProject]
        case 'open_existing_project':
          return args?.projectPath === worktreeProject.path ? worktreeProject : (args?.projectPath === mainProject.path && featureProject.git_branch === 'feature/sidebar' ? featureProject : mainProject)
        case 'switch_project_git_branch':
          return null
        case 'get_cli_project_path':
          return null
        case 'clear_cli_project_path':
          return null
        case 'get_user_home_directory':
          return '/projects'
        case 'get_available_project_applications':
          return []
        case 'get_git_branches':
          return ['main', 'feature/sidebar', 'workspace/feature-sidebar']
        case 'get_project_git_worktrees':
          return [
            { path: mainProject.path, branch: 'refs/heads/main', is_main: true },
            { path: worktreeProject.path, branch: 'refs/heads/workspace/feature-sidebar', is_main: false },
          ]
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

  it('switches to a selected worktree and updates the active chat context', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: /sample project/i }))
    fireEvent.click((await screen.findAllByRole('button', { name: /workspace\/feature-sidebar/i }))[1])

    await waitFor(() => {
      expect(screen.getByTestId('chat-interface')).toHaveTextContent(
        '/projects/sample/.commander/feature-sidebar:workspace/feature-sidebar'
      )
    })

    const refreshCalls = (tauriCore.invoke as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([command]) => command === 'refresh_recent_projects')
    expect(refreshCalls).toHaveLength(0)
  })

  it('switches branches and refreshes the active project context', async () => {
    let branchState = 'main'
    ;(tauriCore.invoke as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case 'load_app_settings':
          return defaultSettings
        case 'list_recent_projects':
        case 'refresh_recent_projects':
          return [branchState === 'main' ? mainProject : featureProject, worktreeProject]
        case 'open_existing_project':
          return args?.projectPath === worktreeProject.path ? worktreeProject : (branchState === 'main' ? mainProject : featureProject)
        case 'switch_project_git_branch':
          branchState = String(args?.branch ?? 'main')
          return null
        case 'get_cli_project_path':
          return null
        case 'clear_cli_project_path':
          return null
        case 'get_user_home_directory':
          return '/projects'
        case 'get_available_project_applications':
          return []
        case 'get_git_branches':
          return ['main', 'feature/sidebar', 'workspace/feature-sidebar']
        case 'get_project_git_worktrees':
          return [
            { path: mainProject.path, branch: `refs/heads/${branchState}`, is_main: true },
            { path: worktreeProject.path, branch: 'refs/heads/workspace/feature-sidebar', is_main: false },
          ]
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

    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: /sample project/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^feature\/sidebar$/i }))

    await waitFor(() => {
      expect((tauriCore.invoke as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('switch_project_git_branch', {
        projectPath: '/projects/sample',
        branch: 'feature/sidebar',
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId('chat-interface')).toHaveTextContent('/projects/sample:feature/sidebar')
    })

    const refreshCalls = (tauriCore.invoke as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([command]) => command === 'refresh_recent_projects')
    expect(refreshCalls).toHaveLength(0)
  })

  it('routes a workspace branch to the matching worktree instead of attempting checkout', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: /sample project/i }))
    fireEvent.click((await screen.findAllByRole('button', { name: /workspace\/feature-sidebar/i }))[0])

    await waitFor(() => {
      expect(screen.getByTestId('chat-interface')).toHaveTextContent(
        '/projects/sample/.commander/feature-sidebar:workspace/feature-sidebar'
      )
    })

    expect((tauriCore.invoke as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalledWith('switch_project_git_branch', {
      projectPath: '/projects/sample',
      branch: 'workspace/feature-sidebar',
    })

    const refreshCalls = (tauriCore.invoke as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([command]) => command === 'refresh_recent_projects')
    expect(refreshCalls).toHaveLength(0)
  })
})
