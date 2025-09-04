import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatInput } from '@/components/chat/ChatInput'

describe('ChatInput new session control', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const baseProps = () => ({
    inputRef: { current: null } as any,
    autocompleteRef: { current: null } as any,
    inputValue: '',
    typedPlaceholder: '',
    onInputChange: vi.fn(),
    onInputSelect: vi.fn(),
    onKeyDown: vi.fn(),
    onFocus: vi.fn(),
    onBlur: vi.fn(),
    onClear: vi.fn(),
    onSend: vi.fn(),
    showAutocomplete: false,
    autocompleteOptions: [],
    selectedOptionIndex: 0,
    onSelectOption: vi.fn(),
    planModeEnabled: false,
    onPlanModeChange: vi.fn(),
    workspaceEnabled: false,
    onWorkspaceEnabledChange: vi.fn(),
    projectName: undefined,
    selectedAgent: undefined,
    getAgentModel: () => null,
    fileMentionsEnabled: true,
    chatSendShortcut: 'mod+enter' as const,
  })

  it('renders a new chat icon button when enabled and calls handler on click', () => {
    const onNewSession = vi.fn()
    render(
      <ChatInput
        {...baseProps()}
        // @ts-expect-error testing new props
        onNewSession={onNewSession}
        // @ts-expect-error testing new props
        showNewSession={true}
      />
    )

    const btn = screen.getByRole('button', { name: /new chat/i })
    expect(btn).toBeInTheDocument()

    fireEvent.click(btn)
    expect(onNewSession).toHaveBeenCalledTimes(1)
  })

  it('invokes onNewSession on Cmd+Shift+N (or Ctrl+Shift+N)', () => {
    const onNewSession = vi.fn()
    render(
      <ChatInput
        {...baseProps()}
        // @ts-expect-error testing new props
        onNewSession={onNewSession}
        // @ts-expect-error testing new props
        showNewSession={true}
      />
    )

    // Meta (Cmd) variant
    fireEvent.keyDown(window, { key: 'N', metaKey: true, shiftKey: true })
    expect(onNewSession).toHaveBeenCalledTimes(1)

    // Ctrl variant
    fireEvent.keyDown(window, { key: 'n', ctrlKey: true, shiftKey: true })
    expect(onNewSession).toHaveBeenCalledTimes(2)
  })
})

