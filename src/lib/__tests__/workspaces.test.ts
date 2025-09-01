import { describe, it, expect } from 'vitest'
import { parseWorkspaceWorktrees } from '@/lib/workspaces'

describe('parseWorkspaceWorktrees', () => {
  const project = '/Users/me/proj'
  it('filters and maps worktrees inside .commander', () => {
    const list = [
      { path: '/Users/me/proj/.commander/ws1', branch: 'workspace/ws1' },
      { path: '/Users/me/proj/.commander/feature-A', branch: 'workspace/feature-A' },
      { path: '/Users/me/proj/other', branch: 'feature/other' },
    ] as any
    const out = parseWorkspaceWorktrees(list, project)
    expect(out).toEqual([
      { name: 'ws1', path: '/Users/me/proj/.commander/ws1' },
      { name: 'feature-A', path: '/Users/me/proj/.commander/feature-A' },
    ])
  })
})

