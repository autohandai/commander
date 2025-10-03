import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

const mockInvoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}))

const listeners: Record<string, (payload: any) => void> = {}

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (event: string, handler: any) => {
    listeners[event] = handler
    return () => {}
  }),
}))

vi.mock('@/contexts/sidebar-width-context', () => ({
  useSidebarWidth: () => ({ sidebarWidth: 240 }),
}))

vi.mock('@/components/ui/sidebar', () => ({
  useSidebar: () => ({ state: 'expanded' }),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}))

describe('AIAgentStatusBar version info', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    Object.keys(listeners).forEach((key) => delete listeners[key])
  })

  it('shows upgrade prompt with version details when agent is clicked', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'check_ai_agents') {
        return {
          agents: [
            {
              name: 'claude',
              command: 'claude',
              display_name: 'Claude Code CLI',
              available: true,
              enabled: true,
              error_message: null,
              installed_version: '1.0.0',
              latest_version: '1.2.0',
              upgrade_available: true,
            },
          ],
        }
      }
      if (cmd === 'monitor_ai_agents') {
        return {}
      }
      throw new Error(`Unexpected command ${cmd}`)
    })

    const { AIAgentStatusBar } = await import('@/components/AIAgentStatusBar')

    render(<AIAgentStatusBar showChatButton={false} />)

    await screen.findByText('Claude Code CLI')

    fireEvent.click(screen.getByText('Claude Code CLI'))

    await waitFor(() => {
      expect(screen.getByText(/Installed:/i)).toBeInTheDocument()
      expect(screen.getByText(/Latest:/i)).toBeInTheDocument()
      expect(screen.getByText(/New version available/i)).toBeInTheDocument()
      expect(screen.getByText(/npm install -g @anthropic-ai\/claude-code/i)).toBeInTheDocument()
    })
  })
})
