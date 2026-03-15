import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { readAgentColor } from '@/lib/dashboard-palettes'
import { useChartTooltip } from '@/hooks/useChartTooltip'

interface DailyActivity {
  date: string
  message_count: number
  token_count: number
}

export interface SessionScatterChartProps {
  dailyActivity: DailyActivity[]
  agentsUsed: Record<string, number>
  /** Pass palette key to trigger re-render on palette change */
  paletteKey?: string
  selectedAgent?: string | null
  onAgentClick?: (agent: string) => void
}

const ROWS = 14
const DOT_GAP = 2
const MARGIN = { top: 28, left: 0, bottom: 8, right: 0 }

const KNOWN_AGENTS = ['claude', 'codex', 'gemini', 'ollama', 'autohand'] as const

interface ScatterPalette {
  axis: string
  grid: string
  mutedDot: string
  agents: Record<string, string>
}

function readCssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = style.getPropertyValue(name).trim()
  return value || fallback
}

function getScatterPalette(agentNames: string[]): ScatterPalette {
  if (typeof window === 'undefined') {
    const agents: Record<string, string> = {}
    for (const name of agentNames) {
      agents[name] = readAgentColor(name)
    }
    return {
      axis: '#6b7280',
      grid: 'rgba(148, 163, 184, 0.25)',
      mutedDot: 'rgba(148, 163, 184, 0.25)',
      agents,
    }
  }

  const style = getComputedStyle(document.documentElement)
  const agents: Record<string, string> = {}
  for (const name of agentNames) {
    agents[name] = readAgentColor(name)
  }

  return {
    axis: readCssVar(style, '--dashboard-axis', '#6b7280'),
    grid: readCssVar(style, '--dashboard-grid', 'rgba(148, 163, 184, 0.25)'),
    mutedDot: readCssVar(style, '--dashboard-dot-muted', 'rgba(148, 163, 184, 0.25)'),
    agents,
  }
}

function stableJitter(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash % 1000) / 1000
}

