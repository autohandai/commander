import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChatInput } from '@/components/chat/ChatInput'

describe('ChatInput', () => {
  const baseProps = {
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
    workspaceEnabled: true,
    onWorkspaceEnabledChange: vi.fn(),
    projectName: 'demo',
    selectedAgent: undefined,
    getAgentModel: () => null,
    fileMentionsEnabled: true,
  }

  it('shows default placeholder in normal mode', () => {
    render(<ChatInput {...baseProps} />)
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', expect.stringContaining("/claude"))
  })

  it('shows plan placeholder in plan mode', () => {
    render(<ChatInput {...baseProps} planModeEnabled={true} />)
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', expect.stringContaining('Describe what you want to accomplish'))
  })

  it('renders project context helper', () => {
    render(<ChatInput {...baseProps} />)
    expect(screen.getByText(/Working in:\s*demo/i)).toBeInTheDocument()
  })
})
