import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockUpdateSettings = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@/contexts/settings-context', () => ({
  useSettings: () => ({
    settings: { has_completed_onboarding: false },
    updateSettings: mockUpdateSettings,
    refreshSettings: vi.fn(),
    isLoading: false,
  }),
}))

import { OnboardingModal } from '@/components/OnboardingModal'

describe('OnboardingModal', () => {
  const onComplete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateSettings.mockResolvedValue(undefined)
  })

  it('renders all 5 features in the sidebar', () => {
    render(<OnboardingModal isOpen={true} onComplete={onComplete} />)

    expect(screen.getByTestId('onboarding-feature-ai-chat')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-feature-code-view')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-feature-multi-agent')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-feature-projects')).toBeInTheDocument()
    expect(screen.getByTestId('onboarding-feature-git')).toBeInTheDocument()
  })

  it('clicking a feature updates the right panel', () => {
    render(<OnboardingModal isOpen={true} onComplete={onComplete} />)

    // Default is AI Chat
    expect(screen.getByTestId('onboarding-preview-title')).toHaveTextContent('AI Chat')

    // Click Git Integration
    fireEvent.click(screen.getByTestId('onboarding-feature-git'))
    expect(screen.getByTestId('onboarding-preview-title')).toHaveTextContent('Git Integration')
    expect(screen.getByTestId('onboarding-preview-description')).toHaveTextContent('Branch management')
  })

  it('Get Started without checkbox calls onComplete but does not save settings', async () => {
    render(<OnboardingModal isOpen={true} onComplete={onComplete} />)

    fireEvent.click(screen.getByTestId('onboarding-get-started'))

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
    expect(mockUpdateSettings).not.toHaveBeenCalled()
  })

  it('Get Started with checkbox saves has_completed_onboarding: true', async () => {
    render(<OnboardingModal isOpen={true} onComplete={onComplete} />)

    // Check the "Don't show again" checkbox
    fireEvent.click(screen.getByTestId('onboarding-dont-show'))

    fireEvent.click(screen.getByTestId('onboarding-get-started'))

    await waitFor(() => {
      expect(mockUpdateSettings).toHaveBeenCalledWith({ has_completed_onboarding: true })
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('does not render when isOpen is false', () => {
    render(<OnboardingModal isOpen={false} onComplete={onComplete} />)
    expect(screen.queryByText('Welcome to Commander')).not.toBeInTheDocument()
  })
})
