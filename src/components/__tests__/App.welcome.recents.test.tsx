import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import App from '@/App'
import { within } from '@testing-library/react'

const { RECENT_PROJECTS, defaultInvokeImplementation } = vi.hoisted(() => {
  const DAY = 24 * 60 * 60
  const now = Math.floor(Date.now() / 1000)
  const recents = [
    { name: 'p1', path: '/p1', last_accessed: now - DAY, is_git_repo: true, git_branch: 'main', git_status: 'clean' },
    { name: 'p2', path: '/p2', last_accessed: now - (5 * DAY), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
    { name: 'p3', path: '/p3', last_accessed: now - (10 * DAY), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
    { name: 'p4', path: '/p4', last_accessed: now - (20 * DAY), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
    { name: 'old1', path: '/old1', last_accessed: now - (40 * DAY), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
    { name: 'old2', path: '/old2', last_accessed: now - (60 * DAY), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
    { name: 'old3', path: '/old3', last_accessed: now - (90 * DAY), is_git_repo: true, git_branch: 'main', git_status: 'clean' },
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
      default:
        return null
    }
  }

  return { RECENT_PROJECTS: recents, defaultInvokeImplementation: handler }
})

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(defaultInvokeImplementation)
  }
})

vi.mock('@tauri-apps/api/event', () => {
  return { listen: vi.fn(async () => () => {}) }
})

vi.mock('@/components/ui/tabs', () => {
  const React = require('react')
  const TabsContext = React.createContext<{
    value: string
    setValue: (value: string) => void
  }>({
    value: '',
    setValue: () => {}
  })

  const Tabs = ({ value, defaultValue, onValueChange, children, className, ...rest }: any) => {
    const [internalValue, setInternalValue] = React.useState(defaultValue ?? '')
    const activeValue = value ?? internalValue
    const setValue = (next: string) => {
      onValueChange?.(next)
      if (value === undefined) {
        setInternalValue(next)
      }
    }

    return (
      <div className={className} data-testid="mock-tabs-root" {...rest}>
        <TabsContext.Provider value={{ value: activeValue, setValue }}>
          {children}
        </TabsContext.Provider>
      </div>
    )
  }

  const TabsList = ({ children, className, ...rest }: any) => (
    <div role="tablist" className={className} data-testid="mock-tabs-list" {...rest}>
      {children}
    </div>
  )

  const TabsTrigger = ({ value, children, className, ...rest }: any) => {
    const { value: activeValue, setValue } = React.useContext(TabsContext)
    const isActive = activeValue === value
    return (
      <button
        type="button"
        role="tab"
        data-state={isActive ? 'active' : 'inactive'}
        aria-selected={isActive}
        className={className}
        onClick={() => setValue(value)}
        {...rest}
      >
        {children}
      </button>
    )
  }

  const TabsContent = ({ value, children, className, forceMount: _forceMount, ...rest }: any) => {
    const { value: activeValue } = React.useContext(TabsContext)
    const isActive = activeValue === value
    return (
      <div
        role="tabpanel"
        data-state={isActive ? 'active' : 'inactive'}
        hidden={!isActive}
        aria-hidden={!isActive}
        className={className}
        {...rest}
      >
        {children}
      </div>
    )
  }

  return {
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent
  }
})

if (typeof document !== 'undefined') describe('App welcome screen recent projects', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { invoke } = await import('@tauri-apps/api/core')
    const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>
    invokeMock.mockImplementation(defaultInvokeImplementation)
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
          return { show_welcome_recent_projects: false, show_console_output: true, file_mentions_enabled: true, projects_folder: '', ui_theme: 'auto', chat_send_shortcut: 'mod+enter', code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false } }
        case 'list_recent_projects':
          return []
        case 'check_ai_agents':
          return { agents: [] }
        case 'monitor_ai_agents':
          return null
        case 'get_cli_project_path':
          return null
        case 'get_user_home_directory':
          return ''
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

  it('activates chat tab when selecting a recent project', async () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(<App />)

    expect(await screen.findByText(/Welcome to Commander/i)).toBeInTheDocument()
    const recentsSection = await screen.findByTestId('welcome-recents')
    const projectButton = within(recentsSection).getByRole('button', { name: /p1/i })
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
