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
        case 'get_git_worktree_preference':
          return true
        case 'get_git_worktrees':
          return []
        case 'save_project_chat':
          return null
        case 'generate_plan': {
          const plan = {
            title: 'Add Dark Mode',
            description: 'Implement theme toggle and styling',
            steps: [
              { id: 'step-1', title: 'Add toggle', description: 'Add UI switch', estimatedTime: '5m' },
              { id: 'step-2', title: 'Wire styles', description: 'Use CSS vars', estimatedTime: '10m' },
            ],
          }
          return JSON.stringify(plan)
        }
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

if (typeof document !== 'undefined') describe('ChatInterface Plan Mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastExecuteArgs = null
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('generates a plan and shows PlanBreakdown', async () => {
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} onToggle={() => {}} selectedAgent={'Test CLI'} project={project as any} />
        </div>
      </ToastProvider>
    )

    // Enable plan mode
    const switchEl = screen.getByRole('switch', { name: /enable plan mode/i })
    fireEvent.click(switchEl)

    // Submit a prompt
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Please add dark mode' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Expect generated plan to render with title
    await waitFor(() => expect(screen.getByText('Add Dark Mode')).toBeInTheDocument())
    expect(screen.getByText(/Implement theme toggle/)).toBeInTheDocument()
    expect(screen.getByText(/1\. Add toggle/)).toBeInTheDocument()
    expect(screen.getByText(/2\. Wire styles/)).toBeInTheDocument()
  })

  it('executes the generated plan with selected agent', async () => {
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} onToggle={() => {}} selectedAgent={'Test CLI'} project={project as any} />
        </div>
      </ToastProvider>
    )

    const switchEl = screen.getByRole('switch', { name: /enable plan mode/i })
    fireEvent.click(switchEl)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Please add dark mode' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('Add Dark Mode')).toBeInTheDocument())

    // Click Execute Plan
    const execBtns = screen.getAllByRole('button', { name: /Execute Plan/i })
    fireEvent.click(execBtns[0])

    await waitFor(() => expect(lastExecuteArgs).toBeTruthy())
    expect(lastExecuteArgs.sessionId).toBeTruthy()
    expect(lastExecuteArgs.workingDir).toBe('/tmp/demo')
    expect(String(lastExecuteArgs.message)).toMatch(/Execute this plan step by step/i)
  })
})
