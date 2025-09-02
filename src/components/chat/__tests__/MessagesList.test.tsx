import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { MessagesList } from '@/components/chat/MessagesList'

function Harness() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const messages = [
    { id: 'u1', role: 'user', content: 'Hello world', timestamp: Date.now(), agent: 'Claude Code CLI' },
    { id: 'a1', role: 'assistant', content: '', timestamp: Date.now(), agent: 'Claude Code CLI', isStreaming: true },
    { id: 'a2', role: 'assistant', content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(5), timestamp: Date.now(), agent: 'Claude Code CLI' },
  ] as any
  const isLong = (t?: string) => !!t && t.length > 60
  const truncate = (t: string, n = 100) => (t.length <= n ? t : t.slice(0, n).trimEnd() + '…')
  const getModel = () => 'test-model'
  return (
    <MessagesList
      messages={messages}
      expandedMessages={expanded}
      onToggleExpand={(id) => setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })}
      isLongMessage={isLong}
      truncateMessage={truncate}
      getAgentModel={getModel}
    />
  )
}

describe('MessagesList', () => {
  it('renders user and assistant messages, streaming thinking state, and model label', () => {
    render(<Harness />)
    expect(screen.getByText('You')).toBeInTheDocument()
    expect(screen.getAllByText(/using\s*test-model/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Thinking.../i)).toBeInTheDocument()
  })

  it('supports show more toggle for long messages', () => {
    render(<Harness />)
    const btn = screen.getByRole('button', { name: /show more/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument()
  })
})
