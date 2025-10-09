import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { SettingsProvider } from '@/contexts/settings-context'
import { ChatInterface } from '@/components/ChatInterface'

const project = {
  name: 'demo',
  path: '/tmp/demo',
  last_accessed: 0,
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: (...args: Parameters<typeof invokeMock>) => invokeMock(...args),
  }
})

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => () => {}),
}))

const defaultInvokeImpl = async (cmd: string) => {
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
    case 'load_prompts':
      return { prompts: {} }
    case 'load_app_settings':
      return {
        file_mentions_enabled: true,
        chat_send_shortcut: 'mod+enter',
        max_chat_history: 15,
        show_console_output: true,
        projects_folder: '',
        ui_theme: 'auto',
        show_welcome_recent_projects: true,
        code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false },
      }
    default:
      return null
  }
}

if (typeof document !== 'undefined') describe('ChatInterface history limit', () => {
  beforeEach(() => {
    invokeMock.mockImplementation(defaultInvokeImpl)
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('limits visible assistant conversation history to 15 messages and surfaces compaction control', async () => {
    render(
      <SettingsProvider>
        <ToastProvider>
          <ChatInterface
            isOpen
            onToggle={() => {}}
            selectedAgent={'Claude Code CLI'}
            project={project as any}
          />
        </ToastProvider>
      </SettingsProvider>
    )

    const input = screen.getByRole('textbox')

    for (let i = 1; i <= 16; i++) {
      const text = `/claude test message ${i}`
      fireEvent.change(input, { target: { value: text } })
      fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
      await waitFor(() => {
        expect(screen.queryByText(text)).toBeInTheDocument()
      })
    }

    await waitFor(() => {
      const renderedMessages = screen.getAllByTestId('chat-message')
      expect(renderedMessages.length).toBeLessThanOrEqual(15)
    })

    expect(screen.getByRole('button', { name: /Compact conversation/i })).toBeInTheDocument()
  })

  it('shows conversation identifier for each assistant response', async () => {
    render(
      <SettingsProvider>
        <ToastProvider>
          <ChatInterface
            isOpen
            onToggle={() => {}}
            selectedAgent={'Claude Code CLI'}
            project={project as any}
          />
        </ToastProvider>
      </SettingsProvider>
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/claude hello world' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByText('/claude hello world')).toBeInTheDocument()
    })

    const conversationTags = screen.getAllByTestId('conversation-id')
    expect(conversationTags.length).toBeGreaterThan(0)
    conversationTags.forEach((node) => {
      expect(node.textContent).toMatch(/Conversation ID:/i)
    })
  })
})
