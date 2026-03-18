/**
 * Regression test: assistant messages with empty content must show visible fallback.
 *
 * Bug: When Autohand CLI produced no output, the assistant message rendered
 * with header (avatar, name, timestamp) but completely blank body — no spinner,
 * no error, no feedback. Users saw a ghost message.
 *
 * Root cause: MessagesList rendering path for content==='' && isStreaming===false
 * falls through to UnifiedContent, which renders nothing when answer is ''.
 *
 * Fix: Add explicit fallback for completed-but-empty assistant messages.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessagesList, ChatMessageLike } from '@/components/chat/MessagesList'
import { ToastProvider } from '@/components/ToastProvider'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Provide a minimal working normalizer
vi.mock('@/components/chat/unified/normalizers', () => ({
  getNormalizer: () => (content: string) => ({
    reasoning: [],
    workingSteps: [],
    answer: content,
    meta: null,
    toolEvents: [],
    isStreaming: false,
  }),
}))

const defaultProps = {
  expandedMessages: new Set<string>(),
  onToggleExpand: () => {},
  isLongMessage: () => false,
}

describe('MessagesList empty content fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('shows visible fallback when assistant message has empty content and is not streaming', () => {
    const messages: ChatMessageLike[] = [
      {
        id: 'empty-msg',
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        agent: 'Autohand',
        isStreaming: false,
      },
    ]

    render(
      <ToastProvider>
        <MessagesList messages={messages} {...defaultProps} />
      </ToastProvider>
    )

    // The message row should exist
    expect(screen.getByTestId('chat-message')).toBeInTheDocument()

    // Should show a visible fallback — NOT a blank empty div
    expect(screen.getByTestId('empty-response-fallback')).toBeInTheDocument()
    expect(screen.getByText(/no response/i)).toBeInTheDocument()
  })

  it('shows thinking spinner when content is empty but status is thinking/running', () => {
    const messages: ChatMessageLike[] = [
      {
        id: 'thinking-msg',
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        agent: 'Autohand',
        isStreaming: false,
        status: 'thinking',
      },
    ]

    render(
      <ToastProvider>
        <MessagesList messages={messages} {...defaultProps} />
      </ToastProvider>
    )

    // Should show a waiting/thinking indicator even when isStreaming is false
    // because status is still 'thinking'
    const msg = screen.getByTestId('chat-message')
    expect(msg).toBeInTheDocument()

    // Should NOT show the empty fallback
    expect(screen.queryByTestId('empty-response-fallback')).not.toBeInTheDocument()

    // Should show the Thinking… spinner (not just the status badge)
    expect(screen.getByText('Thinking…')).toBeInTheDocument()
  })

  it('shows thinking spinner when isStreaming is true and content is empty', () => {
    const messages: ChatMessageLike[] = [
      {
        id: 'streaming-msg',
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        agent: 'Autohand',
        isStreaming: true,
      },
    ]

    render(
      <ToastProvider>
        <MessagesList messages={messages} {...defaultProps} />
      </ToastProvider>
    )

    // Existing behavior: should show Thinking... spinner
    expect(screen.getByText(/thinking/i)).toBeInTheDocument()
    expect(screen.queryByTestId('empty-response-fallback')).not.toBeInTheDocument()
  })

  it('renders content normally when assistant message has non-empty content', () => {
    const messages: ChatMessageLike[] = [
      {
        id: 'normal-msg',
        content: 'Hello, world!',
        role: 'assistant',
        timestamp: Date.now(),
        agent: 'Autohand',
        isStreaming: false,
      },
    ]

    render(
      <ToastProvider>
        <MessagesList messages={messages} {...defaultProps} />
      </ToastProvider>
    )

    // Content should render normally
    expect(screen.getByText('Hello, world!')).toBeInTheDocument()
    // No fallback shown
    expect(screen.queryByTestId('empty-response-fallback')).not.toBeInTheDocument()
  })

  it('does not show empty fallback for failed messages — shows error instead', () => {
    const messages: ChatMessageLike[] = [
      {
        id: 'failed-msg',
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        agent: 'Autohand',
        isStreaming: false,
        status: 'failed',
      },
    ]

    render(
      <ToastProvider>
        <MessagesList messages={messages} {...defaultProps} />
      </ToastProvider>
    )

    // Should show something visible (either a specific error or the generic fallback)
    expect(screen.getByTestId('chat-message')).toBeInTheDocument()
    // Should show the failed fallback text
    expect(screen.getByTestId('empty-response-fallback')).toBeInTheDocument()
    expect(screen.getByText('Response failed — please try again.')).toBeInTheDocument()
  })

  it('treats whitespace-only content as empty and shows fallback', () => {
    const messages: ChatMessageLike[] = [
      {
        id: 'ws-msg',
        content: '  \n\n  ',
        role: 'assistant',
        timestamp: Date.now(),
        agent: 'Autohand',
        isStreaming: false,
      },
    ]

    render(
      <ToastProvider>
        <MessagesList messages={messages} {...defaultProps} />
      </ToastProvider>
    )

    // Whitespace-only content should trigger the empty fallback
    expect(screen.getByTestId('empty-response-fallback')).toBeInTheDocument()
    expect(screen.getByText('No response received.')).toBeInTheDocument()
  })
})
