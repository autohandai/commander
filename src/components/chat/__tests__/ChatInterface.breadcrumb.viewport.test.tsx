import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string) => {
      switch (cmd) {
        case 'load_all_agent_settings':
          return {
            claude: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            codex: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            gemini: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            max_concurrent_sessions: 10,
          }
        case 'load_agent_settings':
          return { claude: true, codex: true, gemini: true }
        case 'get_active_sessions':
          return { active_sessions: [], total_sessions: 0 }
        case 'load_sub_agents_grouped':
          return {}
        case 'get_git_worktree_preference':
          return true
        case 'save_project_chat':
          return null
        case 'load_app_settings':
          return { file_mentions_enabled: true, chat_send_shortcut: 'mod+enter' }
        default:
          return null
      }
    })
  }
})

vi.mock('@tauri-apps/api/event', () => {
  return {
    listen: vi.fn(async () => () => {}),
  }
})

const project = {
  name: 'test-project',
  path: '/Users/test/test-project',
  last_accessed: 0,
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

if (typeof document !== 'undefined') describe('ChatInterface breadcrumb viewport fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock scrollIntoView
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('prevents ChatInterface from pushing breadcrumbs out of viewport when messages overflow', async () => {
    // Simulate the actual app layout hierarchy
    render(
      <ToastProvider>
        <div className="flex flex-col h-screen" data-testid="sidebar-inset">
          {/* Title bar */}
          <div className="h-6 w-full" data-testid="title-bar" />
          
          {/* Header with breadcrumbs */}
          <header className="flex h-10 shrink-0 items-center gap-2 border-b w-full" data-testid="app-header">
            <div className="flex items-center gap-2 px-2 w-full">
              <nav aria-label="breadcrumb" data-testid="breadcrumb-nav">
                <div className="flex items-center gap-2">
                  <span>Users</span>
                  <span>/</span>
                  <span>test</span>
                  <span>/</span>
                  <span>test-project</span>
                </div>
              </nav>
            </div>
          </header>
          
          {/* Main content area */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* ProjectView simulation */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {/* Tabs simulation */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <div className="px-4 pt-4">
                  <div>Chat Tab</div>
                </div>
                
                {/* TabsContent simulation */}
                <div className="flex-1 m-0 min-h-0 min-w-0">
                  <ChatInterface
                    isOpen={true}
                    onToggle={() => {}}
                    selectedAgent={undefined}
                    project={project as any}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ToastProvider>
    )

    // Verify initial layout
    const breadcrumbNav = screen.getByTestId('breadcrumb-nav')
    const chatRoot = screen.getByTestId('chat-root')
    const appHeader = screen.getByTestId('app-header')
    
    // Verify breadcrumb is initially visible
    expect(breadcrumbNav).toBeVisible()
    expect(appHeader).toBeVisible()
    
    // Check that chat interface has proper constraints
    expect(chatRoot).toHaveClass('flex', 'flex-col', 'flex-1', 'min-h-0', 'overflow-hidden')

    // Add multiple messages to test overflow behavior
    const input = screen.getByRole('textbox')
    
    // Send multiple messages to trigger potential overflow
    const messages = [
      '/claude message 1',
      '/claude message 2', 
      '/claude message 3',
      '/claude message 4',
      '/claude message 5'
    ]
    
    for (const message of messages) {
      fireEvent.change(input, { target: { value: message } })
      fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
      
      await waitFor(() => {
        expect(screen.getByText(message)).toBeInTheDocument()
      })
    }

    // CRITICAL TEST: Breadcrumb must still be visible after messages overflow
    expect(breadcrumbNav).toBeVisible()
    expect(appHeader).toBeVisible()
    
    // Verify the header hasn't been pushed out of the viewport
    const headerRect = appHeader.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    
    // Header should be within the visible viewport (top should be >= 0)
    expect(headerRect.top).toBeGreaterThanOrEqual(0)
    expect(headerRect.top).toBeLessThan(viewportHeight)
    
    // Ensure the chat doesn't grow beyond the available space
    const sidebarInset = screen.getByTestId('sidebar-inset')
    const sidebarRect = sidebarInset.getBoundingClientRect()
    const chatRect = chatRoot.getBoundingClientRect()
    
    // Chat should not extend beyond the sidebar bounds
    expect(chatRect.bottom).toBeLessThanOrEqual(sidebarRect.bottom + 1) // 1px tolerance
  })

  it('maintains proper scrolling within chat messages without affecting header', async () => {
    render(
      <ToastProvider>
        <div className="flex flex-col h-screen">
          <div className="h-6 w-full" />
          <header className="flex h-10 shrink-0 items-center gap-2 border-b w-full" data-testid="fixed-header">
            <nav aria-label="breadcrumb">Breadcrumb</nav>
          </header>
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <div className="px-4 pt-4">
                  <div>Tabs</div>
                </div>
                <div className="flex-1 m-0 min-h-0 min-w-0">
                  <ChatInterface
                    isOpen={true}
                    onToggle={() => {}}
                    selectedAgent={undefined}
                    project={project as any}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </ToastProvider>
    )

    const header = screen.getByTestId('fixed-header')
    const chatScrollArea = screen.getByTestId('chat-scrollarea')
    
    // Verify scroll area has proper constraints
    expect(chatScrollArea).toHaveClass('flex-1', 'min-h-0', 'p-6')
    
    // Header should remain in fixed position
    const initialHeaderRect = header.getBoundingClientRect()
    
    // Add content and verify header doesn't move
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/claude test message' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    
    await waitFor(() => {
      expect(screen.getByText('/claude test message')).toBeInTheDocument()
    })
    
    const finalHeaderRect = header.getBoundingClientRect()
    
    // Header position should be unchanged
    expect(finalHeaderRect.top).toBe(initialHeaderRect.top)
    expect(finalHeaderRect.height).toBe(initialHeaderRect.height)
  })
})