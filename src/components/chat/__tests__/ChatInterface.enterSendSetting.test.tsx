import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { ChatInterface } from '@/components/ChatInterface'

let lastExecuteArgs: any = null

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
          return { file_mentions_enabled: true, chat_send_shortcut: 'enter' }
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
    }),
  }
})

// Mock file mentions so @ opens
vi.mock('@/hooks/use-file-mention', async (orig) => {
  const actual = await (orig as any)()
  return {
    ...actual,
    useFileMention: () => ({
      files: [
        { name: 'file.ts', relative_path: 'src/file.ts' },
      ],
      listFiles: vi.fn(),
      searchFiles: vi.fn(),
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

if (typeof document !== 'undefined') describe('Enter sends when configured', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastExecuteArgs = null
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('Enter sends even with autocomplete visible when setting=enter', async () => {
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} onToggle={() => {}} selectedAgent={'Test CLI'} project={project as any} />
        </div>
      </ToastProvider>
    )

    const input = screen.getByRole('textbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'See @ and send' } })
    input.setSelectionRange?.(5, 5)
    fireEvent.select(input)
    // Wait for setting to load and hint to reflect Enter sends
    await waitFor(() => expect(screen.getByText(/Enter sends/i)).toBeInTheDocument())
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(lastExecuteArgs).toBeTruthy())
    expect(lastExecuteArgs.message).toContain('See @ and send')
    // Sent successfully under 'enter' shortcut
  })
})
