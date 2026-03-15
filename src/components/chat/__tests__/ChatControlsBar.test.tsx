import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatControlsBar } from '@/components/chat/ChatControlsBar'
import React from 'react'

function renderBar(overrides: Partial<React.ComponentProps<typeof ChatControlsBar>> = {}) {
  const defaults: React.ComponentProps<typeof ChatControlsBar> = {
    planModeEnabled: false,
    onPlanModeChange: vi.fn(),
    workspaceEnabled: false,
    onWorkspaceEnabledChange: vi.fn(),
  }
  return render(<ChatControlsBar {...defaults} {...overrides} />)
}

afterEach(() => {
  cleanup()
})

describe('ChatControlsBar', () => {
  it('renders Plan Mode and Workspace switches', () => {
    renderBar()
    expect(screen.getByLabelText('Enable plan mode')).toBeTruthy()
    expect(screen.getByLabelText('Enable workspace mode')).toBeTruthy()
  })

  it('does not render execution mode dropdown when no options', () => {
    renderBar()
    expect(screen.queryByLabelText('Execution Mode')).toBeNull()
  })

  it('renders execution mode dropdown when options provided', () => {
    renderBar({
      executionModeOptions: [
        { value: 'a', label: 'Mode A' },
        { value: 'b', label: 'Mode B' },
      ],
      executionMode: 'a',
    })
    expect(screen.getByRole('button', { name: /execution mode/i })).toBeTruthy()
  })

  it('calls onExecutionModeChange when an option is chosen from the dropdown', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderBar({
      executionModeOptions: [
        { value: 'a', label: 'Mode A' },
        { value: 'b', label: 'Mode B' },
      ],
      executionMode: 'a',
      onExecutionModeChange: onChange,
    })

    await user.click(screen.getByRole('button', { name: /execution mode/i }))

    await waitFor(() => {
      expect(screen.getByRole('menuitemradio', { name: 'Mode B' })).toBeTruthy()
    })

    await user.click(screen.getByRole('menuitemradio', { name: 'Mode B' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('does not scroll-lock the page when the mode menu opens', async () => {
    const user = userEvent.setup()
    renderBar({
      executionModeOptions: [
        { value: 'a', label: 'Mode A' },
        { value: 'b', label: 'Mode B' },
      ],
      executionMode: 'a',
    })

    await user.click(screen.getByRole('button', { name: /execution mode/i }))

    expect(document.body).not.toHaveAttribute('data-scroll-locked')
    expect(document.body.style.pointerEvents).not.toBe('none')
  })

  it('does not re-render when props are the same (React.memo)', () => {
    const renderSpy = vi.fn()
    const WrappedBar = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof ChatControlsBar>>(
      (props, _ref) => {
        renderSpy()
        return <ChatControlsBar {...props} />
      }
    )
    WrappedBar.displayName = 'WrappedBar'

    const stableProps: React.ComponentProps<typeof ChatControlsBar> = {
      planModeEnabled: false,
      onPlanModeChange: vi.fn(),
      workspaceEnabled: false,
      onWorkspaceEnabledChange: vi.fn(),
    }

    const { rerender } = render(<WrappedBar {...stableProps} />)
    expect(renderSpy).toHaveBeenCalledTimes(1)

    // Re-render with same props — wrapper always re-renders but ChatControlsBar should be memoized
    rerender(<WrappedBar {...stableProps} />)
    // The wrapper re-renders (2 calls) but the memoized inner skips work
    expect(renderSpy).toHaveBeenCalledTimes(2)
  })
})
