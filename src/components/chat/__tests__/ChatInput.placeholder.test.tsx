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
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', expect.stringContaining('defaults to Claude Code CLI'))
  })

  it('shows plan placeholder in plan mode', () => {
    render(<ChatInput {...baseProps} planModeEnabled={true} />)
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', expect.stringContaining('Describe what you want to accomplish'))
  })

  it('renders project context helper', () => {
    render(<ChatInput {...baseProps} />)
    expect(screen.getByText(/Working in:\s*demo/i)).toBeInTheDocument()
  })

  it('reflects provided default agent label in placeholder', () => {
    const { rerender } = render(<ChatInput {...(baseProps as any)} defaultAgentLabel="Codex" />)
    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('placeholder', expect.stringContaining('Codex'))
    rerender(<ChatInput {...(baseProps as any)} defaultAgentLabel="Ollama" />)
    expect(screen.getByRole('textbox')).toHaveAttribute('placeholder', expect.stringContaining('Ollama'))
  })
})
