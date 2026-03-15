import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToastProvider } from '@/components/ToastProvider'
import { AppearanceSettings } from '@/components/settings/AppearanceSettings'

if (typeof document !== 'undefined') describe('AppearanceSettings dashboard palette selector', () => {
  const baseProps = {
    tempUiTheme: 'auto',
    tempDashboardColorPalette: 'ghostty-aurora',
    onUiThemeChange: vi.fn(),
    onDashboardColorPaletteChange: vi.fn(),
  }

  it('shows palette swatches in the trigger and dropdown options', async () => {
    render(
      <ToastProvider>
        <AppearanceSettings {...baseProps} />
      </ToastProvider>
    )

    expect(screen.getByTestId('dashboard-palette-trigger-preview-ghostty-aurora')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('combobox', { name: /chart color palette/i }))

    expect((await screen.findAllByTestId('dashboard-palette-option-preview-ghostty-aurora')).length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('dashboard-palette-option-preview-ghostty-ember').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('dashboard-palette-option-preview-ghostty-lagoon').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('dashboard-palette-option-preview-ghostty-dusk').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('dashboard-palette-option-preview-ghostty-forest').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('dashboard-palette-option-preview-dracula').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('dashboard-palette-option-preview-github-dark').length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('dashboard-palette-option-preview-github-light').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Aurora').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Dracula').length).toBeGreaterThan(0)
    expect(screen.getAllByText('GitHub Dark').length).toBeGreaterThan(0)
    expect(screen.getAllByText('GitHub Light').length).toBeGreaterThan(0)
  })
})
