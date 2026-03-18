import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: Parameters<typeof invokeMock>) => invokeMock(...args),
}))

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
        // Use default max_chat_history (should be 50 after fix)
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

if (typeof document !== 'undefined') describe('ChatInterface multi-agent message retention', () => {
  beforeEach(() => {
    invokeMock.mockImplementation(defaultInvokeImpl)
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('retains messages from earlier agents after switching to a different agent', async () => {
    // Regression: with the old default limit of 15 messages, multi-agent
    // conversations would silently lose older agent messages when the clamp
    // trimmed the array.  After increasing the default to 50, conversations
    // with 20+ messages should retain all entries.
    render(
      <SettingsProvider>
        <ToastProvider>
          <ChatInterface
            isOpen
            selectedAgent="Claude Code CLI"
            project={project as any}
          />
        </ToastProvider>
      </SettingsProvider>
    )

    const input = screen.getByRole('textbox')

    // Send 10 messages as Claude (each creates a user message)
    for (let i = 1; i <= 10; i++) {
      const text = `/claude claude-msg-${i}`
      fireEvent.change(input, { target: { value: text } })
      fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
      await waitFor(() => {
        expect(screen.queryByText(text)).toBeInTheDocument()
      })
    }

    // Send 10 messages as Codex (each creates a user message)
    for (let i = 1; i <= 10; i++) {
      const text = `/codex codex-msg-${i}`
      fireEvent.change(input, { target: { value: text } })
      fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
      await waitFor(() => {
        expect(screen.queryByText(text)).toBeInTheDocument()
      })
    }

    // After 20 user messages (+ 20 assistant stubs = 40 total),
    // verify early Claude messages still exist in the DOM.
    // With the old default of 15, these would have been trimmed.
    await waitFor(() => {
      const allMessages = screen.getAllByTestId('chat-message')
      // 20 user + 20 assistant = 40 messages (or fewer if streaming collapsed)
      // The point is: early claude messages must still be present
      expect(allMessages.length).toBeGreaterThanOrEqual(20)
    })

    // Specifically: the FIRST claude message must still be in the DOM
    expect(screen.queryByText('/claude claude-msg-1')).toBeInTheDocument()
    // And the first codex message too
    expect(screen.queryByText('/codex codex-msg-1')).toBeInTheDocument()
  })
})
