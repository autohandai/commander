import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

vi.mock('@tauri-apps/api/event', () => {
  return {
    listen: vi.fn(async () => () => {}),
  }
})

let lastExecuteCmd: string | null = null
let lastExecuteArgs: any = null

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string, args: any) => {
      switch (cmd) {
        case 'load_all_agent_settings':
          return {
            autohand: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            claude: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            codex: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            gemini: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            test: { enabled: true, sandbox_mode: false, auto_approval: false, session_timeout_minutes: 30, output_format: 'text', debug_mode: false },
            max_concurrent_sessions: 10,
          }
        case 'load_agent_settings':
          return { autohand: true, claude: true, codex: true, gemini: true, test: true }
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
        case 'save_project_chat':
          return null
        case 'execute_autohand_command':
          lastExecuteCmd = cmd
          lastExecuteArgs = args
          return null
        case 'execute_codex_command':
          lastExecuteCmd = cmd
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

if (typeof document !== 'undefined') describe('Execution Mode selector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastExecuteCmd = null
    lastExecuteArgs = null
    // jsdom polyfill
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('sends the selected Autohand permission mode to the backend', async () => {
    const user = userEvent.setup()
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} selectedAgent={'Autohand Code'} project={project as any} />
        </div>
      </ToastProvider>
    )

    await user.click(screen.getByRole('button', { name: /execution mode/i }))
    await waitFor(() => {
      expect(screen.getByRole('menuitemradio', { name: 'Dry Run' })).toBeTruthy()
    })
    await user.click(screen.getByRole('menuitemradio', { name: 'Dry Run' }))

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'say hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(lastExecuteArgs).toBeTruthy())
    expect(lastExecuteCmd).toBe('execute_autohand_command')
    expect(lastExecuteArgs).toHaveProperty('permissionMode', 'dry-run')
  })
})
