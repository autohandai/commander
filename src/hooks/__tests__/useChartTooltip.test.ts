import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChartTooltip } from '@/hooks/useChartTooltip'

function findTooltip(): HTMLDivElement | null {
  // The tooltip is appended as a direct child of body with pointer-events:none
  const divs = document.body.querySelectorAll(':scope > div')
  for (const div of divs) {
    if ((div as HTMLElement).style.pointerEvents === 'none') {
      return div as HTMLDivElement
    }
  }
  return null
}

describe('useChartTooltip', () => {
  afterEach(() => {
    // Clean up any leftover tooltip elements
    let el = findTooltip()
    while (el) {
      el.remove()
      el = findTooltip()
    }
  })

  it('creates a tooltip DOM element on mount', () => {
    const { unmount } = renderHook(() => useChartTooltip())
    expect(findTooltip()).toBeTruthy()
    unmount()
  })

  it('removes tooltip DOM element on unmount', () => {
    const { unmount } = renderHook(() => useChartTooltip())
    unmount()
    expect(findTooltip()).toBeNull()
  })

  it('show() displays the tooltip with content', () => {
    const { result } = renderHook(() => useChartTooltip())
    const fakeEvent = { clientX: 100, clientY: 200 } as MouseEvent

    act(() => {
      result.current.show(fakeEvent, 'Hello tooltip')
    })

    const tooltip = findTooltip()!
    expect(tooltip.textContent).toBe('Hello tooltip')
    expect(tooltip.style.display).toBe('block')
  })

  it('hide() hides the tooltip', () => {
    const { result } = renderHook(() => useChartTooltip())
    const fakeEvent = { clientX: 100, clientY: 200 } as MouseEvent

    act(() => {
      result.current.show(fakeEvent, 'Visible')
    })

    const tooltip = findTooltip()!
    expect(tooltip.style.display).toBe('block')

    act(() => {
      result.current.hide()
    })

    expect(tooltip.style.display).toBe('none')
  })
})
