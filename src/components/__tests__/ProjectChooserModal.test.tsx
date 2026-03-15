import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

import { ProjectChooserModal } from '@/components/ProjectChooserModal'

describe('ProjectChooserModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onNewProject: vi.fn(),
    onOpenProject: vi.fn(),
    onCloneProject: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all three project options when open', () => {
    render(<ProjectChooserModal {...defaultProps} />)

    expect(screen.getByText('New Project')).toBeInTheDocument()
    expect(screen.getByText('Open Project')).toBeInTheDocument()
    expect(screen.getByText('Clone')).toBeInTheDocument()
  })

  it('does not render content when closed', () => {
    render(<ProjectChooserModal {...defaultProps} isOpen={false} />)

    expect(screen.queryByText('New Project')).not.toBeInTheDocument()
  })

  it('calls onNewProject and onClose when New Project is clicked', async () => {
    const user = userEvent.setup()
    render(<ProjectChooserModal {...defaultProps} />)

    await user.click(screen.getByText('New Project'))

    expect(defaultProps.onNewProject).toHaveBeenCalledOnce()
    expect(defaultProps.onClose).toHaveBeenCalledOnce()
  })

  it('calls onOpenProject and onClose when Open Project is clicked', async () => {
    const user = userEvent.setup()
    render(<ProjectChooserModal {...defaultProps} />)

    await user.click(screen.getByText('Open Project'))

    expect(defaultProps.onOpenProject).toHaveBeenCalledOnce()
    expect(defaultProps.onClose).toHaveBeenCalledOnce()
  })

  it('calls onCloneProject and onClose when Clone is clicked', async () => {
    const user = userEvent.setup()
    render(<ProjectChooserModal {...defaultProps} />)

    await user.click(screen.getByText('Clone'))

    expect(defaultProps.onCloneProject).toHaveBeenCalledOnce()
    expect(defaultProps.onClose).toHaveBeenCalledOnce()
  })
})
