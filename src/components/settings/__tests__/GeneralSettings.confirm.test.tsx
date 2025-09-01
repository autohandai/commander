import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GeneralSettings } from '../GeneralSettings'
import { ToastProvider } from '@/components/ToastProvider'

function renderWithProviders(ui: React.ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

const baseProps = {
  tempDefaultProjectsFolder: '/tmp',
  tempShowConsoleOutput: true,
  systemPrompt: '',
  saving: false,
  tempUiTheme: 'auto',
  gitConfig: { global: {}, local: {}, aliases: {} },
  gitWorktreeEnabled: false,
  gitConfigLoading: false,
  gitConfigError: null as string | null,
  onFolderChange: vi.fn(),
  onSelectFolder: vi.fn(async () => {}),
  onConsoleOutputChange: vi.fn(),
  onSystemPromptChange: vi.fn(),
  onClearRecentProjects: vi.fn(async () => {}),
  onRefreshGitConfig: vi.fn(async () => {}),
  onToggleGitWorktree: vi.fn(async () => {}),
  onUiThemeChange: vi.fn(),
}

if (typeof document !== 'undefined') describe('GeneralSettings clear recent projects confirmation', () => {
  it('opens confirmation dialog and cancels without clearing', async () => {
    const onClearRecentProjects = vi.fn(async () => {})
    renderWithProviders(
      <GeneralSettings {...baseProps} onClearRecentProjects={onClearRecentProjects} />
    )

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(await screen.findByText(/permanently remove all recent projects/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))

    await waitFor(() => {
      expect(screen.queryByText(/permanently remove all recent projects/i)).not.toBeInTheDocument()
    })
    expect(onClearRecentProjects).not.toHaveBeenCalled()
  })

  it('confirms and shows success toast after clearing', async () => {
    const onClearRecentProjects = vi.fn(async () => {})
    renderWithProviders(
      <GeneralSettings {...baseProps} onClearRecentProjects={onClearRecentProjects} />
    )

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(await screen.findByText(/permanently remove all recent projects/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /yes, clear them/i }))

    await waitFor(() => {
      expect(onClearRecentProjects).toHaveBeenCalled()
    })

    // Toast visible
    await waitFor(() => {
      expect(screen.getByText(/recent projects cleared/i)).toBeInTheDocument()
    })
  })
})
