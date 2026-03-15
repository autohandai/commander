import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { useCallback, useState } from 'react'

const unifiedRenderCounts = new Map<string, number>()

vi.mock('@/components/chat/unified/UnifiedContent', () => ({
  UnifiedContent: ({ content }: any) => {
    const answer = content?.answer ?? ''
    unifiedRenderCounts.set(answer, (unifiedRenderCounts.get(answer) ?? 0) + 1)
    return <div data-testid={`unified-${answer.startsWith('HEAVY') ? 'heavy' : 'light'}`}>{answer}</div>
  },
}))

import { MessagesList } from '@/components/chat/MessagesList'

function Harness() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const messages = [
    { id: 'u1', role: 'user', content: 'Hello world', timestamp: Date.now(), agent: 'Claude Code CLI', conversationId: 'conv-1' },
    { id: 'a1', role: 'assistant', content: '', timestamp: Date.now(), agent: 'Claude Code CLI', isStreaming: true, conversationId: 'conv-2' },
    { id: 'a2', role: 'assistant', content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5), timestamp: Date.now(), agent: 'Claude Code CLI', conversationId: 'conv-3' },
  ] as any
  const isLong = (t?: string) => !!t && t.length > 60
  return (
    <MessagesList
      messages={messages}
      expandedMessages={expanded}
      onToggleExpand={(id) => setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })}
      isLongMessage={isLong}
    />
  )
}

describe('MessagesList', () => {
  beforeEach(() => {
    unifiedRenderCounts.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders user and assistant messages and streaming thinking state', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>
    )
    expect(screen.getByText('Hello world')).toBeInTheDocument()
    expect(screen.getByText(/Thinking/i)).toBeInTheDocument()
  })

  it('uses compact mode (no Show more button)', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>
    )
    expect(screen.getAllByTestId('message-compact').length).toBeGreaterThan(0)
  })

  it('does not rerender unchanged heavy message content when a sibling streaming row updates', () => {
    function StreamingHarness() {
      const heavyContent = `HEAVY ${'<form><input /><textarea></textarea></form>'.repeat(200)}`
      const [messages, setMessages] = useState([
        {
          id: 'heavy',
          role: 'assistant',
          content: heavyContent,
          timestamp: 1,
          agent: 'Autohand',
          conversationId: 'conv-heavy',
          isStreaming: false,
        },
        {
          id: 'stream',
          role: 'assistant',
          content: 'light',
          timestamp: 2,
          agent: 'Autohand',
          conversationId: 'conv-stream',
          isStreaming: true,
          status: 'thinking' as const,
        },
      ] as any)
      const handleToggleExpand = useCallback(() => {}, [])

      return (
        <div>
          <button
            type="button"
            onClick={() =>
              setMessages((prev) =>
                prev.map((message: any) =>
                  message.id === 'stream'
                    ? { ...message, content: 'light update', status: 'running' }
                    : message
                )
              )
            }
          >
            Update stream
          </button>
          <MessagesList
            messages={messages}
            expandedMessages={new Set()}
            onToggleExpand={handleToggleExpand}
            isLongMessage={(text) => Boolean(text && text.length > 120)}
          />
        </div>
      )
    }

    render(
      <ToastProvider>
        <StreamingHarness />
      </ToastProvider>
    )

    const heavyInitial = unifiedRenderCounts.get(
      `HEAVY ${'<form><input /><textarea></textarea></form>'.repeat(200)}`
    )
    expect(heavyInitial ?? 0).toBe(0)
    expect(screen.getAllByTestId('message-rich-fallback').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Update stream' }))

    expect(unifiedRenderCounts.get(
      `HEAVY ${'<form><input /><textarea></textarea></form>'.repeat(200)}`
    ) ?? 0).toBe(0)
    expect(unifiedRenderCounts.get('light update')).toBe(1)
  })

  it('defers rich rendering for heavy assistant content until after the initial paint', () => {
    const heavyContent = `HEAVY ${'<form><input /><textarea></textarea></form>'.repeat(220)}`

    render(
      <ToastProvider>
        <MessagesList
          messages={[
            {
              id: 'heavy-deferred',
              role: 'assistant',
              content: heavyContent,
              timestamp: Date.now(),
              agent: 'Autohand',
              conversationId: 'conv-heavy-deferred',
            } as any,
          ]}
          expandedMessages={new Set()}
          onToggleExpand={() => {}}
          isLongMessage={(text) => Boolean(text && text.length > 120)}
        />
      </ToastProvider>
    )

    expect(screen.getByTestId('message-rich-fallback')).toBeInTheDocument()
    expect(unifiedRenderCounts.get(heavyContent) ?? 0).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: /render formatted content/i }))

    expect(unifiedRenderCounts.get(heavyContent)).toBe(1)
  })

  it('upgrades deferred heavy assistant content automatically after the idle timeout', () => {
    const heavyContent = `HEAVY ${'<form><input /><textarea></textarea></form>'.repeat(220)}`

    render(
      <ToastProvider>
        <MessagesList
          messages={[
            {
              id: 'heavy-idle',
              role: 'assistant',
              content: heavyContent,
              timestamp: Date.now(),
              agent: 'Autohand',
              conversationId: 'conv-heavy-idle',
            } as any,
          ]}
          expandedMessages={new Set()}
          onToggleExpand={() => {}}
          isLongMessage={(text) => Boolean(text && text.length > 120)}
        />
      </ToastProvider>
    )

    expect(screen.getByTestId('message-rich-fallback')).toBeInTheDocument()
    expect(unifiedRenderCounts.get(heavyContent) ?? 0).toBe(0)

    act(() => {
      vi.advanceTimersByTime(80)
    })

    expect(unifiedRenderCounts.get(heavyContent)).toBe(1)
  })

  it('renders small assistant content immediately without the deferred fallback', () => {
    render(
      <ToastProvider>
        <MessagesList
          messages={[
            {
              id: 'small',
              role: 'assistant',
              content: 'Small assistant response',
              timestamp: Date.now(),
              agent: 'Autohand',
              conversationId: 'conv-small',
            } as any,
          ]}
          expandedMessages={new Set()}
          onToggleExpand={() => {}}
          isLongMessage={(text) => Boolean(text && text.length > 120)}
        />
      </ToastProvider>
    )

    expect(screen.queryByTestId('message-rich-fallback')).not.toBeInTheDocument()
    expect(unifiedRenderCounts.get('Small assistant response')).toBe(1)
  })
})
