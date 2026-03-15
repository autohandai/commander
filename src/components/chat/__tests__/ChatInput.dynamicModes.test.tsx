import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatControlsBar } from '@/components/chat/ChatControlsBar'
import { AGENT_EXECUTION_MODES } from '@/components/chat/agents'
import React from 'react'

function renderControlsBar(overrides: Partial<React.ComponentProps<typeof ChatControlsBar>> = {}) {
  const defaults: React.ComponentProps<typeof ChatControlsBar> = {
    planModeEnabled: false,
    onPlanModeChange: vi.fn(),
    workspaceEnabled: false,
    onWorkspaceEnabledChange: vi.fn(),
  }
  return render(<ChatControlsBar {...defaults} {...overrides} />)
}

describe('ChatControlsBar dynamic execution modes', () => {
  it('hides the dropdown when executionModeOptions is empty/undefined', () => {
    renderControlsBar({ executionModeOptions: undefined })
    expect(screen.queryByLabelText('Execution Mode')).toBeNull()
  })

  it('hides the dropdown when executionModeOptions is empty array', () => {
    renderControlsBar({ executionModeOptions: [] })
    expect(screen.queryByLabelText('Execution Mode')).toBeNull()
  })

  it('shows the dropdown when executionModeOptions are provided', () => {
    renderControlsBar({
      executionModeOptions: AGENT_EXECUTION_MODES.codex.modes,
      executionMode: 'collab',
    })
    expect(screen.getByRole('button', { name: /execution mode/i })).toBeTruthy()
  })

  it('shows the Advanced checkbox only when showDangerousToggle is true', () => {
    const { rerender } = render(
      <ChatControlsBar
        executionModeOptions={AGENT_EXECUTION_MODES.codex.modes}
        executionMode="collab"
        showDangerousToggle={true}
        planModeEnabled={false}
        onPlanModeChange={vi.fn()}
        workspaceEnabled={false}
        onWorkspaceEnabledChange={vi.fn()}
      />
    )
    expect(screen.getByText('Advanced')).toBeTruthy()

    // Re-render without dangerous toggle (e.g. switching to Claude)
    rerender(
      <ChatControlsBar
        executionModeOptions={AGENT_EXECUTION_MODES.claude.modes}
        executionMode="acceptEdits"
        showDangerousToggle={false}
        planModeEnabled={false}
        onPlanModeChange={vi.fn()}
        workspaceEnabled={false}
        onWorkspaceEnabledChange={vi.fn()}
      />
    )
    expect(screen.queryByText('Advanced')).toBeNull()
  })

  it('updates the dropdown options when the target agent mode list changes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <ChatControlsBar
        executionModeOptions={AGENT_EXECUTION_MODES.codex.modes}
        executionMode="collab"
        planModeEnabled={false}
        onPlanModeChange={vi.fn()}
        workspaceEnabled={false}
        onWorkspaceEnabledChange={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /execution mode/i }))
    await waitFor(() => {
      expect(screen.getByRole('menuitemradio', { name: 'Agent (full access)' })).toBeTruthy()
    })
    await user.keyboard('{Escape}')

    rerender(
      <ChatControlsBar
        executionModeOptions={AGENT_EXECUTION_MODES.autohand.modes}
        executionMode="unrestricted"
        planModeEnabled={false}
        onPlanModeChange={vi.fn()}
        workspaceEnabled={false}
        onWorkspaceEnabledChange={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: /execution mode/i }))
    await waitFor(() => {
      expect(screen.getByRole('menuitemradio', { name: 'Unrestricted' })).toBeTruthy()
    })
    expect(screen.queryByRole('menuitemradio', { name: 'Agent (full access)' })).toBeNull()
  })
})
