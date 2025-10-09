import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

let lastCommand: string | null = null
let lastArgs: any = null
let worktreesList: Array<{ path: string }> = []
let currentDefaultAgent = 'claude'

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
        case 'get_git_worktree_preference':
          return true
        case 'get_git_worktrees':
          return worktreesList
        case 'save_project_chat':
          return null
        case 'execute_claude_command':
        case 'execute_codex_command':
        case 'execute_gemini_command':
        case 'execute_test_command':
          lastCommand = cmd
          lastArgs = args
          return null
        default:
          return null
      }
    })
  }
})

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: {
      show_console_output: true,
      projects_folder: '',
      file_mentions_enabled: true,
      chat_send_shortcut: 'mod+enter',
      show_welcome_recent_projects: true,
      max_chat_history: 15,
      code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false },
      default_cli_agent: currentDefaultAgent,
    },
    updateSettings: vi.fn(),
    refreshSettings: vi.fn(),
    isLoading: false,
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

if (typeof document !== 'undefined') describe('ChatInterface default agent setting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastCommand = null
    lastArgs = null
    worktreesList = []
    currentDefaultAgent = 'claude'
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('routes implicit messages through the configured default agent', async () => {
    currentDefaultAgent = 'codex'

    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} onToggle={() => {}} project={project as any} />
        </div>
      </ToastProvider>
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'list files' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(lastCommand).toBe('execute_codex_command'))
    expect(lastArgs?.message).toBe('list files')
  })
})
