import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// Radix Tabs can crash in portal on jsdom in some setups.
// Stub underlying primitives just for this test suite.
vi.mock('@radix-ui/react-tabs', () => {
  const React = require('react')
  return {
    __esModule: true,
    Root: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    List: React.forwardRef<HTMLDivElement, any>((props, ref) => (
      <div ref={ref} {...props} />
    )),
    Trigger: React.forwardRef<HTMLButtonElement, any>((props, ref) => (
      <button ref={ref} {...props} />
    )),
    Content: React.forwardRef<HTMLDivElement, any>((props, ref) => (
      <div ref={ref} {...props} />
    )),
  }
})

import { HistoryView } from '@/components/HistoryView'

// Minimal RecentProject shape
const project = {
  name: 'demo',
  path: '/tmp/demo',
  last_accessed: Date.now(),
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
} as any

// Mock Tauri invoke calls used by HistoryView, HistoryControls, and DiffViewer
vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string, args: any) => {
      switch (cmd) {
        case 'get_git_branches':
          return ['main']
        case 'get_git_worktrees':
          return [{ path: project.path, branch: 'main' }]
        case 'get_git_commit_dag':
          // Return two simple commits with parent relation
          return [
            {
              hash: 'c2',
              parents: ['c1'],
              author: 'A',
              date: '2024-09-01',
              subject: 'feat: second commit',
              refs: ['origin/main']
            },
            {
              hash: 'c1',
              parents: [],
              author: 'A',
              date: '2024-08-31',
              subject: 'chore: first commit',
              refs: []
            }
          ]
        case 'get_commit_diff_files':
          return [
            { status: 'M', path: 'src/index.ts' }
          ]
        case 'get_commit_diff_text':
          return 'diff --git a/src/index.ts b/src/index.ts\n+console.log(\"hello\");'
        case 'get_file_at_commit':
          if (args?.commitHash === 'HEAD~1') return 'console.log("before");\n'
          return 'console.log("after");\n'
        default:
          return null
      }
    })
  }
})

if (typeof document !== 'undefined') describe('HistoryView diff dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders graph and chat panels side by side without inline DiffViewer', async () => {
    render(<HistoryView project={project} />)

    // Wait for HistoryView to load commits and controls
    await waitFor(() => {
      expect(screen.getByText(/Git History/i)).toBeInTheDocument()
      expect(screen.getByText(/Chat History/i)).toBeInTheDocument()
    })

    // The inline DiffViewer placeholder text should not be present anymore
    expect(screen.queryByText(/Select a Commit/i)).not.toBeInTheDocument()
  })

  it('opens a dialog with DiffViewer when a commit is clicked and closes it', async () => {
    render(<HistoryView project={project} />)

    // Wait for commits to render
    await waitFor(() => {
      expect(screen.getByText('feat: second commit')).toBeInTheDocument()
    })

    // Click a commit row (by subject text)
    fireEvent.click(screen.getByText('feat: second commit'))

    // Diff dialog should appear with DiffViewer content
    await waitFor(() => {
      expect(screen.getByText(/Changed Files/i)).toBeInTheDocument()
    })

    // Dialog should be large (nearly fullscreen dimensions)
    const hasLargeDialog = Array.from(document.querySelectorAll('div')).some(el => {
      const cls = (el as HTMLElement).className || ''
      return cls.includes('h-[90vh]') && cls.includes('w-[95vw]')
    })
    expect(hasLargeDialog).toBe(true)

    // Initially shows placeholder on the right (no file selected yet)
    expect(screen.getByText(/Select a file to view its diff/i)).toBeInTheDocument()

    // Ensure file list is single-column (not two-column grid)
    const list = screen.getByTestId('diff-file-list')
    expect(list.className).toMatch(/flex\s+flex-col/)
    expect(list.className).not.toMatch(/grid-cols-2/)

    // Click a file to load diffs
    const fileBtn = screen.getByRole('button', { name: /M src\/index\.ts/i })
    fileBtn.click()

    // Diff content appears (tabs + header)
    await waitFor(() => {
      expect(screen.getByText(/Unified Diff/i)).toBeInTheDocument()
      expect(screen.getByText(/Diff:/i)).toBeInTheDocument()
    })

    // Close via the dialog close button (has accessible name 'Close')
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)

    // Dialog content should disappear
    await waitFor(() => {
      expect(screen.queryByText(/Changed Files/i)).not.toBeInTheDocument()
    })
  })
})
