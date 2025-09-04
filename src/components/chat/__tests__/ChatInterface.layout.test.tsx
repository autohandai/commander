import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

// Mock Tauri APIs
vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string, _args: any) => {
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
  name: 'demo',
  path: '/tmp/demo',
  last_accessed: 0,
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

if (typeof document !== 'undefined') describe('ChatInterface layout constraints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock scrollIntoView
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('maintains proper layout constraints to prevent viewport overflow', async () => {
    // Render ChatInterface within a constrained container simulating viewport
    render(
      <ToastProvider>
        <div className="h-screen max-h-screen overflow-hidden" data-testid="viewport-container">
          <div className="h-16 bg-gray-200" data-testid="breadcrumb-area">
            Breadcrumb Navigation
          </div>
          <div className="flex-1 min-h-0">
            <ChatInterface 
              isOpen={true} 
              onToggle={() => {}} 
              selectedAgent={undefined} 
              project={project as any} 
            />
          </div>
        </div>
      </ToastProvider>
    )

    // Verify initial layout structure
    const chatRoot = screen.getByTestId('chat-root')
    const chatScrollArea = screen.getByTestId('chat-scrollarea')
    const breadcrumbArea = screen.getByTestId('breadcrumb-area')
    
    // Check that chat root has proper constraint classes
    expect(chatRoot).toHaveClass('flex', 'flex-col', 'h-full', 'min-h-0')
    
    // Check that scroll area is properly constrained
    expect(chatScrollArea).toHaveClass('flex-1', 'p-6')
    
    // Verify breadcrumb is initially visible
    expect(breadcrumbArea).toBeVisible()

    // Add multiple messages to test layout behavior
    const input = screen.getByRole('textbox')
    
    // Send first message
    fireEvent.change(input, { target: { value: '/claude test message 1' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    
    await waitFor(() => {
      expect(screen.getByText('/claude test message 1')).toBeInTheDocument()
    })

    // Send second message  
    fireEvent.change(input, { target: { value: '/claude test message 2' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    
    await waitFor(() => {
      expect(screen.getByText('/claude test message 2')).toBeInTheDocument()
    })

    // Send third message
    fireEvent.change(input, { target: { value: '/claude test message 3' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    
    await waitFor(() => {
      expect(screen.getByText('/claude test message 3')).toBeInTheDocument()
    })

    // Critical test: Breadcrumb should still be visible after messages are added
    // This test will fail with the current layout issue
    expect(breadcrumbArea).toBeVisible()
    
    // Verify the chat container hasn't grown beyond its bounds
    const viewportContainer = screen.getByTestId('viewport-container')
    const chatContainer = chatRoot.parentElement
    
    // The chat container should not overflow the viewport
    if (chatContainer) {
      const viewportRect = viewportContainer.getBoundingClientRect()
      const chatRect = chatContainer.getBoundingClientRect()
      
      // Chat should not extend beyond viewport boundaries
      expect(chatRect.bottom).toBeLessThanOrEqual(viewportRect.bottom + 1) // Allow for 1px tolerance
    }
  })

  it('scroll area should have proper height constraints', () => {
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

    const scrollArea = screen.getByTestId('chat-scrollarea')
    
    // Check that scroll area has flex-1 for proper growth
    expect(scrollArea).toHaveClass('flex-1')
    
    // Check that scroll area has proper padding
    expect(scrollArea).toHaveClass('p-6')
  })
})