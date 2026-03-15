import { useState } from 'react'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { useSettings } from '@/contexts/settings-context'
import { SessionScatterChart } from './SessionScatterChart'
import { KnowledgeBaseChart } from './KnowledgeBaseChart'
import { MetricsStrip } from './MetricsStrip'
import { ActivityTimeline } from './ActivityTimeline'
import { Terminal, Download } from 'lucide-react'

interface DashboardViewProps {
  timeSavedMultiplier: number
  days: number
  onDaysChange: (days: number) => void
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="h-64 rounded-xl bg-muted/50" />
      <div className="flex gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 flex-1 rounded-xl bg-muted/50" />
        ))}
      </div>
      <div className="h-14 rounded-xl bg-muted/50" />
    </div>
  )
}

const AGENT_INSTALL_HINTS: Record<string, { label: string; url: string }> = {
  claude: { label: 'Claude Code', url: 'https://docs.anthropic.com/en/docs/claude-code' },
  codex: { label: 'Codex CLI', url: 'https://github.com/openai/codex' },
  gemini: { label: 'Gemini CLI', url: 'https://github.com/google-gemini/gemini-cli' },
}

function EmptyState({ availableAgents }: { availableAgents: { name: string; available: boolean }[] }) {
  const installed = availableAgents.filter(a => a.available)
  const notInstalled = availableAgents.filter(a => !a.available && AGENT_INSTALL_HINTS[a.name])

  return (
    <div className="rounded-xl border border-border bg-card/70 p-6 shadow-sm">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="rounded-full border border-border bg-muted/50 p-3">
          <Terminal className="h-6 w-6 text-foreground/70" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">
            {installed.length > 0
              ? 'Indexing your activity...'
              : 'Get started with AI coding agents'}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            {installed.length > 0
              ? 'Commander is scanning your agent data. Stats will appear here shortly.'
              : 'Install a CLI coding agent and start a session. Commander will automatically track your activity.'}
          </p>
        </div>

        {installed.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {installed.map(a => (
              <span key={a.name} className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-600 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {a.name}
              </span>
            ))}
          </div>
        )}

        {notInstalled.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {notInstalled.map(a => (
              <a
                key={a.name}
                href={AGENT_INSTALL_HINTS[a.name]?.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Download className="h-3 w-3" />
                {AGENT_INSTALL_HINTS[a.name]?.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function DashboardView({ timeSavedMultiplier, days, onDaysChange }: DashboardViewProps) {
  const { stats, loading, error } = useDashboardStats(days)
  const { settings } = useSettings()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const handleAgentClick = (agent: string) =>
    setSelectedAgent(prev => prev === agent ? null : agent)

  if (loading) {
    return <LoadingSkeleton />
  }

  if (error) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
        Failed to load dashboard: {error}
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const hasData = stats.total_messages > 0 || stats.total_sessions > 0
  const showActivity = settings.show_dashboard_activity ?? hasData
  const chartType = settings.dashboard_chart_type ?? 'scatter'

  // New user or no data yet: show empty state
  if (!hasData) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Dashboard</h2>
        </div>
        <EmptyState availableAgents={stats.available_agents} />
      </div>
    )
  }

  const timeSavedMinutes = Math.round(stats.total_messages * timeSavedMultiplier)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <select
          value={days}
          onChange={(e) => onDaysChange(Number(e.target.value))}
          className="rounded-lg border border-border bg-background px-2.5 py-1 text-sm text-foreground shadow-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {showActivity && (
        <>
          <div className="rounded-xl p-4">
            {chartType === 'knowledge-base' ? (
              <KnowledgeBaseChart
                dailyActivity={stats.daily_activity}
                agentsUsed={stats.agents_used}
                paletteKey={settings.dashboard_color_palette}
                selectedAgent={selectedAgent}
                onAgentClick={handleAgentClick}
              />
            ) : (
              <SessionScatterChart
                dailyActivity={stats.daily_activity}
                agentsUsed={stats.agents_used}
                paletteKey={settings.dashboard_color_palette}
                selectedAgent={selectedAgent}
                onAgentClick={handleAgentClick}
              />
            )}
          </div>

          <MetricsStrip
            totalSessions={stats.total_sessions}
            totalTokens={stats.total_tokens}
            totalMessages={stats.total_messages}
            timeSavedMinutes={timeSavedMinutes}
            currentStreak={stats.current_streak}
            longestStreak={stats.longest_streak}
            agentsUsed={stats.agents_used}
            dailyActivity={stats.daily_activity}
            paletteKey={settings.dashboard_color_palette}
            selectedAgent={selectedAgent}
          />

          <ActivityTimeline
            dailyActivity={stats.daily_activity}
            agentsUsed={stats.agents_used}
            totalTokens={stats.total_tokens}
            totalMessages={stats.total_messages}
            paletteKey={settings.dashboard_color_palette}
            selectedAgent={selectedAgent}
            onAgentClick={handleAgentClick}
          />
        </>
      )}
    </div>
  )
}
