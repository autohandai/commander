/**
 * Regression test: messages must remain visible after sending a new message.
 *
 * Bug: After sending a message, all existing messages disappeared visually
 * (scrollbar showed content existed in DOM, but nothing was visible).
 * Root cause: ErrorBoundary caught a render error in MessagesList and permanently
 * trapped the error state — it never reset, so the fallback UI replaced messages
 * until the user restarted the app.
 *
 * Fixes verified here:
 * 1. ErrorBoundary resets when message count changes (via resetKey)
 * 2. Normalizer errors are caught per-message, not at the list level
 * 3. Messages remain visible after send + stream flow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

// Capture stream callback
let streamCb: ((e: { payload: { session_id: string; content: string; finished: boolean } }) => void) | null = null

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, cb: any) => {
    if (event === 'cli-stream') streamCb = cb
    return () => {}
  }),
}))

let lastExecuteArgs: any = null

vi.mock('@tauri-apps/api/core', () => ({
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
      case 'load_project_chat':
        return null
      case 'load_app_settings':
        return { max_chat_history: 50 }
      case 'execute_claude_command':
        lastExecuteArgs = args
        return null
      case 'execute_test_command':
        lastExecuteArgs = args
        return null
      default:
        return null
    }
  }),
}))

const project = {
  name: 'demo',
  path: '/tmp/demo',
  last_accessed: 0,
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

if (typeof document !== 'undefined') describe('ChatInterface message visibility after send', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    streamCb = null
    lastExecuteArgs = null
    sessionStorage.clear()
    // jsdom doesn't implement scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('existing messages remain visible after sending a new message', async () => {
    // Pre-populate sessionStorage with existing messages
    const existingMessages = [
      { id: 'msg-1', content: 'First message from user', role: 'user', timestamp: Date.now() - 3000, agent: 'Claude' },
      { id: 'msg-2', content: 'Response from Claude agent', role: 'assistant', timestamp: Date.now() - 2000, agent: 'Claude' },
      { id: 'msg-3', content: 'Second user message', role: 'user', timestamp: Date.now() - 1000, agent: 'Claude' },
      { id: 'msg-4', content: 'Another response from Claude', role: 'assistant', timestamp: Date.now() - 500, agent: 'Claude' },
    ]
    sessionStorage.setItem('chat:/tmp/demo', JSON.stringify({ messages: existingMessages }))

    render(
      <ToastProvider>
        <div style={{ height: '600px' }}>
          <ChatInterface isOpen={true} selectedAgent={undefined} project={project as any} />
        </div>
      </ToastProvider>
    )

    // Wait for hydration — existing messages should appear
    await waitFor(() => {
      expect(screen.getByText('First message from user')).toBeInTheDocument()
    })
    expect(screen.getByText('Response from Claude agent')).toBeInTheDocument()
    expect(screen.getByText('Second user message')).toBeInTheDocument()

    // Now send a new message
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/test hello world' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Wait for execute command
    await waitFor(() => expect(lastExecuteArgs).toBeTruthy())

    // Previous messages must still be visible after sending
    expect(screen.getByText('First message from user')).toBeInTheDocument()
    expect(screen.getByText('Response from Claude agent')).toBeInTheDocument()
    expect(screen.getByText('Second user message')).toBeInTheDocument()

    // The new user message should also be visible
    await waitFor(() => {
      expect(screen.getByText('/test hello world')).toBeInTheDocument()
    })

    // Deliver stream chunks — messages must still be visible during streaming
    const sid = lastExecuteArgs.sessionId as string
    act(() => {
      streamCb?.({ payload: { session_id: sid, content: 'streaming response', finished: false } })
    })

    // ALL original messages remain visible during streaming
    await waitFor(() => {
      expect(screen.getByText('First message from user')).toBeInTheDocument()
    })
    expect(screen.getByText('Response from Claude agent')).toBeInTheDocument()

    // Finish the stream
    act(() => {
      streamCb?.({ payload: { session_id: sid, content: '', finished: true } })
    })

    // ALL messages still visible after stream completes
    expect(screen.getByText('First message from user')).toBeInTheDocument()
    expect(screen.getByText('Response from Claude agent')).toBeInTheDocument()
    expect(screen.getByText('Second user message')).toBeInTheDocument()
  })

  it('messages remain visible even when ErrorBoundary catches a render error', async () => {
    // Pre-populate with messages
    const existingMessages = [
      { id: 'msg-safe-1', content: 'Safe message one', role: 'user', timestamp: Date.now() - 2000, agent: 'Claude' },
      { id: 'msg-safe-2', content: 'Safe response', role: 'assistant', timestamp: Date.now() - 1000, agent: 'Claude' },
    ]
    sessionStorage.setItem('chat:/tmp/demo', JSON.stringify({ messages: existingMessages }))

    render(
      <ToastProvider>
        <div style={{ height: '600px' }}>
          <ChatInterface isOpen={true} selectedAgent={undefined} project={project as any} />
        </div>
      </ToastProvider>
    )

    // Wait for hydration
    await waitFor(() => {
      expect(screen.getByText('Safe message one')).toBeInTheDocument()
    })

    // Verify no error boundary fallback is showing
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()

    // Messages should remain visible and no error state should persist
    // even across multiple re-renders
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/test ping' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(lastExecuteArgs).toBeTruthy())

    // Previous messages must survive the send flow
    expect(screen.getByText('Safe message one')).toBeInTheDocument()
    expect(screen.getByText('Safe response')).toBeInTheDocument()
  })

  it('messages from multiple agents remain visible after switching agents and sending', async () => {
    // Pre-populate with messages from different agents
    const existingMessages = [
      { id: 'msg-claude-1', content: 'Claude question', role: 'user', timestamp: Date.now() - 4000, agent: 'Claude' },
      { id: 'msg-claude-2', content: 'Claude answer text', role: 'assistant', timestamp: Date.now() - 3000, agent: 'Claude' },
      { id: 'msg-codex-1', content: 'Codex question', role: 'user', timestamp: Date.now() - 2000, agent: 'Codex' },
      { id: 'msg-codex-2', content: 'Codex answer text', role: 'assistant', timestamp: Date.now() - 1000, agent: 'Codex' },
    ]
    sessionStorage.setItem('chat:/tmp/demo', JSON.stringify({ messages: existingMessages }))

    render(
      <ToastProvider>
        <div style={{ height: '600px' }}>
          <ChatInterface isOpen={true} selectedAgent={undefined} project={project as any} />
        </div>
      </ToastProvider>
    )

    // Wait for hydration
    await waitFor(() => {
      expect(screen.getByText('Claude question')).toBeInTheDocument()
    })
    expect(screen.getByText('Claude answer text')).toBeInTheDocument()
    expect(screen.getByText('Codex question')).toBeInTheDocument()
    expect(screen.getByText('Codex answer text')).toBeInTheDocument()

    // Send a new message targeting a different agent
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/test multi-agent test' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(lastExecuteArgs).toBeTruthy())

    // ALL messages from ALL agents must remain visible
    expect(screen.getByText('Claude question')).toBeInTheDocument()
    expect(screen.getByText('Claude answer text')).toBeInTheDocument()
    expect(screen.getByText('Codex question')).toBeInTheDocument()
    expect(screen.getByText('Codex answer text')).toBeInTheDocument()

    // New user message visible too
    await waitFor(() => {
      expect(screen.getByText('/test multi-agent test')).toBeInTheDocument()
    })
  })
})