export function SessionScatterChart({ dailyActivity, agentsUsed, paletteKey, selectedAgent, onAgentClick }: SessionScatterChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltip = useChartTooltip()
  const agentNames = Object.keys(agentsUsed)
  const [containerWidth, setContainerWidth] = useState(0)

  // Observe container width for responsive sizing — debounced
  useEffect(() => {
    if (!containerRef.current) return
    let timerId: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (timerId) clearTimeout(timerId)
        timerId = setTimeout(() => setContainerWidth(w), 150)
      }
    })
    ro.observe(containerRef.current)
    setContainerWidth(containerRef.current.clientWidth)
    return () => {
      ro.disconnect()
      if (timerId) clearTimeout(timerId)
    }
  }, [])

  useEffect(() => {
    if (!svgRef.current || containerWidth < 100) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (dailyActivity.length === 0) {
      return
    }

    const palette = getScatterPalette(agentNames)

    // Sort and fill all days in range
    const sortedActivity = [...dailyActivity].sort((a, b) => a.date.localeCompare(b.date))
    const activityMap = new Map<string, DailyActivity>()
    sortedActivity.forEach((d) => activityMap.set(d.date, d))

    const dates = sortedActivity.map((d) => new Date(`${d.date}T00:00:00`))
    const minDate = d3.min(dates) as Date
    const maxDate = d3.max(dates) as Date

    const allDays: { date: Date; dateStr: string; activity: DailyActivity | undefined }[] = []
    const current = new Date(minDate)
    while (current <= maxDate) {
      const dateStr = current.toISOString().slice(0, 10)
      allDays.push({ date: new Date(current), dateStr, activity: activityMap.get(dateStr) })
      current.setDate(current.getDate() + 1)
    }

    const numCols = allDays.length
    // Compute column width to always fill the full container width
    const availableWidth = containerWidth - MARGIN.left - MARGIN.right
    const colWidth = Math.max(8, availableWidth / numCols)
    // Cap vertical row height so the chart doesn't grow too tall
    const rowHeight = Math.min(colWidth, 20)
    const dotRadius = Math.min((Math.min(colWidth, rowHeight) - DOT_GAP) / 2, 10)

    const width = containerWidth
    const height = MARGIN.top + ROWS * rowHeight + MARGIN.bottom

    svg
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')

    // Glow filter for dark mode
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    const defs = svg.append('defs')
    const filter = defs.append('filter').attr('id', 'dot-glow')
    filter.append('feGaussianBlur').attr('stdDeviation', '1.5').attr('result', 'blur')
    const merge = filter.append('feMerge')
    merge.append('feMergeNode').attr('in', 'blur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Use the shared tooltip from hook
    const tooltipEl = tooltip

    const g = svg.append('g').attr('transform', `translate(${MARGIN.left}, ${MARGIN.top})`)

    // Compute max activity (use message_count primarily, fallback to token_count)
    const maxMessages = d3.max(sortedActivity, (d) => d.message_count) || 1
    const maxActivity = d3.max(sortedActivity, (d) => d.message_count + d.token_count / 1000) || 1

    // Agent ratio computation
    const totalUsage = Object.values(agentsUsed).reduce((a, b) => a + b, 0) || 1
    const agentRatios: { name: string; ratio: number }[] = agentNames.map((name) => ({
      name,
      ratio: agentsUsed[name] / totalUsage,
    }))
    // Sort so the dominant agent is last (drawn on top, appears at higher rows)
    agentRatios.sort((a, b) => a.ratio - b.ratio)

    // For each day: compute how many rows to fill (from bottom up) based on activity
    let dotIdx = 0
    allDays.forEach((d, colIndex) => {
      const msgs = d.activity?.message_count ?? 0
      const tokens = d.activity?.token_count ?? 0
      const activityLevel = msgs + tokens / 1000
      const isActive = msgs > 0 || tokens > 0

      // Number of rows filled proportional to activity relative to max
      // Use sqrt scale for better visual distribution
      const fillRatio = isActive ? Math.sqrt(activityLevel / maxActivity) : 0
      const filledRows = isActive ? Math.max(1, Math.round(fillRatio * (ROWS - 1))) : 0

      for (let row = 0; row < ROWS; row++) {
        const rowFromBottom = ROWS - 1 - row
        const isFilledRow = rowFromBottom < filledRows

        // Determine which agent gets this dot
        let agent = ''
        let color = palette.mutedDot
        let opacity = 0.2
        let r = dotRadius * 0.45

        if (isFilledRow && isActive) {
          // Assign agent based on row position and ratios
          // Bottom rows = dominant agent, top rows = less used agents
          const rowFraction = rowFromBottom / Math.max(filledRows - 1, 1)
          let cumulative = 0
          for (const ar of agentRatios) {
            cumulative += ar.ratio
            if (rowFraction < cumulative || ar === agentRatios[agentRatios.length - 1]) {
              agent = ar.name
              color = palette.agents[ar.name] ?? palette.mutedDot
              break
            }
          }

          // Size based on message volume relative to max
          const sizeRatio = Math.sqrt(msgs / maxMessages)
          r = dotRadius * (0.4 + sizeRatio * 0.6)
          opacity = selectedAgent == null || selectedAgent === agent ? 0.85 : 0.1

          // Add some size variation per dot for visual interest
          const jitter = stableJitter(`${d.dateStr}-${row}`)
          r *= 0.85 + jitter * 0.3
        }

        const cx = colIndex * colWidth + colWidth / 2
        const cy = row * rowHeight + rowHeight / 2
        const currentDotIdx = dotIdx++

        const circle = g.append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', r)
          .attr('fill', color)
          .attr('opacity', 0)
          .attr('stroke', 'none')
          .attr('data-date', d.dateStr)

        if (isFilledRow && isDark) {
          circle.attr('filter', 'url(#dot-glow)')
        }

        // Staggered fade-in
        circle
          .transition()
          .delay(Math.min(currentDotIdx * 2, 800))
          .duration(350)
          .ease(d3.easeCubicOut)
          .attr('opacity', opacity)

        // Hover for active dots
        if (isFilledRow && isActive) {
          const savedR = r
          circle
            .on('mouseenter', function (event: MouseEvent) {
              d3.select(this).transition().duration(120).attr('r', savedR * 1.4)
              const content = `${agent} \u00b7 ${d.dateStr} \u00b7 ${msgs} msgs${tokens > 0 ? ` \u00b7 ${tokens.toLocaleString()} tokens` : ''}`
              tooltipEl.show(event, content)
            })
            .on('mouseleave', function () {
              d3.select(this).transition().duration(120).attr('r', savedR)
              tooltipEl.hide()
            })
        }
      }
    })

    // Month labels on top
    const monthIndexes = new Map<string, number>()
    allDays.forEach((d, i) => {
      const key = `${d.date.getFullYear()}-${d.date.getMonth()}`
      if (!monthIndexes.has(key)) monthIndexes.set(key, i)
    })
    monthIndexes.forEach((startIndex, key) => {
      const [year, month] = key.split('-').map(Number)
      const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'short' })
      svg
        .append('text')
        .attr('x', MARGIN.left + startIndex * colWidth + 2)
        .attr('y', MARGIN.top - 10)
        .attr('fill', palette.axis)
        .attr('font-size', 10)
        .text(monthName)
    })
  }, [dailyActivity, agentsUsed, containerWidth, selectedAgent, paletteKey])

  return (
    <div data-testid="session-scatter-chart" ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" />
      {agentNames.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
          {agentNames.map((agent) => (
            <button
              type="button"
              key={agent}
              className={`inline-flex items-center gap-1.5 cursor-pointer transition-opacity ${
                selectedAgent != null && selectedAgent !== agent ? 'opacity-50' : ''
              } ${selectedAgent === agent ? 'font-semibold text-foreground' : ''}`}
              onClick={() => onAgentClick?.(agent)}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: `var(--dashboard-agent-${KNOWN_AGENTS.includes(agent as (typeof KNOWN_AGENTS)[number]) ? agent : 'default'})`,
                }}
              />
              {agent}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
