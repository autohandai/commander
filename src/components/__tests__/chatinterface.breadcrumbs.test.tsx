import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ChatInterface } from '@/components/ChatInterface'
import { ToastProvider } from '@/components/ToastProvider'

// Mock Tauri APIs used by ChatInterface
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
          return { claude: true, codex: true, gemini: true, test: true }
        case 'get_active_sessions':
          return { active_sessions: [], total_sessions: 0 }
        case 'load_sub_agents_grouped':
          return {}
        case 'load_prompts':
          return { prompts: {} }
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

// Simple breadcrumb placeholder for structure
function BreadcrumbHeader() {
  return (
    <nav aria-label="breadcrumb">
      <ol>
        <li>root</li>
        <li>demo</li>
      </ol>
    </nav>
  )
}

if (typeof document !== 'undefined') describe('ChatInterface layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps breadcrumbs visible and confines scrolling to chat history', async () => {
    render(
      <ToastProvider>
        <div className="flex flex-col h-screen min-h-0">
          <header>
            <BreadcrumbHeader />
          </header>
          <div className="flex-1 min-h-0">
            <ChatInterface isOpen={true} onToggle={() => {}} selectedAgent="Claude Code CLI" project={project as any} />
          </div>
        </div>
      </ToastProvider>
    )

    // Breadcrumbs exist and are visible
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument()

    // Wait for ChatInterface to finish initial async loads
    await waitFor(() => {
      // The chat scroll area container should be present
      const scroll = screen.getByTestId('chat-scrollarea')
      expect(scroll).toBeInTheDocument()
      // Root should allow inner scroll by using min-h-0
      const root = screen.getByTestId('chat-root')
      expect(root.className).toMatch(/min-h-0/)
    })

    // Ensure breadcrumbs are not rendered inside the chat scroll area
    const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i })
    const scroll = screen.getByTestId('chat-scrollarea')
    expect(scroll.contains(breadcrumb)).toBe(false)
  })
})

