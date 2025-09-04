import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useRotatingPlaceholder } from '@/components/chat/hooks/useRotatingPlaceholder'

describe('useRotatingPlaceholder', () => {
  it('types and cycles messages when conditions met', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook((p: any) =>
      useRotatingPlaceholder({
        isOpen: true,
        executingCount: 0,
        isInputFocused: false,
        inputValue: '',
        normal: ['hello'],
        plan: ['plan'],
        planModeEnabled: false,
        ...p,
      })
    )
    // change mode to stop (should clear placeholder)
    rerender({ isOpen: true, executingCount: 1 })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current).toBe('')
    vi.useRealTimers()
  })
})
