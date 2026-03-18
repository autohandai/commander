/**
 * Regression test: ErrorBoundary must auto-reset when resetKeys change.
 *
 * Bug: When MessagesList threw a render error, the ErrorBoundary caught it
 * and permanently showed its fallback. Even when new messages arrived (which
 * might fix the error), the boundary never recovered — user had to restart.
 *
 * Fix: ErrorBoundary.resetKeys prop — when any value changes, hasError resets.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useState } from 'react'

// Component that throws on specific prop values
function CrashOnTrigger({ crash, label }: { crash: boolean; label: string }) {
  if (crash) throw new Error('Intentional render crash')
  return <div data-testid="child-content">{label}</div>
}

function TestHarness() {
  const [crash, setCrash] = useState(false)
  const [count, setCount] = useState(0)

  return (
    <div>
      <button onClick={() => setCrash(true)} data-testid="trigger-crash">
        Crash
      </button>
      <button
        onClick={() => {
          setCrash(false)
          setCount((c) => c + 1)
        }}
        data-testid="fix-and-bump"
      >
        Fix
      </button>
      <ErrorBoundary resetKeys={[count]}>
        <CrashOnTrigger crash={crash} label={`Content ${count}`} />
      </ErrorBoundary>
    </div>
  )
}

function TestHarnessWithoutResetKeys() {
  const [crash, setCrash] = useState(false)
  const [count, setCount] = useState(0)

  return (
    <div>
      <button onClick={() => setCrash(true)} data-testid="trigger-crash">
        Crash
      </button>
      <button
        onClick={() => {
          setCrash(false)
          setCount((c) => c + 1)
        }}
        data-testid="fix-and-bump"
      >
        Fix
      </button>
      <ErrorBoundary>
        <CrashOnTrigger crash={crash} label={`Content ${count}`} />
      </ErrorBoundary>
    </div>
  )
}

describe('ErrorBoundary auto-reset via resetKeys', () => {
  it('shows fallback on error, then auto-resets when resetKeys change', () => {
    // Suppress expected console.error from ErrorBoundary
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<TestHarness />)

    // Initially content is visible
    expect(screen.getByTestId('child-content')).toHaveTextContent('Content 0')
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()

    // Trigger a crash
    fireEvent.click(screen.getByTestId('trigger-crash'))

    // Fallback should show
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.queryByTestId('child-content')).not.toBeInTheDocument()

    // Fix the crash condition AND bump the resetKey (count)
    fireEvent.click(screen.getByTestId('fix-and-bump'))

    // ErrorBoundary should auto-reset because resetKeys changed
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(screen.getByTestId('child-content')).toHaveTextContent('Content 1')

    spy.mockRestore()
  })

  it('stays in error state if resetKeys are NOT provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<TestHarnessWithoutResetKeys />)

    expect(screen.getByTestId('child-content')).toHaveTextContent('Content 0')

    // Trigger crash
    fireEvent.click(screen.getByTestId('trigger-crash'))
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    // Fix + bump, but no resetKeys to trigger auto-reset
    fireEvent.click(screen.getByTestId('fix-and-bump'))

    // Should STILL show fallback (no auto-reset without resetKeys)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    // Manual reset via "Try Again" button should work
    fireEvent.click(screen.getByText('Try Again'))
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
    expect(screen.getByTestId('child-content')).toHaveTextContent('Content 1')

    spy.mockRestore()
  })

  it('recovers even when error happens again — keeps trying on each reset', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    function DynamicHarness() {
      const [crash, setCrash] = useState(false)
      const [count, setCount] = useState(0)

      return (
        <div>
          <button
            onClick={() => setCrash(true)}
            data-testid="trigger-crash"
          >
            Crash
          </button>
          <button
            onClick={() => {
              setCrash(false)
              setCount((c) => c + 1)
            }}
            data-testid="fix-and-bump"
          >
            Fix
          </button>
          <ErrorBoundary resetKeys={[count]}>
            <CrashOnTrigger crash={crash} label={`Content ${count}`} />
          </ErrorBoundary>
        </div>
      )
    }

    render(<DynamicHarness />)

    // Crash, then recover
    fireEvent.click(screen.getByTestId('trigger-crash'))
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('fix-and-bump'))
    expect(screen.getByTestId('child-content')).toHaveTextContent('Content 1')

    // Crash again, then recover again
    fireEvent.click(screen.getByTestId('trigger-crash'))
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('fix-and-bump'))
    expect(screen.getByTestId('child-content')).toHaveTextContent('Content 2')

    spy.mockRestore()
  })
})
