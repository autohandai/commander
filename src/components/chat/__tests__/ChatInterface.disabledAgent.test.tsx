import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

let lastExecuteArgs: any = null

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}))

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string, args: any) => {
      switch (cmd) {
        case 'load_all_agent_settings':
          return {
            claude: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            codex: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            gemini: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            test: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            max_concurrent_sessions: 10,
          }
        case 'load_agent_settings':
          return { claude: true, codex: false, gemini: true, test: true }
        case 'get_active_sessions':
          return { active_sessions: [], total_sessions: 0 }
        case 'load_sub_agents_grouped':
          return {}
        case 'load_prompts':
          return { prompts: {} }
        case 'get_git_worktree_preference':
          return true
        case 'get_git_worktrees':
          return []
        case 'execute_codex_command':
          lastExecuteArgs = args
          return null
        default:
          return null
      }
    })
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

if (typeof document !== 'undefined') describe('ChatInterface disabled agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastExecuteArgs = null
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('blocks disabled agent and shows toast', async () => {
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} onToggle={() => {}} selectedAgent={undefined} project={project as any} />
        </div>
      </ToastProvider>
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/codex help' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Ensure command was not executed
    await waitFor(() => {
      expect(lastExecuteArgs).toBeNull()
    })

    // Confirm toast message appears
    await waitFor(() => {
      expect(screen.getByText(/Agent disabled/i)).toBeInTheDocument()
    })
  })
})

