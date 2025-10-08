import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { useState } from 'react'
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
  it('renders user and assistant messages and streaming thinking state', () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>
    )
    expect(screen.getByText('User')).toBeInTheDocument()
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
})
