import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SessionActionMenu } from './SessionActionMenu'
import type { ChatSessionInfo } from './useChatSessions'

function sessionTitle(s: ChatSessionInfo): string {
  return s.custom_title || s.ai_summary || s.summary || 'Untitled'
}

interface ChatSessionSidebarProps {
  sessions: ChatSessionInfo[]
  loading: boolean
  onSelect: (sessionId: string) => void
  onClose: () => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onRename: (id: string) => void
  onFork: (id: string) => void
  onCompact: (id: string) => void
  onSummarizeAI: (id: string) => void
  onDelete: (id: string) => void
}

export function ChatSessionSidebar({
  sessions, loading, onSelect, onClose,
  onArchive, onUnarchive, onRename, onFork, onCompact, onSummarizeAI, onDelete,
}: ChatSessionSidebarProps) {
  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-medium text-muted-foreground">Chats</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} aria-label="Close chat history">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-4 text-xs text-muted-foreground text-center">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">No chat sessions yet</div>
        ) : (
          <div className="py-1">
            {sessions.map(session => (
              <div
                key={session.id}
                className={`group flex items-center gap-1 px-4 py-2.5 cursor-pointer hover:bg-accent/50 ${session.source === 'indexed' ? 'opacity-80' : ''}`}
                onClick={() => onSelect(session.id)}
              >
                <span className="flex-1 truncate text-sm text-foreground">{sessionTitle(session)}</span>
                <SessionActionMenu
                  sessionId={session.id}
                  archived={session.archived}
                  readOnly={session.source === 'indexed'}
                  onArchive={onArchive}
                  onUnarchive={onUnarchive}
                  onRename={onRename}
                  onFork={onFork}
                  onCompact={onCompact}
                  onSummarizeAI={onSummarizeAI}
                  onDelete={onDelete}
                />
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
