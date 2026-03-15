import { Activity, Coins, Clock, Flame, Bot } from 'lucide-react'
import { readAgentColor, readDashboardToken } from '@/lib/dashboard-palettes'
import { useChartTooltip } from '@/hooks/useChartTooltip'

export interface MetricsStripProps {
  totalSessions: number
  totalTokens: number
  totalMessages: number
  timeSavedMinutes: number
  currentStreak: number
  longestStreak: number
  agentsUsed: Record<string, number>
  dailyActivity: { date: string; message_count: number; token_count: number }[]
  /** Pass palette key to trigger re-render on palette change */
  paletteKey?: string
  selectedAgent?: string | null
}

// ── Formatting helpers ──────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function formatTokens(n: number): string {
  if (n === 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return `${n}`
}

function formatTime(minutes: number): string {
  if (minutes === 0) return '0m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (m === 0) return `~${h}h`
  return `~${h}h ${m}m`
}

function shortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Tooltip-aware sparkline types ───────────────────────────────────

type TooltipFns = { show: (e: React.MouseEvent, content: string) => void; hide: () => void }

// ── Sparkline helpers ───────────────────────────────────────────────

const SPARK_W = 60
const SPARK_H = 20
const SESSION_SPARK_FALLBACK = '#3b82f6'
const TIME_SPARK_FALLBACK = '#eab308'
const STREAK_SPARK_FALLBACK = '#f97316'
const EMPTY_SPARK_FALLBACK = '#334155'

function lastN<T>(arr: T[], n: number): T[] {
  return arr.slice(-n)
}

/** Bar chart sparkline (Sessions) */
function BarSparkline({ data, labels, tt }: { data: number[]; labels?: string[]; tt?: TooltipFns }) {
  if (data.length === 0) {
    return <EmptySparkline />
  }
  const max = Math.max(...data, 1)
  const barW = SPARK_W / data.length - 1
  return (
    <svg className="metric-sparkline" width={SPARK_W} height={SPARK_H} aria-hidden="true">
      {data.map((v, i) => {
        const h = (v / max) * SPARK_H
        const label = labels?.[i] ?? `${i + 1}`
        return (
          <rect
            key={i}
            x={i * (barW + 1)}
            y={SPARK_H - h}
            width={barW}
            height={h}
            fill={readDashboardToken('--dashboard-spark-session', SESSION_SPARK_FALLBACK)}
            rx={1}
            style={tt ? { cursor: 'pointer' } : undefined}
            onMouseEnter={tt ? (e) => tt.show(e, `${label} \u2014 ${formatNumber(v)}`) : undefined}
            onMouseLeave={tt ? () => tt.hide() : undefined}
          />
        )
      })}
    </svg>
  )
}

/** Stacked horizontal bar (Tokens by agent) */
function StackedBarSparkline({ agents, tt, selectedAgent }: { agents: Record<string, number>; tt?: TooltipFns; selectedAgent?: string | null }) {
  const entries = Object.entries(agents)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (total === 0) {
    return <EmptySparkline />
  }
  let x = 0
  return (
    <svg className="metric-sparkline" width={SPARK_W} height={SPARK_H} aria-hidden="true">
      {entries.map(([name, value]) => {
        const w = (value / total) * SPARK_W
        const rect = (
          <rect
            key={name}
            x={x}
            y={4}
            width={w}
            height={SPARK_H - 8}
            fill={readAgentColor(name)}
            opacity={selectedAgent != null && selectedAgent !== name ? 0.15 : 1}
            rx={2}
            style={tt ? { cursor: 'pointer' } : undefined}
            onMouseEnter={tt ? (e) => tt.show(e, `${name} \u2014 ${formatTokens(value)} tokens`) : undefined}
            onMouseLeave={tt ? () => tt.hide() : undefined}
          />
        )
        x += w
        return rect
      })}
    </svg>
  )
}

/** Line sparkline (Time Saved trend) — overlay rects for per-point hover */
function LineSparkline({ data, labels, tt }: { data: number[]; labels?: string[]; tt?: TooltipFns }) {
  if (data.length === 0) {
    return <EmptySparkline />
  }
  const max = Math.max(...data, 1)
  const points = data
    .map((v, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * SPARK_W
      const y = SPARK_H - (v / max) * SPARK_H
      return `${x},${y}`
    })
    .join(' ')
  const segW = SPARK_W / data.length
  return (
    <svg className="metric-sparkline" width={SPARK_W} height={SPARK_H} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={readDashboardToken('--dashboard-spark-time', TIME_SPARK_FALLBACK)}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {tt && data.map((v, i) => {
        const label = labels?.[i] ?? `${i + 1}`
        return (
          <rect
            key={i}
            x={i * segW}
            y={0}
            width={segW}
            height={SPARK_H}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => tt.show(e, `${label} \u2014 ${formatNumber(v)} msgs`)}
            onMouseLeave={() => tt.hide()}
          />
        )
      })}
    </svg>
  )
}

