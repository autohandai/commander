import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

let streamCb: ((e: { payload: { session_id: string; content: string; finished: boolean } }) => void) | null = null

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => {
  return {
    listen: vi.fn(async (event: string, cb: any) => {
      if (event === 'cli-stream') streamCb = cb
      return () => {}
    }),
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

vi.mock('@tauri-apps/api/core', () => {
  const handler = vi.fn(async (cmd: string, args: any) => {
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
        return null
      default:
        return null
    }
  })
  mocks.invoke.mockImplementation(handler)
  return { invoke: (...args: any[]) => mocks.invoke(...args) }
})

if (typeof document !== 'undefined') describe('ChatInterface codex streaming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    streamCb = null
    mocks.invoke.mockClear()
    // jsdom lacks scrollIntoView
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('renders agent message content from codex JSON events', async () => {
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} onToggle={() => {}} selectedAgent={undefined} project={project as any} />
        </div>
      </ToastProvider>
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/codex how are you?' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('execute_codex_command', expect.objectContaining({ message: 'how are you?' }))
    })
    const call = mocks.invoke.mock.calls.find(([cmd]: [string]) => cmd === 'execute_codex_command')
    expect(call).toBeTruthy()
    const sessionId = call![1].sessionId as string
    expect(typeof sessionId).toBe('string')

    const eventPayload = {
      type: 'item.completed',
      item: {
        type: 'agent_message',
        id: 'msg_1',
        text: 'Hello from Codex',
      },
    }

    streamCb?.({ payload: { session_id: sessionId, content: JSON.stringify(eventPayload), finished: false } })

    await waitFor(() => {
      expect(screen.getByText('Hello from Codex')).toBeInTheDocument()
    })
  })
})
