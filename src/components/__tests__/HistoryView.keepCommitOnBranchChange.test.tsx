import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { HistoryView } from '@/components/HistoryView'

const project = {
  name: 'demo',
  path: '/tmp/demo',
  last_accessed: 0,
  is_git_repo: true,
  git_branch: 'main',
  git_status: 'clean',
} as any

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string, args: any) => {
      switch (cmd) {
        case 'get_git_branches':
          return ['main', 'dev']
        case 'get_git_worktrees':
          return [{ path: project.path, branch: 'main' }]
        case 'get_git_commit_dag': {
          // respond based on selected branch
          const branch = args?.branch || 'main'
          if (branch === 'dev') {
            return [
              { hash: 'd1', parents: [], author: 'A', date: '2024-09-02', subject: 'dev: first', refs: [] },
            ]
          }
          return [
            { hash: 'c2', parents: ['c1'], author: 'A', date: '2024-09-01', subject: 'feat: second', refs: ['origin/main'] },
            { hash: 'c1', parents: [], author: 'A', date: '2024-08-31', subject: 'chore: first', refs: [] },
          ]
        }
        case 'get_commit_diff_files':
          if (args?.commitHash === 'c2') {
            return [{ status: 'M', path: 'src/app.ts' }]
          }
          return []
        case 'get_commit_diff_text':
          return 'diff --git a/src/app.ts b/src/app.ts\n+console.log("after");'
        case 'get_file_at_commit':
          return 'console.log("file");\n'
        default:
          return null
      }
    })
  }
})

// Radix Tabs stub to avoid jsdom quirks
vi.mock('@radix-ui/react-tabs', () => {
  const React = require('react')
  return {
    __esModule: true,
    Root: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    List: React.forwardRef<HTMLDivElement, any>((props, ref) => <div ref={ref} {...props} />),
    Trigger: React.forwardRef<HTMLButtonElement, any>((props, ref) => <button ref={ref} {...props} />),
    Content: React.forwardRef<HTMLDivElement, any>((props, ref) => <div ref={ref} {...props} />),
  }
})

// Mock HistoryControls to programmatically trigger a branch change without UI
vi.mock('@/components/HistoryControls', () => {
  const React = require('react')
  return {
    __esModule: true,
    HistoryControls: ({ onBranchChange, ...props }: any) => {
      React.useEffect(() => {
        // Fire a branch change shortly after mount (simulating user selection)
        const t = setTimeout(() => onBranchChange && onBranchChange('dev'), 10)
        return () => clearTimeout(t)
      }, [onBranchChange])
      return <div data-testid="mock-history-controls" />
    }
  }
})

if (typeof document !== 'undefined') describe('HistoryView keeps commit diff when branch changes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not clear selected commit diff after changing branch', async () => {
    render(<HistoryView project={project} />)

    // Wait for graph to load
    await waitFor(() => {
      expect(screen.getByText(/Git History/i)).toBeInTheDocument()
    })

    // Open commit c2 diff
    fireEvent.click(screen.getByText('feat: second'))
    await waitFor(() => {
      expect(screen.getByText(/Changed Files/i)).toBeInTheDocument()
    })

    // HistoryControls mock will change branch to 'dev' automatically

    // Diff remains visible (not reset to 'Select a Commit')
    await waitFor(() => {
      expect(screen.getByText(/Changed Files/i)).toBeInTheDocument()
    })
  })
})
