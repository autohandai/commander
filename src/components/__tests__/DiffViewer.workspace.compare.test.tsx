import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { DiffViewer } from '@/components/DiffViewer'

// Stub Radix Tabs to avoid jsdom quirks
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

const projectPath = '/tmp/demo'
const workspacePath = '/tmp/demo/ws/feature1'

const invokeMock = vi.fn(async (cmd: string, args: any) => {
  switch (cmd) {
    case 'get_git_worktrees':
      return [
        { path: workspacePath, branch: 'feature1' },
        { path: projectPath, branch: 'main' },
      ]
    case 'diff_workspace_vs_main':
      expect(args.projectPath).toBe(projectPath)
      expect(args.worktreePath).toBe(workspacePath)
      return [ { status: 'M', path: 'src/app.ts' } ]
    case 'diff_workspace_file':
      expect(args.projectPath).toBe(projectPath)
      expect(args.worktreePath).toBe(workspacePath)
      expect(args.filePath).toBe('src/app.ts')
      return '--- a/src/app.ts\n+++ b/src/app.ts\n+console.log("after");\n'
    case 'get_file_at_commit':
      // main vs feature1 retrieval (side-by-side)
      if (args.commitHash === 'main') return 'console.log("before");\n'
      if (args.commitHash === 'feature1') return 'console.log("after");\n'
      return ''
    default:
      return null
  }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: any[]) => invokeMock(...args)
}))

if (typeof document !== 'undefined') describe('DiffViewer workspace compare', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists files from workspace vs main and shows diff on click', async () => {
    render(
      <DiffViewer 
        projectPath={projectPath}
        commitHash={null}
        compareMode="workspace"
        workspacePath={workspacePath}
      />
    )

    // Files list loaded
    await waitFor(() => {
      expect(screen.getByText(/Changed Files/i)).toBeInTheDocument()
    })
    const fileBtn = screen.getByRole('button', { name: /src\/app\.ts/i })
    expect(fileBtn).toBeInTheDocument()

    // Click file to fetch diff
    fireEvent.click(fileBtn)

    // Diff appears (unified tab header and Diff header)
    await waitFor(() => {
      expect(screen.getByText(/Unified Diff/i)).toBeInTheDocument()
      expect(screen.getByText(/Diff:/i)).toBeInTheDocument()
    })

    // Ensure backend calls were made
    expect(invokeMock).toHaveBeenCalledWith('diff_workspace_file', expect.objectContaining({
      projectPath,
      worktreePath: workspacePath,
      filePath: 'src/app.ts'
    }))
  })
})
