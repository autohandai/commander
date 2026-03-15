import { readAgentColor } from '@/lib/dashboard-palettes'
import { useChartTooltip } from '@/hooks/useChartTooltip'

interface ActivityTimelineProps {
  dailyActivity: { date: string; message_count: number; token_count: number }[]
  agentsUsed: Record<string, number>
  totalTokens?: number
  totalMessages?: number
  /** Pass palette key to trigger re-render on palette change */
  paletteKey?: string
  selectedAgent?: string | null
  onAgentClick?: (agent: string) => void
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return `${n}`
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ActivityTimeline({
  dailyActivity,
  agentsUsed,
  totalTokens,
  totalMessages,
  paletteKey,
  selectedAgent,
  onAgentClick,
}: ActivityTimelineProps) {
  const tooltip = useChartTooltip()
  const hasTokenData = dailyActivity.some((d) => d.token_count > 0)
  const getBarValue = (d: { message_count: number; token_count: number }) =>
    hasTokenData ? d.token_count : d.message_count

  const maxBarValue = Math.max(...dailyActivity.map(getBarValue), 1)
  const dayCount = dailyActivity.length || 1

  // Build sorted agent entries for the proportion bar & legend
  const agentEntries = Object.entries(agentsUsed)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)

  const agentTotal = agentEntries.reduce((sum, [, count]) => sum + count, 0)

  // Compute active days / total days
  const activeDays = dailyActivity.filter((d) => getBarValue(d) > 0).length
  const totalValue = dailyActivity.reduce((sum, d) => sum + getBarValue(d), 0)
  const avgPerDay = activeDays > 0 ? Math.round(totalValue / activeDays) : 0

  // SVG dimensions
  const viewBoxWidth = 600
  const barAreaHeight = 60
  const labelAreaHeight = 14
  const segmentBarHeight = 6
  const gap = 6
  const svgHeight = barAreaHeight + gap + labelAreaHeight + gap + segmentBarHeight

  const barGap = 1
  const barWidth = Math.max((viewBoxWidth - barGap * (dayCount - 1)) / dayCount, 1)

  function barAgentForDay(dayIndex: number): string {
    if (agentEntries.length === 0) return 'default'
    if (agentEntries.length === 1) return agentEntries[0][0]
    const idx = dayIndex % agentEntries.length
    return agentEntries[idx][0]
  }

  function barColorForDay(dayIndex: number): string {
    return readAgentColor(barAgentForDay(dayIndex))
  }

  function buildSegments(): { agent: string; width: number; x: number; color: string; pct: number }[] {
    if (agentTotal === 0) return []
    let xOffset = 0
    return agentEntries.map(([agent, count]) => {
      const pct = Math.round((count / agentTotal) * 100)
      const width = (count / agentTotal) * viewBoxWidth
      const segment = {
        agent,
        width,
        x: xOffset,
        color: readAgentColor(agent),
        pct,
      }
      xOffset += width
      return segment
    })
  }

  const segments = buildSegments()

  // Compute date label positions (show ~6-8 evenly spaced labels)
  const labelStep = Math.max(1, Math.floor(dayCount / 7))
  const dateLabels: { x: number; label: string }[] = []
  for (let i = 0; i < dayCount; i += labelStep) {
    if (dailyActivity[i]) {
      dateLabels.push({
        x: i * (barWidth + barGap) + barWidth / 2,
        label: formatDate(dailyActivity[i].date),
      })
    }
  }

  // Label: tokens or messages
  const metricName = hasTokenData ? 'tokens' : 'messages'
  const metricTotal = hasTokenData && totalTokens
    ? formatCount(totalTokens)
    : totalMessages
      ? formatCount(totalMessages)
      : '0'

  return (
    <div
      data-testid="activity-timeline"
      className="w-full rounded-xl"
    >
      {/* Header row */}
      <div className="flex items-baseline justify-between px-1 pb-2">
        <div className="flex items-baseline gap-3">
          <span className="text-sm font-medium text-foreground">Activity</span>
          <span className="text-xs text-muted-foreground">
            {metricTotal} {metricName}
          </span>
        </div>
        <div className="flex items-baseline gap-3 text-xs text-muted-foreground">
          <span>{activeDays} active days</span>
          <span>avg {formatCount(avgPerDay)}/{hasTokenData ? 'day' : 'day'}</span>
        </div>
      </div>

      {/* SVG chart */}
      <div>
        <svg
          viewBox={`0 0 ${viewBoxWidth} ${svgHeight}`}
          width="100%"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* Histogram bars */}
          {dailyActivity.map((day, i) => {
            const barValue = getBarValue(day)
            const height = barValue > 0
              ? Math.max((barValue / maxBarValue) * barAreaHeight, 2)
              : 0
            const x = i * (barWidth + barGap)
            const y = barAreaHeight - height
            return (
              <rect
                key={day.date}
                data-date={day.date}
                x={x}
                y={y}
                width={barWidth}
                height={height}
                rx={1}
                fill={barColorForDay(i)}
                opacity={barValue > 0
                  ? (selectedAgent == null || selectedAgent === barAgentForDay(i) ? 0.85 : 0.15)
                  : 0.15}
                style={barValue > 0 ? { cursor: 'pointer' } : undefined}
                onMouseEnter={barValue > 0 ? (e) => {
                  const label = formatDate(day.date)
                  const detail = hasTokenData
                    ? `${formatCount(day.token_count)} tokens (${formatCount(day.message_count)} msgs)`
                    : `${formatCount(day.message_count)} messages`
                  tooltip.show(e, `${label} \u2014 ${detail}`)
                } : undefined}
                onMouseLeave={barValue > 0 ? () => tooltip.hide() : undefined}
              />
            )
          })}

          {/* Date labels */}
          {dateLabels.map((dl) => (
            <text
              key={dl.label}
              x={dl.x}
              y={barAreaHeight + gap + labelAreaHeight - 2}
              textAnchor="middle"
              fill="currentColor"
              className="text-muted-foreground"
              fontSize={8}
              opacity={0.6}
            >
              {dl.label}
            </text>
          ))}

          {/* Agent proportion segment bar */}
          {segments.map((seg, i) => (
            <rect
              key={seg.agent}
              className="agent-segment"
              data-agent={seg.agent}
              x={seg.x}
              y={barAreaHeight + gap + labelAreaHeight + gap}
              width={seg.width}
              height={segmentBarHeight}
              fill={seg.color}
              opacity={selectedAgent != null && selectedAgent !== seg.agent ? 0.2 : 1}
              rx={i === 0 ? 3 : i === segments.length - 1 ? 3 : 0}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e) => tooltip.show(e, `${seg.agent} \u2014 ${seg.pct}%`)}
              onMouseLeave={() => tooltip.hide()}
              onClick={() => onAgentClick?.(seg.agent)}
            />
          ))}
        </svg>
      </div>

      {/* Agent legend */}
      {segments.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-3 px-1">
          {segments.map((seg) => (
            <button
              type="button"
              key={seg.agent}
              className={`inline-flex items-center gap-1.5 text-xs cursor-pointer transition-opacity ${
                selectedAgent != null && selectedAgent !== seg.agent ? 'opacity-50 text-muted-foreground' : 'text-muted-foreground'
              } ${selectedAgent === seg.agent ? 'font-semibold !text-foreground' : ''}`}
              onClick={() => onAgentClick?.(seg.agent)}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: seg.color }}
              />
              {seg.agent} {seg.pct}%
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
