import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SettingsProvider } from '@/contexts/settings-context'
import { ToastProvider } from '@/components/ToastProvider'
import { SettingsModal } from '@/components/SettingsModal'

const invokeMock = vi.fn(async (cmd: string, args?: any) => {
  switch (cmd) {
    case 'load_app_settings':
      return {
        show_console_output: true,
        projects_folder: '',
        file_mentions_enabled: true,
        ui_theme: 'auto',
        chat_send_shortcut: 'mod+enter',
        show_welcome_recent_projects: true,
        max_chat_history: 15,
        default_cli_agent: 'claude',
        code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false },
      }
    case 'set_window_theme':
      return null
    case 'get_default_projects_folder':
      return '/tmp'
    case 'load_agent_settings':
      return { autohand: true, claude: true, codex: true, gemini: true, ollama: true }
    case 'load_all_agent_settings':
      return {
        max_concurrent_sessions: 10,
        autohand: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false },
        claude: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false },
        codex: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false },
        gemini: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false },
        ollama: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false },
        custom_agents: [],
      }
    case 'get_user_home_directory':
      return '/tmp'
    case 'get_autohand_config':
      return {
        protocol: 'rpc',
        provider: 'anthropic',
        permissions_mode: 'interactive',
        hooks: [],
      }
    case 'detect_cli_agents':
      return []
    case 'save_all_agent_settings':
    case 'save_autohand_config':
    case 'save_app_settings':
      return null
    default:
      return null
  }
})

vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: any[]) => invokeMock(...args) }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))
vi.mock('@/components/settings/HooksPanel', () => ({
  HooksPanel: () => <div data-testid="hooks-panel" />,
}))
vi.mock('@/components/settings/McpServersPanel', () => ({
  McpServersPanel: () => <div data-testid="mcp-panel" />,
}))

function renderModal(initialTab: 'general' | 'agents' = 'general') {
  return render(
    <ToastProvider>
      <SettingsProvider>
        <SettingsModal isOpen={true} onClose={() => {}} initialTab={initialTab} />
      </SettingsProvider>
    </ToastProvider>
  )
}

if (typeof document !== 'undefined') describe('SettingsModal agent registry tabs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders maximum concurrent sessions in General and not as a separate Autohand nav destination', async () => {
    renderModal('general')

    expect(await screen.findByText(/General Settings/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Maximum Concurrent Sessions/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Autohand$/i })).not.toBeInTheDocument()
  })

  it('renders built-in agent tabs and persists a custom JSON-RPC agent', async () => {
    renderModal('agents')

    expect(await screen.findByRole('tab', { name: /Autohand/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Claude/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Codex/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Gemini/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Ollama/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Global Session Settings/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add Agent/i }))

    fireEvent.change(await screen.findByLabelText(/Agent Name/i), {
      target: { value: 'Dev RPC' },
    })
    fireEvent.change(screen.getByLabelText(/Agent ID/i), {
      target: { value: 'dev-rpc' },
    })
    fireEvent.change(screen.getByLabelText(/Command/i), {
      target: { value: 'dev-rpc-cli' },
    })

    fireEvent.click(screen.getByRole('combobox', { name: /Transport/i }))
    fireEvent.click(await screen.findByRole('option', { name: /JSON-RPC/i }))

    fireEvent.click(screen.getByRole('button', { name: /Create Agent/i }))

    expect(await screen.findByRole('tab', { name: /Dev RPC/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }))

    await waitFor(() => {
      const saveCall = invokeMock.mock.calls.find(([cmd]) => cmd === 'save_all_agent_settings')
      expect(saveCall).toBeTruthy()

      const payload = saveCall?.[1]?.settings
      expect(payload.custom_agents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'dev-rpc',
            name: 'Dev RPC',
            command: 'dev-rpc-cli',
            transport: 'json-rpc',
          }),
        ])
      )
    })
  })

  it('auto-loads Claude models on tab activation without rendering a fetch button', async () => {
    renderModal('agents')

    fireEvent.click(await screen.findByRole('tab', { name: /Claude/i }))

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('fetch_agent_models', { agent: 'claude' })
    })

    expect(screen.queryByRole('button', { name: /Fetch Models/i })).not.toBeInTheDocument()
  })
})
