import React from 'react'
import { Button } from '@/components/ui/button'
import { Terminal, X } from 'lucide-react'

export interface SessionRow {
  id: string
  agent: string
  working_dir?: string
  created_at: number
}

interface Props {
  sessions: SessionRow[]
  onTerminateAll: () => void
  onSendQuit: (id: string) => void
  onTerminateSession: (id: string) => void
  onClose: () => void
}

export function SessionManagementPanel({ sessions, onTerminateAll, onSendQuit, onTerminateSession, onClose }: Props) {
  return (
    <div className="border-b bg-background p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">Active CLI Sessions</h3>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onTerminateAll}
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            >
              Terminate All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 p-0"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <Terminal className="h-4 w-4" />
                <div>
                  <div className="font-medium text-sm">{session.agent}</div>
                  <div className="text-xs text-muted-foreground">
                    Created: {new Date(session.created_at * 1000).toLocaleTimeString()}
                    {session.working_dir && (
                      <span className="ml-2">• {session.working_dir.split('/').pop()}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSendQuit(session.id)}
                  className="h-6 px-2 text-xs"
                >
                  Send Quit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onTerminateSession(session.id)}
                  className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                >
                  Force Kill
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
