/**
 * Regression test: normalizer crash must not kill the entire message list.
 *
 * Bug: If a normalizer threw during message rendering, the ErrorBoundary
 * caught the error and hid ALL messages — not just the broken one.
 *
 * Fix: Normalizer calls are wrapped in try-catch inside MessageRowInner,
 * falling back to raw content display instead of propagating the crash.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessagesList, ChatMessageLike } from '@/components/chat/MessagesList'
import { ToastProvider } from '@/components/ToastProvider'

// Mock getNormalizer to make one agent's normalizer throw
const mockThrowingNormalizer = vi.fn(() => {
  throw new Error('Normalizer crash')
})
const mockWorkingNormalizer = vi.fn((content: string) => ({
  reasoning: [],
  workingSteps: [],
  answer: content,
  meta: null,
  toolEvents: [],
  isStreaming: false,
}))

vi.mock('@/components/chat/unified/normalizers', () => ({
  getNormalizer: (agentId: string) => {
    if (agentId === 'crash-agent') return mockThrowingNormalizer
    return mockWorkingNormalizer
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('MessagesList normalizer fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('renders raw content when normalizer throws instead of crashing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const messages: ChatMessageLike[] = [
      {
        id: 'msg-1',
        content: 'Normal user message',
        role: 'user',
        timestamp: Date.now() - 3000,
        agent: 'Claude',
      },
      {
        id: 'msg-2',
        content: 'This content should still display',
        role: 'assistant',
        timestamp: Date.now() - 2000,
        agent: 'crash-agent',
        isStreaming: false,
      },
      {
        id: 'msg-3',
        content: 'Another normal message',
        role: 'user',
        timestamp: Date.now() - 1000,
        agent: 'Claude',
      },
    ]

    render(
      <ToastProvider>
        <MessagesList
          messages={messages}
          expandedMessages={new Set()}
          onToggleExpand={() => {}}
          isLongMessage={() => false}
        />
      </ToastProvider>
    )

    // User messages should render fine
    expect(screen.getByText('Normal user message')).toBeInTheDocument()
    expect(screen.getByText('Another normal message')).toBeInTheDocument()

    // The crash-agent message should fall back to raw content display
    // instead of crashing the entire list
    expect(screen.getByText('This content should still display')).toBeInTheDocument()

    // The normalizer should have been called and thrown
    expect(mockThrowingNormalizer).toHaveBeenCalled()

    // Console.error should have been called with the normalizer error
    expect(spy).toHaveBeenCalledWith(
      'Normalizer error for agent',
      'crash-agent',
      expect.any(Error)
    )

    spy.mockRestore()
  })

  it('all messages render even when one assistant message has a crashing normalizer', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const messages: ChatMessageLike[] = [
      {
        id: 'good-1',
        content: 'Good assistant response',
        role: 'assistant',
        timestamp: Date.now() - 3000,
        agent: 'claude',
      },
      {
        id: 'bad-1',
        content: 'Broken normalizer content',
        role: 'assistant',
        timestamp: Date.now() - 2000,
        agent: 'crash-agent',
      },
      {
        id: 'good-2',
        content: 'Another good response',
        role: 'assistant',
        timestamp: Date.now() - 1000,
        agent: 'claude',
      },
    ]

    render(
      <ToastProvider>
        <MessagesList
          messages={messages}
          expandedMessages={new Set()}
          onToggleExpand={() => {}}
          isLongMessage={() => false}
        />
      </ToastProvider>
    )

    // All three messages should be visible — the crash-agent one falls
    // back to raw content instead of killing the list
    const allMessages = screen.getAllByTestId('chat-message')
    expect(allMessages).toHaveLength(3)

    // Verify the broken message still shows its raw content
    expect(screen.getByText('Broken normalizer content')).toBeInTheDocument()
    expect(screen.getByText('Good assistant response')).toBeInTheDocument()
    expect(screen.getByText('Another good response')).toBeInTheDocument()

    spy.mockRestore()
  })
})
