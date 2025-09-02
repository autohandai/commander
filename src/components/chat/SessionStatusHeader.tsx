import React from 'react'
import { Activity, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CLISessionLike {
  id: string
  agent: string
}

interface SessionStatusLike {
  active_sessions: CLISessionLike[]
  total_sessions: number
}

interface SessionStatusHeaderProps {
  sessionStatus: SessionStatusLike
  showSessionPanel: boolean
  onTogglePanel: () => void
}

export function SessionStatusHeader({ sessionStatus, showSessionPanel, onTogglePanel }: SessionStatusHeaderProps) {
  if (!sessionStatus || sessionStatus.total_sessions <= 0) return null
  const extra = Math.max(0, sessionStatus.total_sessions - 3)
  return (
    <div className="border-b bg-muted/30 px-6 py-2">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">
            {sessionStatus.total_sessions} Active Session{sessionStatus.total_sessions !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            {sessionStatus.active_sessions.slice(0, 3).map((session) => (
              <div key={session.id} className="flex items-center gap-1 px-2 py-1 bg-background rounded text-xs">
                <Terminal className="h-3 w-3" />
                <span>{session.agent}</span>
              </div>
            ))}
            {extra > 0 && (
              <span className="text-xs text-muted-foreground">+{extra} more</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onTogglePanel} className="h-6 px-2 text-xs">
            {showSessionPanel ? 'Hide' : 'Manage'} Sessions
          </Button>
        </div>
      </div>
    </div>
  )
}

