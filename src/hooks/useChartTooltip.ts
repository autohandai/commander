import { useRef, useEffect, useCallback } from 'react'

const TOOLTIP_STYLE =
  'position:fixed;pointer-events:none;padding:6px 10px;background:hsl(var(--popover));color:hsl(var(--popover-foreground));border:1px solid hsl(var(--border));border-radius:6px;font-size:11px;z-index:9999;display:none;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.18);'

export interface ChartTooltip {
  show: (event: MouseEvent | React.MouseEvent, content: string) => void
  hide: () => void
  /** The raw DOM element — use for D3 interop only */
  element: HTMLDivElement | null
}

/**
 * Shared tooltip hook for dashboard charts.
 * Creates a single fixed-position DOM tooltip and returns show/hide helpers.
 * Cleans up on unmount.
 */
export function useChartTooltip(): ChartTooltip {
  const tooltipRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = document.createElement('div')
    el.style.cssText = TOOLTIP_STYLE
    document.body.appendChild(el)
    tooltipRef.current = el

    return () => {
      if (el.parentNode) {
        el.parentNode.removeChild(el)
      }
      tooltipRef.current = null
    }
  }, [])

  const show = useCallback((event: MouseEvent | React.MouseEvent, content: string) => {
    const el = tooltipRef.current
    if (!el) return
    el.textContent = content
    el.style.display = 'block'
    // Position near cursor, offset right and up
    el.style.left = `${event.clientX + 12}px`
    el.style.top = `${event.clientY - 32}px`
  }, [])

  const hide = useCallback(() => {
    const el = tooltipRef.current
    if (!el) return
    el.style.display = 'none'
  }, [])

  return { show, hide, element: tooltipRef.current }
}
