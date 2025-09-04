import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

// Mock Tauri APIs similarly to other ChatInterface tests
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
          return { claude: true, codex: true, gemini: true, test: true }
        case 'get_active_sessions':
          return { active_sessions: [], total_sessions: 0 }
        case 'load_sub_agents_grouped':
          return {}
        case 'load_prompts':
          return { prompts: {} }
        case 'load_app_settings':
          return { file_mentions_enabled: true, chat_send_shortcut: 'mod+enter' }
        case 'get_git_worktree_preference':
          return true
        case 'get_git_worktrees':
          return []
        case 'save_project_chat':
          return null
        case 'execute_test_command':
          return null
        default:
          return null
      }
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

if (typeof document !== 'undefined') describe('ChatInterface new session via control and shortcut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  const renderChat = () =>
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} onToggle={() => {}} selectedAgent={'Test CLI'} project={project as any} />
        </div>
      </ToastProvider>
    )

  it('clicking new chat icon clears messages', async () => {
    renderChat()

    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '/claude hello world' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(screen.getByText('/claude hello world')).toBeInTheDocument())

    // Click the new chat icon
    const newChatBtn = await screen.findByRole('button', { name: /new chat/i })
    fireEvent.click(newChatBtn)

    // Placeholder should appear again (no messages)
    await waitFor(() => expect(screen.getByText('Start a conversation')).toBeInTheDocument())
  })

  it('Cmd+Shift+N triggers new chat', async () => {
    renderChat()

    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: '/claude another message' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(screen.getByText('/claude another message')).toBeInTheDocument())

    // Fire the global shortcut
    fireEvent.keyDown(window, { key: 'N', metaKey: true, shiftKey: true })

    // Messages should be cleared
    await waitFor(() => expect(screen.getByText('Start a conversation')).toBeInTheDocument())
  })
})