/** Pulse bars (Streak: filled if active, muted otherwise) */
function PulseSparkline({ data, labels, tt }: { data: boolean[]; labels?: string[]; tt?: TooltipFns }) {
  if (data.length === 0) {
    return <EmptySparkline />
  }
  const barW = SPARK_W / data.length - 1
  return (
    <svg className="metric-sparkline" width={SPARK_W} height={SPARK_H} aria-hidden="true">
      {data.map((active, i) => {
        const label = labels?.[i] ?? `${i + 1}`
        return (
          <rect
            key={i}
            x={i * (barW + 1)}
            y={4}
            width={barW}
            height={SPARK_H - 8}
            fill={active
              ? readDashboardToken('--dashboard-spark-streak', STREAK_SPARK_FALLBACK)
              : readDashboardToken('--dashboard-spark-empty', EMPTY_SPARK_FALLBACK)}
            rx={1}
            style={tt ? { cursor: 'pointer' } : undefined}
            onMouseEnter={tt ? (e) => tt.show(e, `${label} \u2014 ${active ? 'Active' : 'Inactive'}`) : undefined}
            onMouseLeave={tt ? () => tt.hide() : undefined}
          />
        )
      })}
    </svg>
  )
}

/** Colored block segments (Agent Mix) */
function BlockSparkline({ agents, tt, selectedAgent }: { agents: Record<string, number>; tt?: TooltipFns; selectedAgent?: string | null }) {
  const entries = Object.entries(agents)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  if (total === 0) {
    return <EmptySparkline />
  }
  let x = 0
  return (
    <svg className="metric-sparkline" width={SPARK_W} height={SPARK_H} aria-hidden="true">
      {entries.map(([name, value]) => {
        const pct = Math.round((value / total) * 100)
        const w = (value / total) * SPARK_W
        const rect = (
          <rect
            key={name}
            x={x}
            y={2}
            width={w}
            height={SPARK_H - 4}
            fill={readAgentColor(name)}
            opacity={selectedAgent != null && selectedAgent !== name ? 0.15 : 1}
            rx={2}
            style={tt ? { cursor: 'pointer' } : undefined}
            onMouseEnter={tt ? (e) => tt.show(e, `${name} \u2014 ${pct}%`) : undefined}
            onMouseLeave={tt ? () => tt.hide() : undefined}
          />
        )
        x += w
        return rect
      })}
    </svg>
  )
}

/** Empty placeholder sparkline for zero-state */
function EmptySparkline() {
  return (
    <svg className="metric-sparkline" width={SPARK_W} height={SPARK_H} aria-hidden="true">
      <line
        x1={0}
        y1={SPARK_H / 2}
        x2={SPARK_W}
        y2={SPARK_H / 2}
        stroke={readDashboardToken('--dashboard-spark-empty', EMPTY_SPARK_FALLBACK)}
        strokeWidth={1}
        strokeDasharray="3,3"
      />
    </svg>
  )
}

// ── Main component ──────────────────────────────────────────────────

export function MetricsStrip({
  totalSessions,
  totalTokens,
  totalMessages,
  timeSavedMinutes,
  currentStreak,
  agentsUsed,
  dailyActivity,
  paletteKey,
  selectedAgent,
}: MetricsStripProps) {
  const tooltip = useChartTooltip()
  const tt: TooltipFns = { show: tooltip.show, hide: tooltip.hide }

  const last7 = lastN(dailyActivity, 7)
  const messageCounts = last7.map((d) => d.message_count)
  const dateLabels = last7.map((d) => shortDate(d.date))
  const activeDays = last7.map((d) => d.message_count > 0)
  const agentCount = Object.keys(agentsUsed).length

  // Use tokens if available, otherwise show messages as the second metric
  const hasTokens = totalTokens > 0

  const widgets: {
    icon: React.ReactNode
    label: string
    value: string
    sparkline: React.ReactNode
  }[] = [
    {
      icon: <Activity className="h-3.5 w-3.5" />,
      label: 'Sessions',
      value: formatNumber(totalSessions),
      sparkline: <BarSparkline data={messageCounts} labels={dateLabels} tt={tt} />,
    },
    hasTokens
      ? {
          icon: <Coins className="h-3.5 w-3.5" />,
          label: 'Tokens',
          value: formatTokens(totalTokens),
          sparkline: <StackedBarSparkline agents={agentsUsed} tt={tt} selectedAgent={selectedAgent} />,
        }
      : {
          icon: <Coins className="h-3.5 w-3.5" />,
          label: 'Messages',
          value: formatNumber(totalMessages),
          sparkline: <BarSparkline data={messageCounts} labels={dateLabels} tt={tt} />,
        },
    {
      icon: <Clock className="h-3.5 w-3.5" />,
      label: 'Time Saved',
      value: formatTime(timeSavedMinutes),
      sparkline: <LineSparkline data={messageCounts} labels={dateLabels} tt={tt} />,
    },
    {
      icon: <Flame className="h-3.5 w-3.5" />,
      label: 'Streak',
      value: `${currentStreak} days`,
      sparkline: <PulseSparkline data={activeDays} labels={dateLabels} tt={tt} />,
    },
    {
      icon: <Bot className="h-3.5 w-3.5" />,
      label: 'Agent Mix',
      value: `${agentCount} active`,
      sparkline: <BlockSparkline agents={agentsUsed} tt={tt} selectedAgent={selectedAgent} />,
    },
  ]

  return (
    <div
      data-testid="metrics-strip"
      className="flex flex-wrap gap-3 rounded-xl p-3"
    >
      {widgets.map((w) => (
        <div key={w.label} className="flex min-w-[120px] flex-1 items-center gap-3 rounded-lg px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {w.icon}
              <span className="text-[10px] uppercase tracking-wider">{w.label}</span>
            </div>
            <span className="text-lg font-semibold text-foreground">{w.value}</span>
          </div>
          <div className="ml-auto">{w.sparkline}</div>
        </div>
      ))}
    </div>
  )
}
