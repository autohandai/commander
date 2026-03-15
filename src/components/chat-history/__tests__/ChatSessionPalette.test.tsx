import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatSessionPalette } from '../ChatSessionPalette'

const mockSessions = [
  { id: 's1', start_time: Date.now() / 1000 - 3600, end_time: Date.now() / 1000, agent: 'claude', branch: 'main', message_count: 5, summary: 'Fix login bug', archived: false, custom_title: null, ai_summary: null, forked_from: null, source: 'local' as const, source_file: null, model: null },
  { id: 's2', start_time: Date.now() / 1000 - 86400, end_time: Date.now() / 1000, agent: 'codex', branch: 'dev', message_count: 3, summary: 'Add dashboard', archived: false, custom_title: 'My custom title', ai_summary: null, forked_from: null, source: 'local' as const, source_file: null, model: null },
]

const defaultProps = {
  sessions: mockSessions,
  loading: false,
  searchQuery: '',
  onSearch: vi.fn(),
  onSelect: vi.fn(),
  onNewChat: vi.fn(),
  onClose: vi.fn(),
  onArchive: vi.fn(),
  onUnarchive: vi.fn(),
  onRename: vi.fn(),
  onFork: vi.fn(),
  onCompact: vi.fn(),
  onSummarizeAI: vi.fn(),
  onDelete: vi.fn(),
}

describe('ChatSessionPalette', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders search input and New Chat option', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    expect(screen.getByPlaceholderText('Search threads...')).toBeInTheDocument()
    expect(screen.getByText('New Chat')).toBeInTheDocument()
  })

  it('renders session summaries with custom_title priority', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    expect(screen.getByText('Fix login bug')).toBeInTheDocument()
    expect(screen.getByText('My custom title')).toBeInTheDocument()
  })

  it('calls onSelect when clicking a session', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    fireEvent.click(screen.getByText('Fix login bug'))
    expect(defaultProps.onSelect).toHaveBeenCalledWith('s1')
  })

  it('calls onNewChat when clicking New Chat', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    fireEvent.click(screen.getByText('New Chat'))
    expect(defaultProps.onNewChat).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    fireEvent.keyDown(screen.getByPlaceholderText('Search threads...'), { key: 'Escape' })
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('navigates with arrow keys', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    const input = screen.getByPlaceholderText('Search threads...')
    // Index 0 = New Chat, ArrowDown once = index 1 = first session (s1)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(defaultProps.onSelect).toHaveBeenCalledWith('s1')
  })

  it('calls onClose when clicking backdrop', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    const backdrop = screen.getByTestId('palette-backdrop')
    fireEvent.click(backdrop)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('shows footer with keyboard hints', () => {
    render(<ChatSessionPalette {...defaultProps} />)
    expect(screen.getByText(/navigate/)).toBeInTheDocument()
    expect(screen.getByText(/select/)).toBeInTheDocument()
    expect(screen.getByText(/close/)).toBeInTheDocument()
  })

  it('shows loading state', () => {
    render(<ChatSessionPalette {...defaultProps} loading={true} sessions={[]} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows empty search state', () => {
    render(<ChatSessionPalette {...defaultProps} sessions={[]} searchQuery="nonexistent" />)
    expect(screen.getByText('No matching sessions')).toBeInTheDocument()
  })

  it('shows model badge for indexed sessions with model', () => {
    const indexedSession = { id: 'idx-1', start_time: Date.now() / 1000 - 1800, end_time: Date.now() / 1000, agent: 'claude', branch: null, message_count: 10, summary: 'Indexed session', archived: false, custom_title: null, ai_summary: null, forked_from: null, source: 'indexed' as const, source_file: '/test.jsonl', model: 'opus' }
    render(<ChatSessionPalette {...defaultProps} sessions={[...mockSessions, indexedSession]} />)
    expect(screen.getByText('opus')).toBeInTheDocument()
  })

  it('applies opacity style to indexed sessions', () => {
    const indexedSession = { id: 'idx-1', start_time: Date.now() / 1000 - 1800, end_time: Date.now() / 1000, agent: 'claude', branch: null, message_count: 10, summary: 'Indexed session', archived: false, custom_title: null, ai_summary: null, forked_from: null, source: 'indexed' as const, source_file: '/test.jsonl', model: null }
    render(<ChatSessionPalette {...defaultProps} sessions={[indexedSession]} />)
    const sessionRow = screen.getByText('Indexed session').closest('[role="option"]')
    expect(sessionRow?.className).toContain('opacity-80')
  })
})
