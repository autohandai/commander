import type { ToolEvent } from './hooks/useAutohandSession'

interface ToolEventBadgeProps {
  event: ToolEvent
}

const PHASE_ICONS: Record<string, string> = {
  start: '\u{1F527}',
  update: '\u{23F3}',
  end: '\u{2705}',
}

export function ToolEventBadge({ event }: ToolEventBadgeProps) {
  const icon = PHASE_ICONS[event.phase] || '\u{1F527}'
  const isComplete = event.phase === 'end'
  const failed = isComplete && event.success === false

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-mono ${
        failed
          ? 'border-destructive/30 bg-destructive/10 text-destructive'
          : isComplete
            ? 'border-border bg-muted/50 text-muted-foreground'
            : 'border-primary/20 bg-primary/5 text-primary'
      }`}
    >
      <span>{icon}</span>
      <span className="font-medium">{event.tool_name}</span>
      {event.args?.path != null && (
        <span className="text-muted-foreground truncate max-w-[200px]">
          {String(event.args.path)}
        </span>
      )}
      {event.duration_ms != null && (
        <span className="text-muted-foreground ml-auto">
          {(event.duration_ms / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  )
}
