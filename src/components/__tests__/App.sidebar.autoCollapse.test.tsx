import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import App from '@/App'

const project = {
  name: 'Sample Project',
  path: '/projects/sample',
  last_accessed: Math.floor(Date.now() / 1000),
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => tauriCore)
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
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

let autoCollapse = true

const buildSettings = () => ({
  show_console_output: true,
  projects_folder: '',
  file_mentions_enabled: true,
  show_welcome_recent_projects: true,
  chat_send_shortcut: 'mod+enter' as const,
  ui_theme: 'auto',
  default_cli_agent: 'claude' as const,
  code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: autoCollapse },
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

if (typeof document !== 'undefined') describe('App sidebar auto-collapse in code view', () => {
  beforeEach(() => {
    const invoke = tauriCore.invoke as unknown as ReturnType<typeof vi.fn>
    invoke.mockReset()
    autoCollapse = true
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
        case 'set_window_theme':
        case 'add_project_to_recent':
        case 'save_app_settings':
          return null
        default:
          return null
      }
    })
  })

  it('collapses the sidebar when entering the Code tab and restores it afterwards', async () => {
    render(<App />)

    const projectButton = await screen.findByRole('button', { name: /Sample Project/i })
    fireEvent.click(projectButton)

    const sidebarPanel = await screen.findByTestId('app-sidebar')
    const sidebar = sidebarPanel.closest('[data-state]') as HTMLElement | null
    expect(sidebar).not.toBeNull()
    await waitFor(() => expect(sidebar).toHaveAttribute('data-state', 'expanded'))

    const codeTab = screen.getByRole('tab', { name: /Code/i })
    fireEvent.click(codeTab)

    await waitFor(() => expect(sidebar).toHaveAttribute('data-state', 'collapsed'))

    const chatTab = screen.getByRole('tab', { name: /Chat/i })
    fireEvent.click(chatTab)

    await waitFor(() => expect(sidebar).toHaveAttribute('data-state', 'expanded'))
  })

  it('keeps sidebar expanded when preference is disabled', async () => {
    autoCollapse = false
    render(<App />)

    const projectButton = await screen.findByRole('button', { name: /Sample Project/i })
    fireEvent.click(projectButton)

    const sidebarPanel = await screen.findByTestId('app-sidebar')
    const sidebar = sidebarPanel.closest('[data-state]') as HTMLElement | null
    expect(sidebar).not.toBeNull()
    await waitFor(() => expect(sidebar).toHaveAttribute('data-state', 'expanded'))

    const codeTab = screen.getByRole('tab', { name: /Code/i })
    fireEvent.click(codeTab)

    await waitFor(() => expect(sidebar).toHaveAttribute('data-state', 'expanded'))
  })
})
