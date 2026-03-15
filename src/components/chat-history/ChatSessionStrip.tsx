import { Plus } from 'lucide-react'
import type { ChatSessionInfo } from './useChatSessions'

function sessionTitle(s: ChatSessionInfo): string {
  return s.custom_title || s.ai_summary || s.summary || 'Untitled'
}

interface ChatSessionStripProps {
  sessions: ChatSessionInfo[]
  onSelect: (sessionId: string) => void
  onNewChat: () => void
}

export function ChatSessionStrip({ sessions, onSelect, onNewChat }: ChatSessionStripProps) {
  const recent = sessions.slice(0, 4)
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-1 border-b bg-background">
      <button
        onClick={onNewChat}
        className="flex items-center gap-1 shrink-0 rounded-md border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50"
      >
        <Plus className="h-3 w-3" /> New
      </button>
      {recent.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className="shrink-0 truncate max-w-[140px] rounded-md border px-2 py-0.5 text-xs hover:bg-accent/50"
          title={sessionTitle(s)}
        >
          {sessionTitle(s)}
        </button>
      ))}
    </div>
  )
}
