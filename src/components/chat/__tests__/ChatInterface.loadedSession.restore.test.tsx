import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: Parameters<typeof invokeMock>) => invokeMock(...args),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}))

const project = {
  name: 'demo',
  path: '/tmp/demo',
  last_accessed: 0,
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

const defaultInvoke = async (cmd: string, args?: any) => {
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
    case 'load_app_settings':
      return { file_mentions_enabled: true, chat_send_shortcut: 'mod+enter' }
    case 'load_project_chat':
      return []
    case 'save_project_chat':
      return null
    case 'execute_claude_command':
      return args?.sessionId ?? null
    default:
      return null
  }
}

if (typeof document !== 'undefined') describe('ChatInterface loaded session restore behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invokeMock.mockImplementation(defaultInvoke)
    sessionStorage.clear()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('continues the loaded chat session on the next typed message', async () => {
    const loadedSession = {
      sessionId: 'loaded-chat-1',
      messages: [
        {
          id: 'loaded-user-1',
          role: 'user',
          content: 'Previously opened question',
          timestamp: 1709600000,
          agent: 'claude',
          conversationId: 'loaded-chat-1',
          metadata: { session_id: 'native-claude-session-1' },
        },
        {
          id: 'loaded-assistant-1',
          role: 'assistant',
          content: 'Previously opened answer',
          timestamp: 1709600060,
          agent: 'claude',
          conversationId: 'loaded-chat-1',
          metadata: { session_id: 'native-claude-session-1' },
        },
      ],
    }

    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen selectedAgent="Claude Code CLI" project={project as any} loadedSession={loadedSession as any} />
        </div>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Previously opened question')).toBeInTheDocument()
    })

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'continue this session' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        'execute_claude_command',
        expect.objectContaining({
          message: 'continue this session',
          resumeSessionId: 'native-claude-session-1',
        })
      )
    })

    expect(screen.getByText('Previously opened answer')).toBeInTheDocument()
    expect(screen.getByText('continue this session')).toBeInTheDocument()
  })

  it('renders restored working steps and tool calls from loaded session messages', async () => {
    const loadedSession = {
      sessionId: 'loaded-chat-structured',
      messages: [
        {
          id: 'loaded-assistant-structured',
          role: 'assistant',
          content: 'Final restored answer',
          timestamp: 1709600060,
          agent: 'autohand',
          conversationId: 'loaded-chat-structured',
          steps: [
            {
              id: 'step-1',
              label: 'Read src/App.tsx',
              status: 'completed',
            },
          ],
          toolEvents: [
            {
              tool_id: 'tool-1',
              tool_name: 'read_file',
              phase: 'end',
              args: { path: 'src/App.tsx' },
              output: 'file contents',
              success: true,
            },
          ],
        },
      ],
    }

    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen selectedAgent="Autohand Code" project={project as any} loadedSession={loadedSession as any} />
        </div>
      </ToastProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('Final restored answer')).toBeInTheDocument()
    })
    expect(screen.getByText('Working steps (1)')).toBeInTheDocument()
    expect(screen.getByText('read_file')).toBeInTheDocument()
  })
})
