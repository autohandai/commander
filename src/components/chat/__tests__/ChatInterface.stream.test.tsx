import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

// Capture stream callback
let streamCb: ((e: { payload: { session_id: string; content: string; finished: boolean } }) => void) | null = null

// Mock Tauri event listen to capture callbacks
vi.mock('@tauri-apps/api/event', () => {
  return {
    listen: vi.fn(async (event: string, cb: any) => {
      if (event === 'cli-stream') streamCb = cb
      return () => {}
    }),
  }
})

// Track last invocation args for execute command
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
        case 'execute_test_command':
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

if (typeof document !== 'undefined') describe('ChatInterface streaming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    streamCb = null
    lastExecuteArgs = null
    // jsdom doesn't implement scrollIntoView
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('executes /test command and applies stream updates', async () => {
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} onToggle={() => {}} selectedAgent={undefined} project={project as any} />
        </div>
      </ToastProvider>
    )

    // Type a command and send
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/test hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Ensure execute_test_command was invoked
    await waitFor(() => expect(lastExecuteArgs).toBeTruthy())

    // Simulate streaming back a chunk
    const sid = lastExecuteArgs.sessionId as string
    expect(typeof sid).toBe('string')
    expect(sid.length).toBeGreaterThan(0)

    // Deliver a stream chunk to append content
    streamCb?.({ payload: { session_id: sid, content: 'chunk-1', finished: false } })
    await waitFor(() => expect(screen.getByText(/chunk-1/)).toBeInTheDocument())

    // Finish the stream; should remove from executing set (no UI assertion, just ensure no crash)
    streamCb?.({ payload: { session_id: sid, content: '', finished: true } })
  })
})
