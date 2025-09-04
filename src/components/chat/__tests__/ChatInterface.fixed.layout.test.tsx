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

if (typeof document !== 'undefined') describe('ChatInterface fixed layout solution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock scrollIntoView
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('implements the correct layout structure as per user diagram requirements', async () => {
    render(
      <ToastProvider>
        <div className="flex flex-col h-screen" data-testid="app-container">
          {/* Simulate title bar */}
          <div className="h-6 w-full" data-testid="title-bar" />
          
          {/* RED AREA: Breadcrumb header - should always stay at top */}
          <header className="flex h-10 shrink-0 items-center gap-2 border-b w-full" data-testid="breadcrumb-header">
            <div className="flex items-center gap-2 px-2 w-full">
              <nav aria-label="breadcrumb">
                <span>Users</span> / <span>test</span> / <span>test-project</span>
              </nav>
            </div>
          </header>
          
          {/* Main content area */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <div className="px-4 pt-4">
                  <div>Chat Tab Header</div>
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

    // Verify layout structure matches requirements
    const breadcrumbHeader = screen.getByTestId('breadcrumb-header')
    const chatRoot = screen.getByTestId('chat-root')
    const chatScrollArea = screen.getByTestId('chat-scrollarea')
    
    // RED AREA: Breadcrumb should be fixed at top with shrink-0
    expect(breadcrumbHeader).toBeVisible()
    expect(breadcrumbHeader).toHaveClass('shrink-0')
    
    // Chat root should have relative positioning for absolute input
    expect(chatRoot).toHaveClass('relative', 'flex', 'flex-col', 'flex-1', 'min-h-0', 'overflow-hidden')
    
    // Scroll area should fill the chat area absolutely
    expect(chatScrollArea).toHaveClass('absolute', 'inset-0', 'p-6')
    
    // Content should reserve space for fixed input (bottom padding)
    const paddedContent = chatScrollArea.querySelector('.pb-32')
    expect(paddedContent).toBeTruthy()

    // Get input and verify it exists (will be absolutely positioned)
    const input = screen.getByRole('textbox')
    expect(input).toBeInTheDocument()
    
    // Test message overflow behavior
    const messages = [
      '/claude test message 1',
      '/claude test message 2',
      '/claude test message 3',
      '/claude test message 4'
    ]
    
    for (const message of messages) {
      fireEvent.change(input, { target: { value: message } })
      fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
      
      await waitFor(() => {
        expect(screen.getByText(message)).toBeInTheDocument()
      })
    }

    // CRITICAL: Breadcrumb header must remain visible and at fixed position
    expect(breadcrumbHeader).toBeVisible()
    
    // Header should stay at the same position (top of viewport)
    const headerRect = breadcrumbHeader.getBoundingClientRect()
    expect(headerRect.top).toBeLessThan(20) // Should be near the top
    
    // Input should be accessible and not covered
    expect(input).toBeVisible()
    
    // Verify the input area is absolutely positioned at bottom of ChatInterface
    const chatInputArea = input.closest('div.absolute')
    expect(chatInputArea).toHaveClass('absolute', 'bottom-0', 'left-0', 'right-0')
  })

  it('maintains correct scroll behavior within the constrained messages area', async () => {
    render(
      <ToastProvider>
        <div className="h-screen flex flex-col">
          <div className="h-6" />
          <header className="flex h-10 shrink-0 items-center" data-testid="fixed-header">
            Header
          </header>
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col min-h-0">
              <ChatInterface
                isOpen={true}
                onToggle={() => {}}
                selectedAgent={undefined}
                project={project as any}
              />
            </div>
          </div>
        </div>
      </ToastProvider>
    )

    const scrollArea = screen.getByTestId('chat-scrollarea')
    
    // Verify content reserves space for fixed input via bottom padding
    const paddedContent = scrollArea.querySelector('.pb-32')
    expect(paddedContent).toBeTruthy()
    
    // Verify scroll area fills the container absolutely
    expect(scrollArea).toHaveClass('absolute', 'inset-0')
    
    // Messages should scroll within this constrained area
    const input = screen.getByRole('textbox')
    
    // Add content and verify scrolling works
    fireEvent.change(input, { target: { value: '/claude long message content' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    
    await waitFor(() => {
      expect(screen.getByText('/claude long message content')).toBeInTheDocument()
    })
    
    // Header should remain unaffected by scrolling
    const header = screen.getByTestId('fixed-header')
    expect(header).toBeVisible()
  })

  it('correctly positions input area at bottom with proper spacing', async () => {
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface
            isOpen={true}
            onToggle={() => {}}
            selectedAgent={undefined}
            project={project as any}
          />
        </div>
      </ToastProvider>
    )

    const input = screen.getByRole('textbox')
    const inputContainer = input.closest('div.absolute')
    
    // Input should be absolutely positioned at bottom
    expect(inputContainer).toHaveClass(
      'absolute', 
      'bottom-0', 
      'left-0', 
      'right-0', 
      'border-t', 
      'bg-background', 
      'p-4', 
      'pb-8'
    )
    
    // Verify input remains accessible after messages are added
    fireEvent.change(input, { target: { value: '/claude test' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    
    await waitFor(() => {
      expect(screen.getByText('/claude test')).toBeInTheDocument()
    })
    
    // Input should still be visible and positioned correctly
    expect(input).toBeVisible()
    expect(inputContainer).toHaveClass('absolute', 'bottom-0')
  })
})
