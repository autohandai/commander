import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import App from '@/App'

const project = {
  name: 'Test Project',
  path: '/projects/test',
  last_accessed: Math.floor(Date.now() / 1000),
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

// Capture Tauri event listeners so we can fire them from tests
const eventListeners = vi.hoisted(() => new Map<string, Set<(...args: any[]) => void>>())

vi.mock('@tauri-apps/api/core', () => tauriCore)
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: (...args: any[]) => void) => {
    if (!eventListeners.get(event)) eventListeners.set(event, new Set())
    eventListeners.get(event)!.add(handler)
    // Return unlisten function
    return () => { eventListeners.get(event)?.delete(handler) }
  }),
}))
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
vi.mock('@/components/ChatInterface', () => ({ ChatInterface: () => <div data-testid="chat-interface" /> }))
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
    if (!context) throw new Error('TabsTrigger must be used within Tabs')
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
    if (!context) throw new Error('TabsContent must be used within Tabs')
    if (!forceMount && context.value !== value) return null
    return (
      <div data-state={context.value === value ? 'active' : 'inactive'} {...props}>
        {children}
      </div>
    )
  }

  return { Tabs, TabsList, TabsTrigger, TabsContent }
})

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

const buildSettings = () => ({
  show_console_output: true,
  projects_folder: '',
  file_mentions_enabled: true,
  show_welcome_recent_projects: true,
  chat_send_shortcut: 'mod+enter' as const,
  ui_theme: 'auto',
  default_cli_agent: 'claude' as const,
  has_completed_onboarding: true,
  code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: true },
})

function setupInvokeMock() {
  const invoke = tauriCore.invoke as unknown as ReturnType<typeof vi.fn>
  invoke.mockReset()
  invoke.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case 'load_app_settings':
        return buildSettings()
      case 'list_recent_projects':
        return [project]
      case 'refresh_recent_projects':
        return [project]
      case 'open_existing_project':
        return project
      case 'get_cli_project_path':
        return null
      case 'clear_cli_project_path':
        return null
      case 'get_user_home_directory':
        return '/projects'
      case 'get_available_project_applications':
        return []
      case 'get_project_git_worktrees':
        return []
      case 'load_project_chat':
        return []
      case 'load_chat_sessions':
      case 'load_unified_chat_sessions':
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
}

/** Simulate Tauri global shortcut event for Cmd+Shift+H */
function pressCmdShiftH() {
  act(() => {
    const handlers = eventListeners.get('shortcut://toggle-chat-history')
    if (handlers) {
      for (const handler of handlers) {
        handler({ payload: undefined })
      }
    }
  })
}

/** Simulate sidebar toggle (Cmd+B) via the sidebar trigger button */
function pressCmdB() {
  const trigger = screen.queryByTestId('sidebar-trigger') ?? screen.queryByLabelText('Toggle Sidebar')
  if (trigger) {
    act(() => { fireEvent.click(trigger) })
  }
}

/** Select a project so the chat tab is active */
async function openProject() {
  const projectButton = await screen.findByTitle('/projects/test')
  await act(async () => {
    fireEvent.click(projectButton)
  })
  // Wait for project header to appear
  await screen.findByTestId('project-identity-header')
}

if (typeof document !== 'undefined') describe('Chat session palette toggle (Cmd+Shift+H)', () => {
  beforeEach(() => {
    eventListeners.clear()
    setupInvokeMock()
  })

  it('shows chat session palette when Cmd+Shift+H is pressed', async () => {
    render(<App />)
    await openProject()

    // Palette should NOT be visible initially
    expect(screen.queryByPlaceholderText('Search threads...')).not.toBeInTheDocument()

    // Press Cmd+Shift+H
    pressCmdShiftH()

    // Palette should now be visible
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()
    })
  })

  it('hides palette when Cmd+Shift+H is pressed again', async () => {
    render(<App />)
    await openProject()

    // Open palette
    pressCmdShiftH()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()
    })

    // Press Cmd+Shift+H again to close
    pressCmdShiftH()

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search threads...')).not.toBeInTheDocument()
    })
  })

  it('palette mode does NOT collapse sidebar (overlay, not sidebar panel)', async () => {
    render(<App />)
    await openProject()

    const sidebarPanel = await screen.findByTestId('app-sidebar')
    const sidebar = sidebarPanel.closest('[data-state]') as HTMLElement | null
    expect(sidebar).not.toBeNull()

    // Sidebar should be expanded initially (chat tab)
    await waitFor(() => expect(sidebar).toHaveAttribute('data-state', 'expanded'))

    // Press Cmd+Shift+H to open palette
    pressCmdShiftH()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()
    })

    // Sidebar should stay expanded — palette is an overlay, not a sidebar panel
    expect(sidebar).toHaveAttribute('data-state', 'expanded')
  })

  it('palette remains visible after tab-related re-renders', async () => {
    render(<App />)
    await openProject()

    // Open palette
    pressCmdShiftH()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()
    })

    // Palette should still be visible (it's a fixed overlay, tab changes don't affect it)
    expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()
  })

  it('closes palette when backdrop is clicked', async () => {
    render(<App />)
    await openProject()

    // Open palette
    pressCmdShiftH()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()
    })

    // Click the backdrop to close
    fireEvent.click(screen.getByTestId('palette-backdrop'))

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search threads...')).not.toBeInTheDocument()
    })
  })

  it('palette shows even when not on chat tab (it is a fixed overlay)', async () => {
    render(<App />)
    await openProject()

    // Switch to code tab
    const codeTab = screen.getByTitle('Code')
    fireEvent.click(codeTab)

    // Press Cmd+Shift+H — palette is a modal overlay, shows on any tab
    pressCmdShiftH()

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()
    })
  })

  it('palette toggle works after Cmd+B interactions (regression)', async () => {
    render(<App />)
    await openProject()

    // Step 1: Cmd+Shift+H — show palette
    pressCmdShiftH()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()
    })

    // Step 2: Cmd+B — toggle sidebar (palette stays)
    pressCmdB()
    expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()

    // Step 3: Cmd+Shift+H — hide palette
    pressCmdShiftH()
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Search threads...')).not.toBeInTheDocument()
    })

    // Step 4: Cmd+B — toggle sidebar
    pressCmdB()

    // Step 5: Cmd+Shift+H — should show palette again
    pressCmdShiftH()
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()
    })
  })
})
