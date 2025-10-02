import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

// Capture stream callback to avoid noise
let streamCb: ((e: { payload: { session_id: string; content: string; finished: boolean } }) => void) | null = null

vi.mock('@tauri-apps/api/event', () => {
  return {
    listen: vi.fn(async (event: string, cb: any) => {
      if (event === 'cli-stream') streamCb = cb
      return () => {}
    }),
  }
})

let lastExecuteArgs: any = null

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
          return { claude: true, codex: true, gemini: true, test: true }
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

if (typeof document !== 'undefined') describe('Execution Mode selector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    streamCb = null
    lastExecuteArgs = null
    // jsdom polyfill
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('sends executionMode to backend for /codex', async () => {
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} onToggle={() => {}} selectedAgent={undefined} project={project as any} />
        </div>
      </ToastProvider>
    )

    // Keep default Execution Mode (Agent ask to execute)

    // Type a codex command
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/codex say hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(lastExecuteArgs).toBeTruthy())
    expect(lastExecuteArgs).toHaveProperty('executionMode', 'collab')
  })
})
