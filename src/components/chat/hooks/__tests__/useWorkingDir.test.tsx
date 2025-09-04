import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkingDir } from '@/components/chat/hooks/useWorkingDir'

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async (cmd: string) => {
      if (cmd === 'get_git_worktrees') return []
      return null
    }),
  }
})

describe('useWorkingDir', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns project path when no worktree is available', async () => {
    const { result } = renderHook(() => useWorkingDir('/tmp/demo', true))
    const dir = await act(() => result.current())
    expect(dir).toBe('/tmp/demo')
  })

  it('returns workspace worktree when present under .commander', async () => {
    const core = await import('@tauri-apps/api/core')
    ;(core.invoke as any).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_git_worktrees') return [{ path: '/tmp/demo/.commander/ws' }]
      return null
    })
    const { result } = renderHook(() => useWorkingDir('/tmp/demo', true))
    const dir = await act(() => result.current())
    expect(dir).toBe('/tmp/demo/.commander/ws')
  })
})

