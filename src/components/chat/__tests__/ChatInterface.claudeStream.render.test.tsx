import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
          max_concurrent_sessions: 10,
        }
      case 'load_agent_settings':
        return { claude: true, codex: true, gemini: true }
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
      case 'execute_claude_command':
        lastExecuteArgs = args
        return null
      default:
        return null
    }
  })
}))

const project = {
  name: 'demo',
  path: '/tmp/demo',
  last_accessed: 0,
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
}

const SAMPLE = `{"type":"system","subtype":"init","cwd":"/tmp","session_id":"s1","tools":["Bash"],"mcp_servers":[],"model":"claude-opus-4-1-20250805","permissionMode":"default","slash_commands":[],"apiKeySource":"none","output_style":"default","uuid":"u1"}{"type":"assistant","message":{"id":"m1","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[{"type":"text","text":"Considering structured output"}]},"session_id":"s1","uuid":"a1"}{"type":"assistant","message":{"id":"m1","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[{"type":"text","text":"Designing a parser for structured markers"}]},"session_id":"s1","uuid":"a2"}{"type":"assistant","message":{"id":"m1","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[{"type":"text","text":"Planning tests for parser and components"}]},"session_id":"s1","uuid":"a3"}{"type":"result","subtype":"success","is_error":false,"duration_ms":100,"result":"Done.","session_id":"s1","uuid":"r1"}`

const SYSTEM_SPLIT_HEAD = `{"type":"system","subtype":"init","cwd":"/tmp","session_id":"sSplit","tools":["`
const SYSTEM_SPLIT_TAIL = `__supabase__rebase_branch","ListMcpResourcesTool"],"mcp_servers":[],"model":"claude-opus-4-1-20250805","permissionMode":"default","slash_commands":[],"apiKeySource":"none","output_style":"default","uuid":"split-uuid"}`
const SAMPLE_V2_BODY = `{"type":"message_start","message":{"id":"msgSplit","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[]}}{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Analyzing connected MCP servers."}}{"type":"content_block_stop","index":0}{"type":"message_stop"}{"type":"result","subtype":"success","is_error":false,"duration_ms":42,"result":"Finished.","session_id":"sSplit","uuid":"resSplit"}`

if (typeof document !== 'undefined') describe('ChatInterface Claude stream-json rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn()
    streamCb = null
    lastExecuteArgs = null
  })

  it('renders structured steps from Claude stream-json output', async () => {
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} onToggle={() => {}} selectedAgent={'Claude Code CLI'} project={project as any} />
        </div>
      </ToastProvider>
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/claude do work' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(lastExecuteArgs).toBeTruthy())
    const sid = lastExecuteArgs.sessionId as string

    const mid = Math.floor(SAMPLE.length / 2)
    const part1 = SAMPLE.slice(0, mid)
    const part2 = SAMPLE.slice(mid)
    streamCb?.({ payload: { session_id: sid, content: part1, finished: false } })
    streamCb?.({ payload: { session_id: sid, content: part2, finished: true } })

    await waitFor(() => expect(screen.getByText(/Working/i)).toBeInTheDocument())
  })

  it('filters out raw JSON fragments when Claude chunks split strings', async () => {
    render(
      <ToastProvider>
        <div className="h-screen">
          <ChatInterface isOpen={true} onToggle={() => {}} selectedAgent={'Claude Code CLI'} project={project as any} />
        </div>
      </ToastProvider>
    )

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '/claude inspect tools' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(lastExecuteArgs).toBeTruthy())
    const sid = lastExecuteArgs.sessionId as string

    streamCb?.({ payload: { session_id: sid, content: SYSTEM_SPLIT_HEAD, finished: false } })
    streamCb?.({ payload: { session_id: sid, content: SYSTEM_SPLIT_TAIL, finished: false } })
    streamCb?.({ payload: { session_id: sid, content: SAMPLE_V2_BODY, finished: true } })

    await waitFor(() => expect(screen.queryByText(/__supabase__rebase_branch/)).toBeNull())
  })
})
