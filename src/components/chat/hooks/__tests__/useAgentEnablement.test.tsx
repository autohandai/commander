import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAgentEnablement } from '@/components/chat/hooks/useAgentEnablement'

vi.mock('@tauri-apps/api/core', () => {
  return {
    invoke: vi.fn(async () => ({ claude: true, codex: false, gemini: true, test: true })),
  }
})

describe('useAgentEnablement', () => {
  it('fetches and caches enabled map; returns correct allow/deny', async () => {
    const { result } = renderHook(() => useAgentEnablement())
    // first call triggers fetch
    let allowed = await act(() => result.current.ensureEnabled('codex'))
    expect(allowed).toBe(false)

    const core = await import('@tauri-apps/api/core')
    expect((core.invoke as any).mock.calls.length).toBe(1)

    // second call uses cached map
    allowed = await act(() => result.current.ensureEnabled('claude'))
    expect(allowed).toBe(true)
    expect((core.invoke as any).mock.calls.length).toBe(1)
  })
})

