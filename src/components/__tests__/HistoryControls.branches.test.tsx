import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { HistoryControls } from '@/components/HistoryControls'

const project = { name: 'demo', path: '/tmp/demo' } as any

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string) => {
    switch (cmd) {
      case 'get_git_branches':
        return ['main', 'feature-abc']
      case 'get_git_worktrees':
        return [
          { path: '/tmp/demo', branch: 'main' },
          { path: '/tmp/demo/.commander/feature-abc', branch: 'workspace/feature-abc' },
        ]
      default:
        return null
    }
  })
}))

if (typeof document !== 'undefined') describe('HistoryControls branches', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders branch and workspace selectors with refresh', async () => {
    render(
      <HistoryControls
        project={project}
        onRefresh={() => {}}
        selectedBranch={'main'}
        selectedWorkspace={project.path}
        onBranchChange={() => {}}
        onWorkspaceChange={() => {}}
      />
    )

    // Two comboboxes: branches and workspaces
    const combos = await screen.findAllByRole('combobox')
    expect(combos.length).toBe(2)
    // Refresh button exists
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
  })
})
