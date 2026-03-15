import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { AutohandSettingsTab } from '@/components/settings/AutohandSettingsTab'

const invokeMock = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

vi.mock('@/components/settings/HooksPanel', () => ({
  HooksPanel: () => <div data-testid="hooks-panel" />,
}))

vi.mock('@/components/settings/McpServersPanel', () => ({
  McpServersPanel: () => <div data-testid="mcp-panel" />,
}))

describe('AutohandSettingsTab global fallback', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === 'get_user_home_directory') return '/home/test'
      if (cmd === 'get_autohand_config') {
        expect(args).toEqual({ workingDir: '/home/test' })
        return {
          protocol: 'rpc',
          provider: 'openrouter',
          model: 'gpt-4.1',
          permissions_mode: 'interactive',
          hooks: [],
          provider_details: {
            api_key: 'sk-test',
            model: 'gpt-4.1',
            base_url: 'https://openrouter.ai/api/v1',
          },
          permissions: {
            mode: 'interactive',
            whitelist: [],
            blacklist: [],
            rules: [],
            remember_session: false,
          },
          agent: {
            max_iterations: 10,
            enable_request_queue: false,
          },
          network: {
            timeout: 30000,
            max_retries: 3,
            retry_delay: 1000,
          },
        }
      }
      if (cmd === 'save_autohand_config') return null
      return null
    })
  })

  it('loads config from home directory when no project is open', async () => {
    render(<AutohandSettingsTab workingDir={null} />)

    await screen.findByText('Protocol & Model')

    expect(invokeMock).toHaveBeenCalledWith('get_user_home_directory')
    expect(invokeMock).toHaveBeenCalledWith('get_autohand_config', { workingDir: '/home/test' })
  })

  it('blocks invalid updates and shows validation error', async () => {
    render(<AutohandSettingsTab workingDir={null} />)

    await screen.findByText('Protocol & Model')

    fireEvent.click(screen.getByText('Agent Behavior'))
    const maxIterationsInput = await screen.findByRole('spinbutton')
    fireEvent.change(maxIterationsInput, { target: { value: '-5' } })

    await waitFor(() => {
      expect(
        screen.getByText(/invalid autohand configuration/i)
      ).toBeInTheDocument()
    })

    const saveCalls = invokeMock.mock.calls.filter(([cmd]) => cmd === 'save_autohand_config')
    expect(saveCalls.length).toBe(0)
  })
})
