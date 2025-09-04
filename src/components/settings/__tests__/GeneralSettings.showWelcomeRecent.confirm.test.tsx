import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { GeneralSettings } from '@/components/settings/GeneralSettings'

if (typeof document !== 'undefined') describe('GeneralSettings welcome recent projects toggle confirmation', () => {
  const baseProps = {
    tempDefaultProjectsFolder: '/tmp',
    tempShowConsoleOutput: true,
    systemPrompt: '',
    saving: false,
    tempUiTheme: 'auto',
    tempShowWelcomeRecentProjects: true,
    gitConfig: { global: {}, local: {}, aliases: {}},
    gitWorktreeEnabled: false,
    gitConfigLoading: false,
    gitConfigError: null as string | null,
    onFolderChange: vi.fn(),
    onSelectFolder: vi.fn(),
    onConsoleOutputChange: vi.fn(),
    onSystemPromptChange: vi.fn(),
    onClearRecentProjects: vi.fn(),
    onUiThemeChange: vi.fn(),
    onRefreshGitConfig: vi.fn(),
    onToggleGitWorktree: vi.fn(),
  }

  it('prompts for confirmation and calls change handler on confirm', async () => {
    const onShowWelcomeRecentProjectsChange = vi.fn()
    render(
      <ToastProvider>
        <GeneralSettings 
          {...baseProps}
          onShowWelcomeRecentProjectsChange={onShowWelcomeRecentProjectsChange}
        />
      </ToastProvider>
    )

    const toggle = screen.getByLabelText('Show Recent Projects')
    fireEvent.click(toggle)

    // Confirmation dialog appears
    expect(await screen.findByText(/Hide recent projects on Welcome\?/i)).toBeInTheDocument()

    // Confirm the action
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

    expect(onShowWelcomeRecentProjectsChange).toHaveBeenCalledWith(false)
  })

  it('cancels without calling change handler', async () => {
    const onShowWelcomeRecentProjectsChange = vi.fn()
    render(
      <ToastProvider>
        <GeneralSettings 
          {...baseProps}
          onShowWelcomeRecentProjectsChange={onShowWelcomeRecentProjectsChange}
        />
      </ToastProvider>
    )

    const toggle = screen.getByLabelText('Show Recent Projects')
    fireEvent.click(toggle)
    expect(await screen.findByText(/Hide recent projects on Welcome\?/i)).toBeInTheDocument()
    
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onShowWelcomeRecentProjectsChange).not.toHaveBeenCalled()
  })
})

